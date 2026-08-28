"""Vistas de Asistencia.

Dos APIs bien separadas:

- **Agentes** (`agente/…`): token de máquina `Bearer asist_…`, sin usuario.
  Reciben fichadas en lote (idempotente), heartbeat y entregan la config
  remota que administra el superadmin desde la interfaz.
- **Gestión** (todo lo demás): SOLO superadministrador, como Auditoría.
"""
import calendar
from collections import Counter
from datetime import date, datetime, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from empleados.models import Empleado
from inventario.models import Sucursal
from usuarios.permissions import EsSuperadministrador

from . import jornada as jornada_mod
from .authentication import AgenteTokenAuthentication, EsAgenteAutenticado
from .models import (
    CATALOGO_INCONSISTENCIAS,
    Agente,
    AsignacionSucursal,
    AsignacionTurno,
    ControlSucursal,
    Dispositivo,
    EstadoInconsistencia,
    EstadoMapeo,
    Feriado,
    Fichada,
    JustificacionInconsistencia,
    Licencia,
    MapeoEmpleado,
    MetodoVerificacion,
    ReglaInconsistencia,
    Severidad,
    TipoFichada,
    TipoFeriado,
    TipoInconsistencia,
    Turno,
    aplicar_mapeo,
    elegir_asignacion_sucursal,
    hash_evento,
    resolver_mapeos,
    resolver_reglas,
    sembrar_reglas,
    sucursales_con_reloj,
    sucursales_controladas,
    sucursales_sin_control,
)
from .serializers import (
    AgenteSerializer,
    AsignacionSucursalSerializer,
    AsignacionTurnoSerializer,
    JustificacionSerializer,
    ReglaInconsistenciaSerializer,
    DispositivoSerializer,
    EventoAgenteSerializer,
    FeriadoSerializer,
    HeartbeatSerializer,
    LicenciaSerializer,
    MapeoEmpleadoSerializer,
    TurnoSerializer,
)

MAX_EVENTOS_POR_LOTE = 500


# --- Helpers (mismo patrón que auditoria/documentos) -------------------------

def _entero(params, clave, defecto, minimo, maximo):
    try:
        valor = int(params.get(clave, defecto))
    except (TypeError, ValueError):
        return defecto
    return max(minimo, min(maximo, valor))


def _fecha_local(texto):
    """`aaaa-mm-dd` → datetime aware al inicio de ese día local (o None)."""
    if not texto:
        return None
    try:
        naive = datetime.strptime(str(texto), '%Y-%m-%d')
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(naive)


def _id(params, clave):
    """Id numérico de un query param (o None si falta o es basura)."""
    try:
        return int(params.get(clave, ''))
    except (TypeError, ValueError):
        return None


def _es_de_la_sucursal(jornada, sucursal_id):
    """Si esa jornada le interesa a una sucursal.

    Le interesa por dos motivos distintos: porque esa persona tenia que estar
    ahi, o porque ficho ahi. Con gente que rota, una misma jornada puede caer
    en las dos vistas — y esa es justamente la que hay que mirar.
    """
    esperada = jornada.get('sucursal_esperada')
    if esperada and esperada['id'] == sucursal_id:
        return True
    return any(s['id'] == sucursal_id for s in jornada.get('sucursales_fichadas', ()))


def _se_controla(esperada, controladas) -> bool:
    """Si a esa sucursal se le exige fichar ese dia.

    Son dos motivos distintos para no evaluar un dia, y se arreglan distinto:
    la sucursal no tiene reloj (no se le puede pedir una marca a quien no tiene
    donde marcarla) o alguien la excluyo a mano desde Configuracion. En los dos
    casos el dia se muestra pero no se juzga.

    Cuando no se sabe donde le tocaba estar a la persona, se evalua igual: es
    como venia funcionando y no hay motivo para dejar de mirar.
    """
    if not esperada:
        return True
    return esperada['id'] in controladas


def _aplicar_justificaciones(resultados, desde, hasta):
    """Le pega a cada inconsistencia lo que alguien haya decidido sobre ella.

    Las inconsistencias se recalculan siempre; lo unico guardado es su
    resolucion, identificada por (empleado, fecha, tipo). Por eso cambiar un
    umbral no deja pendientes viejos dando vueltas: lo que ya se justifico
    sigue justificado, y lo que dejo de ser inconsistencia desaparece.
    """
    guardadas = {}
    justificaciones = (
        JustificacionInconsistencia.objects
        .filter(fecha__gte=desde, fecha__lte=hasta)
        .select_related('actualizado_por')
    )
    for fila in justificaciones:
        clave = f"{fila.empleado_id}|{fila.fecha.isoformat()}|{fila.tipo}"
        guardadas[clave] = fila

    for jornada in resultados:
        for inc in jornada['inconsistencias']:
            resuelta = guardadas.get(inc['clave'])
            if resuelta is None:
                continue
            inc['estado'] = resuelta.estado
            inc['motivo'] = resuelta.motivo
            inc['resuelta_por'] = str(resuelta.actualizado_por or '')
        jornada['pendientes'] = sum(
            1 for i in jornada['inconsistencias']
            if i['requiere_justificacion'] and i['estado'] == 'pendiente'
        )


def _inicio_de_hoy():
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


# =============================================================================
# API DE AGENTES (token de máquina)
# =============================================================================

class _BaseAgenteView(APIView):
    authentication_classes = [AgenteTokenAuthentication]
    permission_classes = [EsAgenteAutenticado]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'agente'


class AgenteEventosBulkView(_BaseAgenteView):
    """Recepción idempotente de fichadas en lote (spec §15/§7).

    Respuesta por evento vía `uid` del agente: accepted / duplicate / rejected.
    Reenviar el mismo lote N veces deja exactamente las mismas filas.
    """

    def post(self, request):
        agente = request.auth
        dispositivo = agente.dispositivo

        eventos = request.data.get('events')
        if not isinstance(eventos, list):
            return Response({'detail': 'Falta la lista `events`.'}, status=400)
        if len(eventos) > MAX_EVENTOS_POR_LOTE:
            return Response(
                {'detail': f'Máximo {MAX_EVENTOS_POR_LOTE} eventos por lote.'}, status=400
            )

        resultados = []
        validos = []
        for crudo in eventos:
            serializer = EventoAgenteSerializer(data=crudo if isinstance(crudo, dict) else {})
            if serializer.is_valid():
                datos = serializer.validated_data
                datos['hash'] = hash_evento(
                    dispositivo.id,
                    datos['source_event_id'],
                    datos['employee_number'],
                    datos['occurred_at'],
                    datos['event_type'],
                    datos['verification_method'],
                )
                validos.append(datos)
            else:
                uid = ''
                if isinstance(crudo, dict):
                    uid = str(crudo.get('uid') or '')[:64]
                detalle = '; '.join(
                    f'{campo}: {" ".join(str(e) for e in errores)}'
                    for campo, errores in serializer.errors.items()
                )
                resultados.append({'uid': uid, 'status': 'rejected', 'error': detalle[:300]})

        # Duplicados ya persistidos (por hash canónico o por id del reloj).
        hashes = [d['hash'] for d in validos]
        origenes = [d['source_event_id'] for d in validos if d['source_event_id']]
        existentes_hash = set(
            Fichada.objects.filter(dispositivo=dispositivo, hash_evento__in=hashes)
            .values_list('hash_evento', flat=True)
        )
        existentes_origen = set(
            Fichada.objects.filter(dispositivo=dispositivo, origen_id__in=origenes)
            .values_list('origen_id', flat=True)
        ) if origenes else set()

        mapa_empleados = resolver_mapeos(
            dispositivo.id, {d['employee_number'] for d in validos}
        )

        vistos = set()
        aceptados = duplicados = 0
        for datos in validos:
            clave = datos['hash']
            es_duplicado = (
                clave in existentes_hash
                or clave in vistos
                or (datos['source_event_id'] and datos['source_event_id'] in existentes_origen)
            )
            if es_duplicado:
                duplicados += 1
                resultados.append({'uid': datos['uid'], 'status': 'duplicate'})
                continue
            empleado_id = mapa_empleados.get(datos['employee_number'])
            try:
                with transaction.atomic():
                    Fichada.objects.create(
                        dispositivo=dispositivo,
                        agente=agente,
                        empleado_id=empleado_id,
                        estado_mapeo=(
                            EstadoMapeo.MAPEADA if empleado_id else EstadoMapeo.SIN_MAPEAR
                        ),
                        numero_reloj=datos['employee_number'],
                        nombre_reloj=datos['employee_name'],
                        ocurrida_en=datos['occurred_at'],
                        tipo=datos['event_type'],
                        metodo=datos['verification_method'],
                        origen_id=datos['source_event_id'],
                        hash_evento=clave,
                        raw_payload=datos.get('raw') or {},
                    )
            except IntegrityError:
                duplicados += 1
                resultados.append({'uid': datos['uid'], 'status': 'duplicate'})
                continue
            vistos.add(clave)
            if datos['source_event_id']:
                existentes_origen.add(datos['source_event_id'])
            aceptados += 1
            resultados.append({'uid': datos['uid'], 'status': 'accepted'})

        version = str(request.data.get('agent_version') or '')[:20]
        if version and version != agente.version:
            Agente.todos.filter(pk=agente.pk).update(version=version)

        rechazados = len(resultados) - aceptados - duplicados
        return Response(
            {
                'accepted': aceptados,
                'duplicates': duplicados,
                'rejected': rechazados,
                'results': resultados,
            }
        )


class AgenteHeartbeatView(_BaseAgenteView):
    """Estado del agente (spec §30) + entrega de la config remota.

    Se actualiza con `.update()` a propósito: sin señales de auditoría y sin
    tocar `actualizado` (que define la versión de la config remota).
    """

    def post(self, request):
        agente = request.auth
        serializer = HeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        # El agente informa cuantos segundos faltan; se guarda el MOMENTO en que
        # se libera, que es lo que sigue teniendo sentido dentro de un minuto,
        # cuando el panel lo lea.
        faltan = datos.get('device_locked_seconds')
        bloqueado_hasta = (
            timezone.now() + timedelta(seconds=faltan) if faltan else None
        )

        Agente.todos.filter(pk=agente.pk).update(
            ultimo_heartbeat=timezone.now(),
            version=datos['agent_version'][:20],
            hostname=datos['hostname'][:120],
            iniciado_en=datos['started_at'],
            reloj_alcanzable=datos['device_reachable'],
            reloj_error=(datos['device_error'] or '')[:300],
            reloj_bloqueado_hasta=bloqueado_hasta,
            eventos_pendientes=datos['pending_events'],
            eventos_error=datos['error_events'],
            ultima_sync_reloj=datos['last_device_sync_at'],
        )

        info = datos.get('device_info')
        if info:
            cambios = {}
            if info.get('model') and info['model'] != agente.dispositivo.modelo:
                cambios['modelo'] = info['model']
            if info.get('serial_number') and info['serial_number'] != agente.dispositivo.numero_serie:
                cambios['numero_serie'] = info['serial_number']
            if info.get('firmware') and info['firmware'] != agente.dispositivo.firmware:
                cambios['firmware'] = info['firmware']
            if cambios:
                Dispositivo.todos.filter(pk=agente.dispositivo_id).update(**cambios)

        return Response(
            {
                'ok': True,
                'server_time': timezone.now().isoformat(),
                'config': agente.config_remota(),
            }
        )


class AgenteConfigView(_BaseAgenteView):
    """La config remota, también disponible por GET (diagnóstico)."""

    def get(self, request):
        return Response(
            {
                'server_time': timezone.now().isoformat(),
                'config': request.auth.config_remota(),
            }
        )


# =============================================================================
# GESTIÓN (solo superadministrador)
# =============================================================================

class _BaseGestion:
    permission_classes = [EsSuperadministrador]


class DispositivoListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Dispositivo.objects.select_related('sucursal')
    serializer_class = DispositivoSerializer


class DispositivoDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    # El DELETE es borrado lógico: el histórico de fichadas no se pierde.
    queryset = Dispositivo.objects.select_related('sucursal')
    serializer_class = DispositivoSerializer


class DispositivoReintentarView(_BaseGestion, APIView):
    """Pedirle al agente que vuelva a intentar la conexión con el reloj, ya.

    El servidor no puede probar el reloj: vive en la LAN de la sucursal y solo
    la notebook lo alcanza. Lo único que se puede hacer desde acá es dejar la
    marca en la config; el agente la ve en su próximo heartbeat, descarta el
    backoff que venía acumulando y reintenta enseguida en vez de esperar los
    cinco minutos del reintento automático.

    Por eso la respuesta dice CUÁNDO va a pasar y no promete que ya pasó.
    """

    def post(self, request, pk):
        dispositivo = get_object_or_404(Dispositivo, pk=pk)
        agentes = [a for a in dispositivo.agentes.all() if a.activo and not a.borrado]
        en_linea = [a for a in agentes if a.en_linea]

        # Si el reloj se bloqueó a sí mismo, insistir es contraproducente: cada
        # intento reinicia su contador y estira el bloqueo. Acá NO se guarda el
        # pedido, y el agente además lo ignoraría: dos cerrojos para el mismo
        # error, porque se cometió una vez y costó media hora de sucursal.
        bloqueados = [a for a in agentes if a.reloj_bloqueado]
        if bloqueados:
            faltan = max(a.segundos_de_bloqueo for a in bloqueados)
            minutos, segundos = divmod(faltan, 60)
            return Response({
                'reintento_pedido': (
                    dispositivo.reintento_pedido.isoformat()
                    if dispositivo.reintento_pedido else None
                ),
                'hay_agente_en_linea': bool(en_linea),
                'bloqueado': True,
                'segundos_de_bloqueo': faltan,
                'detalle': (
                    f'El reloj tiene el acceso cerrado por su propia protección y se '
                    f'libera en {minutos} min {segundos} s. No se pidió el reintento a '
                    f'propósito: cada intento durante el bloqueo reinicia ese contador '
                    f'y lo alargaría. El agente vuelve a conectarse solo apenas se libere.'
                ),
            }, status=status.HTTP_409_CONFLICT)

        dispositivo.reintento_pedido = timezone.now()
        dispositivo.actualizado_por = request.user
        dispositivo.save(update_fields=['reintento_pedido', 'actualizado_por'])

        if not agentes:
            detalle = (
                'Este reloj todavía no tiene una notebook asignada: creale un '
                'agente en Configuración para que alguien pueda consultarlo.'
            )
        elif not en_linea:
            detalle = (
                'La notebook de la sucursal no está reportando. El pedido queda '
                'guardado y se aplica solo en cuanto vuelva a prenderse.'
            )
        else:
            segundos = max(a.heartbeat_seconds for a in en_linea)
            detalle = (
                f'Pedido enviado. La notebook lo va a tomar en los próximos '
                f'{segundos} segundos y va a reintentar la conexión.'
            )

        return Response({
            'reintento_pedido': dispositivo.reintento_pedido.isoformat(),
            'hay_agente_en_linea': bool(en_linea),
            'bloqueado': False,
            'segundos_de_bloqueo': 0,
            'detalle': detalle,
        })


class AgenteListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Agente.objects.select_related('dispositivo', 'dispositivo__sucursal')
    serializer_class = AgenteSerializer

    def create(self, request, *args, **kwargs):
        """Al crear un agente se genera su token, que se devuelve UNA sola vez."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        usuario = request.user
        agente = Agente(
            **serializer.validated_data, creado_por=usuario, actualizado_por=usuario
        )
        token = agente.asignar_token()
        agente.save()
        datos = self.get_serializer(agente).data
        datos['token'] = token
        return Response(datos, status=status.HTTP_201_CREATED)


class AgenteDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Agente.objects.select_related('dispositivo', 'dispositivo__sucursal')
    serializer_class = AgenteSerializer


class AgenteRegenerarTokenView(_BaseGestion, APIView):
    """Rota el token del agente. El anterior deja de servir al instante."""

    def post(self, request, pk):
        agente = get_object_or_404(Agente.objects, pk=pk)
        token = agente.asignar_token()
        agente.actualizado_por = request.user
        agente.save(update_fields=['token_hash', 'token_prefijo', 'actualizado_por'])
        return Response({'id': agente.pk, 'token': token, 'token_prefijo': agente.token_prefijo})


class MapeoListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = MapeoEmpleado.objects.select_related('empleado', 'dispositivo')
    serializer_class = MapeoEmpleadoSerializer

    def perform_create(self, serializer):
        super().perform_create(serializer)
        # Alta de mapeo = asignación retroactiva inmediata (cero fricción).
        self._aplicadas = aplicar_mapeo(serializer.instance)

    def create(self, request, *args, **kwargs):
        respuesta = super().create(request, *args, **kwargs)
        respuesta.data['fichadas_actualizadas'] = getattr(self, '_aplicadas', 0)
        return respuesta


class MapeoDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = MapeoEmpleado.objects.select_related('empleado', 'dispositivo')
    serializer_class = MapeoEmpleadoSerializer

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._aplicadas = aplicar_mapeo(serializer.instance)

    def update(self, request, *args, **kwargs):
        respuesta = super().update(request, *args, **kwargs)
        respuesta.data['fichadas_actualizadas'] = getattr(self, '_aplicadas', 0)
        return respuesta


class FichadasListView(_BaseGestion, APIView):
    """Listado con filtros y paginación manual (patrón de Auditoría)."""

    def get(self, request):
        params = request.query_params
        fichadas = Fichada.objects.select_related(
            'dispositivo', 'dispositivo__sucursal', 'empleado'
        )

        q = (params.get('q') or '').strip()
        if q:
            fichadas = fichadas.filter(
                Q(numero_reloj__icontains=q)
                | Q(nombre_reloj__icontains=q)
                | Q(empleado__nombre__icontains=q)
                | Q(empleado__apellido__icontains=q)
            )
        if _id(params, 'dispositivo'):
            fichadas = fichadas.filter(dispositivo_id=_id(params, 'dispositivo'))
        if _id(params, 'sucursal'):
            fichadas = fichadas.filter(dispositivo__sucursal_id=_id(params, 'sucursal'))
        if _id(params, 'empleado'):
            fichadas = fichadas.filter(empleado_id=_id(params, 'empleado'))
        if params.get('tipo') in TipoFichada.values:
            fichadas = fichadas.filter(tipo=params['tipo'])
        if params.get('metodo') in MetodoVerificacion.values:
            fichadas = fichadas.filter(metodo=params['metodo'])
        if params.get('mapeo') in EstadoMapeo.values:
            fichadas = fichadas.filter(estado_mapeo=params['mapeo'])
        desde = _fecha_local(params.get('desde'))
        if desde:
            fichadas = fichadas.filter(ocurrida_en__gte=desde)
        hasta = _fecha_local(params.get('hasta'))
        if hasta:
            fichadas = fichadas.filter(ocurrida_en__lt=hasta + timedelta(days=1))

        total = fichadas.count()
        limit = _entero(params, 'limit', 40, 1, 200)
        offset = _entero(params, 'offset', 0, 0, 10_000_000)
        pagina = [self._serializar(f) for f in fichadas[offset:offset + limit]]

        respuesta = {'total': total, 'resultados': pagina}
        if offset == 0:
            hoy = _inicio_de_hoy()
            respuesta['resumen'] = {
                'hoy': Fichada.objects.filter(ocurrida_en__gte=hoy).count(),
                'sin_mapear': Fichada.objects.filter(estado_mapeo=EstadoMapeo.SIN_MAPEAR).count(),
            }
            relojes = list(Dispositivo.objects.select_related('sucursal'))
            respuesta['dispositivos'] = [
                {
                    'id': d.id,
                    'nombre': d.nombre,
                    'sucursal': d.sucursal.nombre,
                    'sucursal_id': d.sucursal_id,
                }
                for d in relojes
            ]
            # Solo las sucursales que tienen algun reloj: una fichada nace en
            # un reloj, asi que filtrar por una sucursal sin ninguno siempre
            # daria vacio. Se incluyen los relojes dados de baja para no
            # esconder el historico de una sucursal que dejo de usarse.
            con_relojes = {d.sucursal_id: d.sucursal.nombre for d in relojes}
            respuesta['sucursales'] = [
                {'id': sid, 'nombre': nombre}
                for sid, nombre in sorted(con_relojes.items(), key=lambda p: p[1])
            ]
        return Response(respuesta)

    @staticmethod
    def _serializar(f):
        return {
            'id': f.id,
            'dispositivo': {'id': f.dispositivo_id, 'nombre': f.dispositivo.nombre},
            'sucursal': {
                'id': f.dispositivo.sucursal_id,
                'nombre': f.dispositivo.sucursal.nombre,
            },
            'numero_reloj': f.numero_reloj,
            'nombre_reloj': f.nombre_reloj,
            'empleado': (
                {'id': f.empleado_id, 'nombre': f.empleado.nombre_completo}
                if f.empleado_id
                else None
            ),
            'estado_mapeo': f.estado_mapeo,
            'ocurrida_en': f.ocurrida_en.isoformat(),
            'tipo': f.tipo,
            'metodo': f.metodo,
            'origen_id': f.origen_id,
        }


class FichadaDetailView(_BaseGestion, APIView):
    """Detalle con el payload ISAPI original (troubleshooting)."""

    def get(self, request, pk):
        f = get_object_or_404(
            Fichada.objects.select_related('dispositivo__sucursal', 'empleado', 'agente'), pk=pk
        )
        datos = FichadasListView._serializar(f)
        datos['recibida_en'] = f.recibida_en.isoformat()
        datos['agente'] = f.agente.nombre if f.agente_id else None
        datos['raw_payload'] = f.raw_payload
        return Response(datos)


class NumerosSinMapearView(_BaseGestion, APIView):
    """Números detectados en fichadas que aún no apuntan a un empleado."""

    def get(self, request):
        filas = (
            Fichada.objects.filter(estado_mapeo=EstadoMapeo.SIN_MAPEAR)
            .exclude(numero_reloj='')
            .values('dispositivo_id', 'dispositivo__nombre', 'numero_reloj')
            .annotate(
                cantidad=Count('id'),
                ultima=Max('ocurrida_en'),
                nombre_reloj=Max('nombre_reloj'),
            )
            .order_by('-ultima')[:200]
        )
        return Response(
            {
                'resultados': [
                    {
                        'dispositivo': {'id': f['dispositivo_id'], 'nombre': f['dispositivo__nombre']},
                        'numero_reloj': f['numero_reloj'],
                        'nombre_reloj': f['nombre_reloj'],
                        'cantidad': f['cantidad'],
                        'ultima': f['ultima'].isoformat(),
                    }
                    for f in filas
                ]
            }
        )


class PanelAsistenciaView(_BaseGestion, APIView):
    """Monitoreo remoto (spec §48): reloj/notebook online, pendientes, últimas fichadas."""

    def get(self, request):
        hoy = _inicio_de_hoy()
        dispositivos = list(
            Dispositivo.objects.select_related('sucursal').prefetch_related('agentes')
        )

        stats = {
            fila['dispositivo_id']: fila
            for fila in Fichada.objects.values('dispositivo_id').annotate(
                ultima=Max('ocurrida_en'),
                de_hoy=Count('id', filter=Q(ocurrida_en__gte=hoy)),
                sin_mapear=Count('id', filter=Q(estado_mapeo=EstadoMapeo.SIN_MAPEAR)),
            )
        }

        salida = []
        agentes_total = agentes_en_linea = pendientes = 0
        for d in dispositivos:
            agentes = []
            reloj_en_linea = None
            for a in d.agentes.all():
                if a.borrado or not a.activo:
                    continue
                agentes_total += 1
                en_linea = a.en_linea
                if en_linea:
                    agentes_en_linea += 1
                    # `reloj_alcanzable = None` significa "el agente todavia no
                    # consulto el reloj", no "el reloj esta caido". Hay que
                    # conservar ese None: convertirlo a False hacia que el panel
                    # mostrara "Reloj sin conexion" en rojo durante los primeros
                    # segundos de cada arranque, cuando en realidad no se sabia.
                    if a.reloj_alcanzable is True:
                        reloj_en_linea = True
                    elif a.reloj_alcanzable is False and reloj_en_linea is not True:
                        reloj_en_linea = False
                pendientes += a.eventos_pendientes
                agentes.append(
                    {
                        'id': a.id,
                        'nombre': a.nombre,
                        'en_linea': en_linea,
                        'ultimo_heartbeat': a.ultimo_heartbeat.isoformat() if a.ultimo_heartbeat else None,
                        'iniciado_en': a.iniciado_en.isoformat() if a.iniciado_en else None,
                        'version': a.version,
                        'hostname': a.hostname,
                        'reloj_alcanzable': a.reloj_alcanzable,
                        'reloj_error': a.reloj_error,
                        'reloj_bloqueado': a.reloj_bloqueado,
                        'segundos_de_bloqueo': a.segundos_de_bloqueo,
                        'eventos_pendientes': a.eventos_pendientes,
                        'eventos_error': a.eventos_error,
                        'ultima_sync_reloj': a.ultima_sync_reloj.isoformat() if a.ultima_sync_reloj else None,
                    }
                )
            propias = stats.get(d.id, {})
            salida.append(
                {
                    'id': d.id,
                    'nombre': d.nombre,
                    'activo': d.activo,
                    'modelo': d.modelo,
                    'numero_serie': d.numero_serie,
                    'firmware': d.firmware,
                    'host': d.host,
                    'sucursal': {'id': d.sucursal_id, 'nombre': d.sucursal.nombre},
                    'agentes': agentes,
                    'en_linea': any(a['en_linea'] for a in agentes),
                    'reloj_en_linea': reloj_en_linea,
                    'ultima_fichada': propias['ultima'].isoformat() if propias.get('ultima') else None,
                    'fichadas_hoy': propias.get('de_hoy', 0),
                    'sin_mapear': propias.get('sin_mapear', 0),
                    'reintento_pedido': (
                        d.reintento_pedido.isoformat() if d.reintento_pedido else None
                    ),
                    # Si el reloj está bloqueado por sí mismo, reintentar lo
                    # empeora: el panel lo usa para no ofrecer el botón.
                    'reloj_bloqueado': any(a['reloj_bloqueado'] for a in agentes),
                    'segundos_de_bloqueo': max(
                        (a['segundos_de_bloqueo'] for a in agentes), default=0
                    ),
                }
            )

        return Response(
            {
                'generado_en': timezone.now().isoformat(),
                'dispositivos': salida,
                'totales': {
                    'fichadas_hoy': Fichada.objects.filter(ocurrida_en__gte=hoy).count(),
                    'sin_mapear': Fichada.objects.filter(estado_mapeo=EstadoMapeo.SIN_MAPEAR).count(),
                    'agentes_en_linea': agentes_en_linea,
                    'agentes_total': agentes_total,
                    'eventos_pendientes': pendientes,
                },
            }
        )


class ResumenAsistenciaView(_BaseGestion, APIView):
    """Resumen diario con tramos, salidas parciales, turno y licencias.

    Genera una fila por (empleado, dia). Incluye los dias SIN fichadas de
    quienes tenian turno: esas son las ausencias, que son justamente las que
    hay que ver.
    """

    MAX_DIAS = 92

    def get(self, request):
        desde, hasta, resultados = self.analizar(request.query_params)
        conteo = Counter(j['estado'] for j in resultados)
        return Response({
            'desde': desde.isoformat(),
            'hasta': hasta.isoformat(),
            'resultados': resultados,
            'resumen': {
                'jornadas': len(resultados),
                'minutos_trabajados': sum(j['minutos_trabajados'] for j in resultados),
                'minutos_esperados': sum(j['minutos_esperados'] for j in resultados),
                'con_salida_parcial': sum(1 for j in resultados if j['salidas_parciales']),
                'en_otra_sucursal': sum(
                    1 for j in resultados if j['fichada_en_otra_sucursal']
                ),
                'inconsistencias': sum(len(j['inconsistencias']) for j in resultados),
                'pendientes': sum(j['pendientes'] for j in resultados),
                'por_estado': dict(conteo),
            },
        })

    @classmethod
    def analizar(cls, params, max_dias=None):
        """(desde, hasta, jornadas) del periodo pedido, ya analizadas.

        Es el unico lugar donde se arma el analisis: la pantalla de
        inconsistencias mira exactamente lo mismo que el resumen, asi no
        pueden contradecirse.
        """
        hasta = timezone.localtime(_fecha_local(params.get('hasta')) or _inicio_de_hoy()).date()
        desde_param = _fecha_local(params.get('desde'))
        desde = timezone.localtime(desde_param).date() if desde_param else hasta - timedelta(days=6)
        tope = max_dias or cls.MAX_DIAS
        if (hasta - desde).days > tope:
            desde = hasta - timedelta(days=tope)

        inicio = timezone.make_aware(datetime.combine(desde, datetime.min.time()))
        fin = timezone.make_aware(datetime.combine(hasta, datetime.min.time())) + timedelta(days=1)

        fichadas = (
            Fichada.objects.filter(ocurrida_en__gte=inicio, ocurrida_en__lt=fin)
            .select_related(
                'empleado', 'empleado__sucursal', 'dispositivo', 'dispositivo__sucursal'
            )
            .order_by('ocurrida_en')
        )
        empleado_id = _id(params, 'empleado')
        if _id(params, 'dispositivo'):
            fichadas = fichadas.filter(dispositivo_id=_id(params, 'dispositivo'))
        if empleado_id:
            fichadas = fichadas.filter(empleado_id=empleado_id)

        ctx = cls._contexto(desde, hasta, empleado_id)
        (turno_en, licencia_en, feriado_en, sucursal_en,
         reglas_en, controladas, empleados_seguidos) = ctx

        # 1) Agrupar las fichadas por (dia, persona).
        grupos = {}
        for f in fichadas.iterator():
            dia = timezone.localtime(f.ocurrida_en).date()
            if f.empleado_id:
                clave = (dia, 'e', f.empleado_id)
                meta = {
                    'empleado_id': f.empleado_id,
                    'nombre': f.empleado.nombre_completo,
                    'numero_reloj': f.numero_reloj,
                    'sin_mapear': False,
                }
                base_id = f.empleado.sucursal_id or f.dispositivo.sucursal_id
            else:
                clave = (dia, 'n', '%s:%s' % (f.dispositivo_id, f.numero_reloj))
                meta = {
                    'empleado_id': None,
                    'nombre': f.nombre_reloj or f.numero_reloj or 'Sin identificar',
                    'numero_reloj': f.numero_reloj,
                    'sin_mapear': True,
                }
                base_id = f.dispositivo.sucursal_id
            grupo = grupos.setdefault(
                clave,
                {'meta': meta, 'sucursal_id': base_id, 'fichadas': [], 'marcadas': {}},
            )
            grupo['fichadas'].append(f)
            # Donde ficho de verdad: el reloj sabe en que local esta parado.
            if f.dispositivo.sucursal_id:
                grupo['marcadas'][f.dispositivo.sucursal_id] = f.dispositivo.sucursal.nombre

        resultados = []
        for clave, grupo in grupos.items():
            meta = grupo['meta']
            dia = clave[0]
            turno, desfase = turno_en(meta['empleado_id'], dia)
            esperada = sucursal_en(meta['empleado_id'], dia, grupo['sucursal_id'])
            resultados.append(
                jornada_mod.calcular(
                    dia,
                    grupo['fichadas'],
                    turno=turno,
                    desfase=desfase,
                    licencia=licencia_en(meta['empleado_id'], dia),
                    feriado=feriado_en(dia, esperada['id'] if esperada else None),
                    reglas=reglas_en(turno.id if turno else None),
                    evaluar=_se_controla(esperada, controladas),
                    sucursal_esperada=esperada,
                    sucursales_fichadas=[
                        {'id': sid, 'nombre': nombre}
                        for sid, nombre in sorted(grupo['marcadas'].items())
                    ],
                    **meta
                ).to_dict()
            )

        # 2) Dias sin fichadas de quienes tenian turno: ausencias y licencias.
        vistos = set((clave[0], clave[2]) for clave in grupos if clave[1] == 'e')
        dia = desde
        while dia <= hasta:
            for emp_id, datos_emp in empleados_seguidos.items():
                if (dia, emp_id) in vistos:
                    continue
                esperada = sucursal_en(emp_id, dia, datos_emp['sucursal_id'])
                # Sin reloj en su sucursal no se le puede pedir que fiche: no
                # es una ausencia, es que no hay donde marcar.
                if not _se_controla(esperada, controladas):
                    continue
                turno, desfase = turno_en(emp_id, dia)
                licencia = licencia_en(emp_id, dia)
                # Feriado sin fichadas: el dia no da noticia, se omite.
                if feriado_en(dia, esperada['id'] if esperada else None) is not None:
                    continue
                if turno is None and licencia is None:
                    continue
                # Franco sin licencia: tampoco es noticia.
                if licencia is None and turno is not None and not turno.tramos_de(dia, desfase):
                    continue
                resultados.append(
                    jornada_mod.calcular(
                        dia, [], empleado_id=emp_id, nombre=datos_emp['nombre'],
                        turno=turno, desfase=desfase, licencia=licencia,
                        reglas=reglas_en(turno.id if turno else None),
                        sucursal_esperada=esperada,
                    ).to_dict()
                )
            dia += timedelta(days=1)

        # El filtro por sucursal se aplica ACA y no en la consulta: una jornada
        # pertenece a un local por dos motivos distintos (donde se esperaba a la
        # persona y donde ficho), y filtrando por el reloj se perdia el primero
        # — quien ese dia tenia que estar ahi y no aparecio.
        filtro_sucursal = _id(params, 'sucursal')
        if filtro_sucursal:
            resultados = [j for j in resultados if _es_de_la_sucursal(j, filtro_sucursal)]

        _aplicar_justificaciones(resultados, desde, hasta)
        resultados.sort(key=lambda j: (j['fecha'], j['nombre']), reverse=True)
        return desde, hasta, resultados

    @staticmethod
    def _contexto(desde, hasta, empleado_id=None):
        """Precarga turnos, licencias y feriados: evita una consulta por dia."""
        asignaciones = (
            AsignacionTurno.objects
            .filter(desde__lte=hasta)
            .filter(Q(hasta__isnull=True) | Q(hasta__gte=desde))
            .select_related('turno', 'empleado')
            .prefetch_related('turno__tramos')
            .order_by('-desde')
        )
        licencias = (
            Licencia.objects.filter(desde__lte=hasta, hasta__gte=desde)
            .select_related('empleado')
        )
        destinos = (
            AsignacionSucursal.objects
            .filter(desde__lte=hasta)
            .filter(Q(hasta__isnull=True) | Q(hasta__gte=desde))
            .select_related('sucursal')
        )
        if empleado_id:
            asignaciones = asignaciones.filter(empleado_id=empleado_id)
            licencias = licencias.filter(empleado_id=empleado_id)
            destinos = destinos.filter(empleado_id=empleado_id)

        por_empleado = {}
        seguidos = {}
        for a in asignaciones:
            por_empleado.setdefault(a.empleado_id, []).append(a)
            seguidos.setdefault(a.empleado_id, {
                'nombre': a.empleado.nombre_completo,
                'sucursal_id': a.empleado.sucursal_id,
            })

        licencias_por_empleado = {}
        for lic in licencias:
            licencias_por_empleado.setdefault(lic.empleado_id, []).append(lic)
            seguidos.setdefault(lic.empleado_id, {
                'nombre': lic.empleado.nombre_completo,
                'sucursal_id': lic.empleado.sucursal_id,
            })

        destinos_por_empleado = {}
        for destino in destinos:
            destinos_por_empleado.setdefault(destino.empleado_id, []).append(destino)

        # La sucursal fija del empleado es el respaldo cuando no hay ninguna
        # asignacion con fechas: son pocas filas, se traen todas de una.
        nombres_sucursal = dict(Sucursal.objects.values_list('id', 'nombre'))

        # Reglas y relojes: se resuelven una vez por turno y se cachean, en vez
        # de una vez por jornada (el periodo puede tener cientos).
        todas_las_reglas = list(ReglaInconsistencia.objects.all())
        cache_reglas: dict = {}
        controladas = sucursales_controladas()

        feriados = list(Feriado.objects.filter(fecha__gte=desde, fecha__lte=hasta))

        def turno_en(emp_id, fecha):
            """(turno, desfase) vigente para un empleado en una fecha."""
            for a in por_empleado.get(emp_id, ()):
                if a.cubre(fecha):
                    return a.turno, a.desfase_ciclo
            return None, 0

        def licencia_en(emp_id, fecha):
            for lic in licencias_por_empleado.get(emp_id, ()):
                if lic.cubre(fecha):
                    return lic
            return None

        def reglas_en(turno_id=None):
            """El catalogo de inconsistencias que rige para ese turno."""
            if turno_id not in cache_reglas:
                cache_reglas[turno_id] = resolver_reglas(todas_las_reglas, turno_id)
            return cache_reglas[turno_id]

        def sucursal_en(emp_id, fecha, base_id=None):
            """Donde se espera al empleado ese dia: `{'id', 'nombre'}` o None.

            Manda la asignacion mas especifica que cubra la fecha; si no hay
            ninguna, la sucursal fija del empleado (y para las fichadas sin
            mapear, la del reloj que las tomo).
            """
            elegida = elegir_asignacion_sucursal(destinos_por_empleado.get(emp_id, ()), fecha)
            if elegida is not None:
                return {'id': elegida.sucursal_id, 'nombre': elegida.sucursal.nombre}
            if base_id:
                return {'id': base_id, 'nombre': nombres_sucursal.get(base_id, '')}
            return None

        def feriado_en(fecha, sucursal_id=None):
            """El feriado del dia; uno de la sucursal le gana al general."""
            general = None
            for f in feriados:
                if f.fecha != fecha:
                    continue
                if f.sucursal_id == sucursal_id and sucursal_id is not None:
                    return f
                if f.sucursal_id is None:
                    general = general or f
            return general

        return (
            turno_en, licencia_en, feriado_en, sucursal_en,
            reglas_en, controladas, seguidos,
        )


# --- Horarios y licencias (solo superadministrador) --------------------------

class TurnoListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Turno.objects.prefetch_related('tramos')
    serializer_class = TurnoSerializer


class TurnoDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Turno.objects.prefetch_related('tramos')
    serializer_class = TurnoSerializer


class AsignacionListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    serializer_class = AsignacionTurnoSerializer

    def get_queryset(self):
        qs = AsignacionTurno.objects.select_related('empleado', 'turno')
        params = self.request.query_params
        if _id(params, 'empleado'):
            qs = qs.filter(empleado_id=_id(params, 'empleado'))
        if params.get('vigentes') == '1':
            qs = qs.filter(hasta__isnull=True)
        return qs


class AsignacionDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = AsignacionTurno.objects.select_related('empleado', 'turno')
    serializer_class = AsignacionTurnoSerializer


class AsignacionSucursalListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    serializer_class = AsignacionSucursalSerializer

    def get_queryset(self):
        qs = AsignacionSucursal.objects.select_related('empleado', 'sucursal')
        params = self.request.query_params
        if _id(params, 'empleado'):
            qs = qs.filter(empleado_id=_id(params, 'empleado'))
        if _id(params, 'sucursal'):
            qs = qs.filter(sucursal_id=_id(params, 'sucursal'))
        if params.get('vigentes') == '1':
            qs = qs.filter(hasta__isnull=True)
        return qs


class AsignacionSucursalDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = AsignacionSucursal.objects.select_related('empleado', 'sucursal')
    serializer_class = AsignacionSucursalSerializer


class LicenciaListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    serializer_class = LicenciaSerializer

    def get_queryset(self):
        qs = Licencia.objects.select_related('empleado')
        params = self.request.query_params
        if _id(params, 'empleado'):
            qs = qs.filter(empleado_id=_id(params, 'empleado'))
        if params.get('tipo'):
            qs = qs.filter(tipo=params['tipo'])
        desde = _fecha_local(params.get('desde'))
        if desde:
            qs = qs.filter(hasta__gte=timezone.localtime(desde).date())
        hasta = _fecha_local(params.get('hasta'))
        if hasta:
            qs = qs.filter(desde__lte=timezone.localtime(hasta).date())
        return qs


class LicenciaDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Licencia.objects.select_related('empleado')
    serializer_class = LicenciaSerializer


class FeriadoListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    serializer_class = FeriadoSerializer

    def get_queryset(self):
        qs = Feriado.objects.select_related('sucursal')
        params = self.request.query_params
        try:
            anio = int(params.get('anio', ''))
        except (TypeError, ValueError):
            anio = None
        if anio:
            qs = qs.filter(fecha__year=anio)
        if _id(params, 'sucursal'):
            qs = qs.filter(
                Q(sucursal_id=_id(params, 'sucursal')) | Q(sucursal__isnull=True)
            )
        return qs


class FeriadoDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Feriado.objects.select_related('sucursal')
    serializer_class = FeriadoSerializer


# Feriados nacionales INAMOVIBLES (fecha fija por ley 27.399). Los trasladables
# —Carnaval, Viernes Santo, 17/8, 12/10, 20/11— cambian cada año y los define
# el Poder Ejecutivo, asi que esos se cargan a mano.
FERIADOS_FIJOS = (
    (1, 1, 'Año Nuevo'),
    (3, 24, 'Día Nacional de la Memoria por la Verdad y la Justicia'),
    (4, 2, 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
    (5, 1, 'Día del Trabajador'),
    (5, 25, 'Día de la Revolución de Mayo'),
    (6, 20, 'Paso a la Inmortalidad del Gral. Manuel Belgrano'),
    (7, 9, 'Día de la Independencia'),
    (12, 8, 'Inmaculada Concepción de María'),
    (12, 25, 'Navidad'),
)


class FeriadosSembrarView(_BaseGestion, APIView):
    """Carga de una los feriados nacionales de fecha fija de un año."""

    def post(self, request):
        try:
            anio = int(request.data.get('anio'))
        except (TypeError, ValueError):
            return Response({'detail': 'Indicá el año.'}, status=400)
        if not 2000 <= anio <= 2100:
            return Response({'detail': 'Año fuera de rango.'}, status=400)

        creados = []
        for mes, dia, nombre in FERIADOS_FIJOS:
            fecha = date(anio, mes, dia)
            if Feriado.objects.filter(fecha=fecha, sucursal__isnull=True).exists():
                continue
            feriado = Feriado.objects.create(
                fecha=fecha, nombre=nombre, tipo=TipoFeriado.NACIONAL,
                creado_por=request.user, actualizado_por=request.user,
            )
            creados.append(FeriadoSerializer(feriado).data)

        return Response({
            'creados': len(creados),
            'omitidos': len(FERIADOS_FIJOS) - len(creados),
            'resultados': creados,
            'aviso': 'Los feriados trasladables (Carnaval, Viernes Santo, 17/8, '
                     '12/10 y 20/11) cambian cada año: cargalos a mano.',
        })


# --- Inconsistencias (solo superadministrador) -------------------------------

class ReglaListCreateView(_BaseGestion, AuditoriaMixin, generics.ListCreateAPIView):
    serializer_class = ReglaInconsistenciaSerializer

    def get_queryset(self):
        qs = ReglaInconsistencia.objects.select_related('turno')
        params = self.request.query_params
        if _id(params, 'turno'):
            qs = qs.filter(Q(turno_id=_id(params, 'turno')) | Q(turno__isnull=True))
        elif params.get('globales') == '1':
            qs = qs.filter(turno__isnull=True)
        return qs


class ReglaDetailView(_BaseGestion, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = ReglaInconsistencia.objects.select_related('turno')
    serializer_class = ReglaInconsistenciaSerializer


class CatalogoInconsistenciasView(_BaseGestion, APIView):
    """Que tipos existen y que significa el umbral de cada uno.

    La interfaz se explica sola con esto: agregar un tipo al catalogo aparece
    en pantalla con su ayuda sin tocar el frontend.
    """

    def get(self, request):
        return Response({
            'tipos': [
                {
                    'tipo': tipo,
                    'tipo_display': TipoInconsistencia(tipo).label,
                    'etiqueta_umbral': cfg['umbral'],
                    'usa_umbral': bool(cfg['umbral']),
                    'umbral_defecto': cfg['defecto'],
                    'severidad_defecto': cfg['severidad'],
                    'ayuda': cfg['ayuda'],
                }
                for tipo, cfg in CATALOGO_INCONSISTENCIAS.items()
            ],
            'severidades': [{'value': v, 'label': l} for v, l in Severidad.choices],
            'estados': [{'value': v, 'label': l} for v, l in EstadoInconsistencia.choices],
            # Sin esto, que alguien no aparezca en el resumen es un misterio.
            # Van separadas a proposito: no tener reloj se arregla instalandolo;
            # estar apagada se arregla con el interruptor de Configuracion.
            'sucursales_sin_reloj': [
                {'id': s.id, 'nombre': s.nombre}
                for s in Sucursal.objects.exclude(id__in=sucursales_con_reloj())
            ],
            'sucursales_sin_control': [
                {'id': s.id, 'nombre': s.nombre}
                for s in Sucursal.objects.filter(id__in=sucursales_sin_control())
            ],
        })


class ReglasSembrarView(_BaseGestion, APIView):
    """Carga de una las reglas recomendadas que falten."""

    def post(self, request):
        creadas = sembrar_reglas(request.user)
        return Response(
            {
                'creadas': len(creadas),
                'reglas': ReglaInconsistenciaSerializer(creadas, many=True).data,
            },
            status=status.HTTP_201_CREATED if creadas else status.HTTP_200_OK,
        )


class InconsistenciasView(_BaseGestion, APIView):
    """Las inconsistencias del periodo, una fila por cada una.

    Se recalculan con `ResumenAsistenciaView.analizar`, o sea que muestran
    exactamente lo mismo que el resumen: no hay dos verdades posibles.
    """

    ORDEN_SEVERIDAD = {Severidad.GRAVE: 0, Severidad.MODERADA: 1, Severidad.LEVE: 2}

    def get(self, request):
        params = request.query_params
        desde, hasta, jornadas = ResumenAsistenciaView.analizar(params)

        filtro_tipo = params.get('tipo') or ''
        filtro_estado = params.get('estado') or ''
        filtro_severidad = params.get('severidad') or ''

        filas = []
        for jornada in jornadas:
            for inc in jornada['inconsistencias']:
                if filtro_tipo and inc['tipo'] != filtro_tipo:
                    continue
                if filtro_estado and inc['estado'] != filtro_estado:
                    continue
                if filtro_severidad and inc['severidad'] != filtro_severidad:
                    continue
                filas.append({
                    **inc,
                    'fecha': jornada['fecha'],
                    'empleado': jornada['empleado'],
                    'nombre': jornada['nombre'],
                    'turno': jornada['turno'],
                    'horario_esperado': jornada['horario_esperado'],
                    'sucursal_esperada': jornada['sucursal_esperada'],
                    'estado_jornada': jornada['estado'],
                    'estado_jornada_display': jornada['estado_display'],
                })

        filas.sort(
            key=lambda f: (f['fecha'], -self.ORDEN_SEVERIDAD.get(f['severidad'], 9)),
            reverse=True,
        )

        return Response({
            'desde': desde.isoformat(),
            'hasta': hasta.isoformat(),
            'resultados': filas,
            'resumen': {
                'total': len(filas),
                'pendientes': sum(
                    1 for f in filas
                    if f['requiere_justificacion'] and f['estado'] == 'pendiente'
                ),
                'justificadas': sum(1 for f in filas if f['estado'] == 'justificada'),
                'rechazadas': sum(1 for f in filas if f['estado'] == 'rechazada'),
                'graves': sum(1 for f in filas if f['severidad'] == Severidad.GRAVE),
                'por_tipo': dict(Counter(f['tipo'] for f in filas)),
            },
        })


class ResolverInconsistenciaView(_BaseGestion, APIView):
    """Justificar o rechazar una inconsistencia, o volverla a dejar pendiente.

    La inconsistencia no existe como fila: se identifica por (empleado, fecha,
    tipo), que es justamente lo que la hace sobrevivir a un recalculo.
    """

    def post(self, request):
        datos = {
            'empleado': request.data.get('empleado'),
            'fecha': request.data.get('fecha'),
            'tipo': request.data.get('tipo'),
            'estado': request.data.get('estado') or EstadoInconsistencia.JUSTIFICADA,
            'motivo': request.data.get('motivo') or '',
        }
        existente = JustificacionInconsistencia.objects.filter(
            empleado_id=datos['empleado'], fecha=datos['fecha'], tipo=datos['tipo']
        ).first()

        serializer = JustificacionSerializer(existente, data=datos)
        serializer.is_valid(raise_exception=True)
        if existente is None:
            serializer.save(creado_por=request.user, actualizado_por=request.user)
        else:
            serializer.save(actualizado_por=request.user)
        return Response(
            serializer.data,
            status=status.HTTP_200_OK if existente else status.HTTP_201_CREATED,
        )

    def delete(self, request):
        """Vuelve la inconsistencia a «pendiente»: borra su resolucion.

        Los datos se aceptan por querystring o por cuerpo: un DELETE con
        cuerpo es legal pero incomodo de mandar desde varios clientes.
        """
        def dato(clave):
            return request.query_params.get(clave) or request.data.get(clave)

        empleado = dato('empleado')
        fecha = _fecha_local(dato('fecha'))
        if not empleado or fecha is None:
            return Response({'detail': 'Indicá empleado, fecha y tipo.'}, status=400)

        borradas, _ = JustificacionInconsistencia.objects.filter(
            empleado_id=empleado,
            fecha=timezone.localtime(fecha).date(),
            tipo=dato('tipo') or '',
        ).delete()
        if not borradas:
            return Response({'detail': 'Esa inconsistencia no estaba resuelta.'}, status=404)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Legajo de asistencia de un empleado -------------------------------------

MESES = (
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
)


def _totales(jornadas) -> dict:
    """Los numeros de un conjunto de jornadas, ya sea un mes o un anio."""
    trabajados = sum(j['minutos_trabajados'] for j in jornadas)
    esperados = sum(j['minutos_esperados'] for j in jornadas)
    return {
        'jornadas': len(jornadas),
        'dias_trabajados': sum(1 for j in jornadas if j['minutos_trabajados'] > 0),
        'minutos_trabajados': trabajados,
        'minutos_esperados': esperados,
        # Positivo: trabajo de mas. Negativo: quedo debiendo.
        'saldo_minutos': trabajados - esperados,
        'minutos_tarde': sum(j['llegada_tarde_minutos'] for j in jornadas),
        'dias_tarde': sum(1 for j in jornadas if j['llegada_tarde_minutos'] > 0),
        'minutos_salida_temprana': sum(j['salida_temprana_minutos'] for j in jornadas),
        'ausencias': sum(1 for j in jornadas if j['estado'] == 'ausente'),
        'dias_licencia': sum(1 for j in jornadas if j['estado'] == 'licencia'),
        'salidas_parciales': sum(len(j['salidas_parciales']) for j in jornadas),
        'minutos_fuera': sum(j['minutos_fuera'] for j in jornadas),
        'inconsistencias': sum(len(j['inconsistencias']) for j in jornadas),
        'pendientes': sum(j['pendientes'] for j in jornadas),
        'por_estado': dict(Counter(j['estado'] for j in jornadas)),
    }


class LegajoEmpleadoView(_BaseGestion, APIView):
    """Todo lo de asistencia de UNA persona, en el periodo que se pida.

    Devuelve tres niveles de zoom del mismo dato, para que la pantalla pueda
    ir del anio al dia sin volver a pedir nada raro:

    - `por_mes`: el agregado mensual (la vista anual).
    - `dias`: una linea por dia, compacta — alcanza para pintar un calendario
      o un mapa de calor de todo un anio sin traer megabytes.
    - `jornadas`: el detalle completo (tramos, salidas parciales,
      inconsistencias). Solo si el periodo pedido es corto: un anio de detalle
      no lo mira nadie y pesa de mas.
    """

    MAX_DIAS = 366
    MAX_DIAS_DETALLE = 92

    def get(self, request, pk):
        empleado = get_object_or_404(Empleado, pk=pk)

        params = request.query_params.copy()
        params['empleado'] = str(pk)
        # El legajo es de una persona: el filtro por sucursal lo dejaria a medias.
        params.pop('sucursal', None)

        desde, hasta, jornadas = ResumenAsistenciaView.analizar(
            params, max_dias=self.MAX_DIAS
        )

        # Del mas viejo al mas nuevo: los graficos y el calendario leen asi.
        jornadas.sort(key=lambda j: j['fecha'])

        por_mes = {}
        for jornada in jornadas:
            por_mes.setdefault(jornada['fecha'][:7], []).append(jornada)

        meses = []
        for clave in sorted(por_mes):
            anio, mes = clave.split('-')
            meses.append({
                'mes': clave,
                'etiqueta': f'{MESES[int(mes) - 1].capitalize()} {anio}',
                'etiqueta_corta': MESES[int(mes) - 1][:3].capitalize(),
                **_totales(por_mes[clave]),
            })

        inconsistencias = [
            {
                **inc,
                'fecha': jornada['fecha'],
                'turno': jornada['turno'],
                'horario_esperado': jornada['horario_esperado'],
                'estado_jornada': jornada['estado'],
            }
            for jornada in jornadas
            for inc in jornada['inconsistencias']
        ]
        inconsistencias.sort(key=lambda i: i['fecha'], reverse=True)

        con_detalle = (hasta - desde).days <= self.MAX_DIAS_DETALLE

        licencias = Licencia.objects.filter(
            empleado=empleado, desde__lte=hasta, hasta__gte=desde
        ).order_by('desde')

        asignacion = (
            AsignacionTurno.objects
            .filter(empleado=empleado, desde__lte=hasta)
            .filter(Q(hasta__isnull=True) | Q(hasta__gte=hasta))
            .select_related('turno')
            .order_by('-desde')
            .first()
        )

        return Response({
            'empleado': {
                'id': empleado.id,
                'nombre': empleado.nombre_completo,
                'sucursal': empleado.sucursal.nombre if empleado.sucursal_id else '',
                'turno_vigente': asignacion.turno.nombre if asignacion else '',
            },
            'desde': desde.isoformat(),
            'hasta': hasta.isoformat(),
            'con_detalle': con_detalle,
            'resumen': _totales(jornadas),
            'por_mes': meses,
            'dias': [
                {
                    'fecha': j['fecha'],
                    'estado': j['estado'],
                    'estado_display': j['estado_display'],
                    'minutos_trabajados': j['minutos_trabajados'],
                    'minutos_esperados': j['minutos_esperados'],
                    'llegada_tarde_minutos': j['llegada_tarde_minutos'],
                    'inconsistencias': len(j['inconsistencias']),
                    'pendientes': j['pendientes'],
                    'sucursal': (j['sucursal_esperada'] or {}).get('nombre', ''),
                }
                for j in jornadas
            ],
            'jornadas': jornadas if con_detalle else [],
            'inconsistencias': inconsistencias,
            'licencias': LicenciaSerializer(licencias, many=True).data,
        })


# --- Calendario mensual ------------------------------------------------------

class EstadoDiaCalendario:
    """Cómo se pinta un día del calendario.

    Son estados de SEMÁFORO, no categorías: el color significa bien/mal. Por eso
    la interfaz los acompaña siempre con un ícono y una etiqueta — rojo y verde
    son justo el par que no distingue el daltonismo más común, y el color solo
    no puede ser el que lleva el dato.
    """

    VERDE = 'verde'                  # todos presentes y sin novedades
    AMARILLO = 'amarillo'            # hubo ausencias o inconsistencias
    ROJO = 'rojo'                    # se esperaba gente y NADIE fichó
    SIN_ACTIVIDAD = 'sin_actividad'  # nadie esperado y nadie fichó (franco, cerrado)
    FUTURO = 'futuro'                # todavía no pasó: no se juzga


class CalendarioAsistenciaView(_BaseGestion, APIView):
    """El mes de un vistazo: un semáforo por día, y el detalle al tocarlo.

    Reusa `ResumenAsistenciaView.analizar`, que es el único lugar donde se arma
    el análisis de un período. Así el color de un día y lo que se ve al abrirlo
    no pueden contradecirse: salen del mismo cálculo.

    El detalle de un día NO viaja acá: lo pide la pantalla al resumen filtrando
    por esa fecha. Traer el mes entero con sus tramos serían cientos de jornadas
    para mostrar una.
    """

    def get(self, request):
        mes = self._mes_pedido(request.query_params.get('mes'))
        if mes is None:
            return Response(
                {'detail': 'Indicá el mes como aaaa-mm (por ejemplo 2026-08).'},
                status=400,
            )

        primero = mes
        ultimo = date(
            mes.year, mes.month, calendar.monthrange(mes.year, mes.month)[1]
        )

        params = request.query_params.copy()
        params['desde'] = primero.isoformat()
        params['hasta'] = ultimo.isoformat()
        desde, hasta, jornadas = ResumenAsistenciaView.analizar(params)

        por_dia = {}
        for jornada in jornadas:
            por_dia.setdefault(jornada['fecha'], []).append(jornada)

        # Los feriados se traen aparte a propósito: un feriado en el que no
        # trabajó nadie no genera ninguna jornada —el resumen lo omite porque no
        # es noticia— pero el calendario igual tiene que mostrarlo. Si no, un
        # 25 de diciembre aparecería como un día en blanco sin explicación.
        feriados = self._feriados_del_mes(primero, ultimo, _id(request.query_params, 'sucursal'))

        hoy = timezone.localtime().date()
        dias = []
        dia = primero
        while dia <= ultimo:
            dias.append(self._armar_dia(
                dia, por_dia.get(dia.isoformat(), []), hoy, feriados.get(dia)
            ))
            dia += timedelta(days=1)

        return Response({
            'mes': f'{mes.year:04d}-{mes.month:02d}',
            'desde': primero.isoformat(),
            'hasta': ultimo.isoformat(),
            'dias': dias,
            'resumen': {
                'perfectos': sum(1 for d in dias if d['estado'] == EstadoDiaCalendario.VERDE),
                'con_novedades': sum(
                    1 for d in dias if d['estado'] == EstadoDiaCalendario.AMARILLO
                ),
                'sin_marcaciones': sum(
                    1 for d in dias if d['estado'] == EstadoDiaCalendario.ROJO
                ),
                'pendientes': sum(d['pendientes'] for d in dias),
                'minutos_trabajados': sum(d['minutos_trabajados'] for d in dias),
            },
        })

    @staticmethod
    def _mes_pedido(texto):
        """`2026-08` → el día 1 de ese mes. Sin parámetro, el mes en curso."""
        if not texto:
            hoy = timezone.localtime().date()
            return date(hoy.year, hoy.month, 1)
        try:
            anio, mes = str(texto).split('-')
            return date(int(anio), int(mes), 1)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _feriados_del_mes(desde, hasta, sucursal_id=None):
        """`{fecha: {...}}` con el feriado que aplica; el de la sucursal manda."""
        elegidos = {}
        for f in Feriado.objects.filter(fecha__gte=desde, fecha__lte=hasta):
            if f.sucursal_id is not None and f.sucursal_id != sucursal_id:
                continue
            previo = elegidos.get(f.fecha)
            # Uno de la sucursal le gana al general, igual que en el resumen.
            if previo is None or f.sucursal_id is not None:
                elegidos[f.fecha] = {
                    'nombre': f.nombre,
                    'tipo': f.tipo,
                    'tipo_display': f.get_tipo_display(),
                }
        return elegidos

    @staticmethod
    def _armar_dia(dia, jornadas, hoy, feriado_del_dia=None):
        """El semáforo de un día y los números que lo explican."""
        # Una jornada «cuenta» si esa persona fichó o si se la esperaba. Las que
        # no aportan (licencia, feriado sin trabajo, franco) quedan afuera del
        # semáforo pero se informan igual.
        presentes = [j for j in jornadas if j['fichadas'] > 0]
        ausentes = [j for j in jornadas if j['estado'] == 'ausente']
        licencias = [j for j in jornadas if j['estado'] == 'licencia']

        # Una novedad es una inconsistencia que nadie resolvió todavía. Las ya
        # justificadas se muestran, pero no vuelven amarillo un día: para eso
        # sirve justificarlas.
        #
        # Se cuentan solo entre los PRESENTES: una ausencia ya genera su propia
        # inconsistencia, así que sin este filtro la misma persona sumaría en
        # `ausentes` y en `con_novedad` a la vez y la barra del calendario
        # pasaría del 100 %. Con esto vale siempre
        # `esperados = (presentes - con_novedad) + con_novedad + ausentes`.
        con_novedad = [
            j for j in presentes
            if any(i['estado'] != 'justificada' for i in j['inconsistencias'])
        ]

        esperados = len(presentes) + len(ausentes)
        if dia > hoy:
            estado = EstadoDiaCalendario.FUTURO
        elif esperados == 0:
            estado = EstadoDiaCalendario.SIN_ACTIVIDAD
        elif not presentes:
            # Se esperaba gente y no ficho nadie: es lo mas grave que puede
            # decir un dia. Suele ser el reloj caido, no el equipo ausente.
            estado = EstadoDiaCalendario.ROJO
        elif ausentes or con_novedad:
            estado = EstadoDiaCalendario.AMARILLO
        else:
            estado = EstadoDiaCalendario.VERDE

        feriado = next((j['feriado'] for j in jornadas if j['feriado']), feriado_del_dia)

        return {
            'fecha': dia.isoformat(),
            'estado': estado,
            'esperados': esperados,
            'presentes': len(presentes),
            'ausentes': len(ausentes),
            'con_novedad': len(con_novedad),
            'licencias': len(licencias),
            'inconsistencias': sum(len(j['inconsistencias']) for j in jornadas),
            'pendientes': sum(j['pendientes'] for j in jornadas),
            'minutos_trabajados': sum(j['minutos_trabajados'] for j in jornadas),
            'minutos_esperados': sum(j['minutos_esperados'] for j in jornadas),
            'feriado': feriado,
            'es_hoy': dia == hoy,
        }


# --- Qué sucursales se controlan ---------------------------------------------

class ControlSucursalListView(_BaseGestion, APIView):
    """Todas las sucursales y si se les controla la asistencia.

    Devuelve la lista COMPLETA, no solo las que tienen fila: una sucursal sin
    configurar se controla, y esconderla haría que el interruptor pareciera no
    existir hasta que alguien lo tocara una primera vez.
    """

    def get(self, request):
        con_reloj = sucursales_con_reloj()
        configs = {c.sucursal_id: c for c in ControlSucursal.objects.all()}
        relojes = {}
        for d in Dispositivo.objects.filter(activo=True):
            relojes.setdefault(d.sucursal_id, []).append(d.nombre)

        return Response([
            {
                'sucursal': s.id,
                'nombre': s.nombre,
                # Sin fila, se controla: el silencio es lo de siempre.
                'controla': configs[s.id].controla if s.id in configs else True,
                'motivo': configs[s.id].motivo if s.id in configs else '',
                'tiene_reloj': s.id in con_reloj,
                'relojes': relojes.get(s.id, []),
            }
            for s in Sucursal.objects.all()
        ])


class ControlSucursalDetailView(_BaseGestion, APIView):
    """Prende o apaga el control de una sucursal.

    Es un upsert: la mayoría de las sucursales no tiene fila porque el valor por
    defecto ya es el correcto. La fila aparece recién cuando alguien decide algo
    distinto (o vuelve a prenderlo, para que quede el motivo y la auditoría).
    """

    def patch(self, request, pk):
        sucursal = get_object_or_404(Sucursal, pk=pk)

        control, creado = ControlSucursal.objects.get_or_create(
            sucursal=sucursal,
            defaults={'creado_por': request.user, 'actualizado_por': request.user},
        )
        if 'controla' in request.data:
            control.controla = bool(request.data['controla'])
        if 'motivo' in request.data:
            control.motivo = str(request.data['motivo'] or '')[:200]
        control.actualizado_por = request.user
        control.save()

        if control.controla:
            detalle = (
                f'{sucursal.nombre} vuelve a controlarse: sus jornadas se evalúan '
                'de nuevo (ausencias, llegadas tarde e inconsistencias).'
            )
            if sucursal.id not in sucursales_con_reloj():
                detalle += (
                    ' Ojo: todavía no tiene ningún reloj activo, así que hasta '
                    'que se le cargue uno el control no va a poder aplicarse.'
                )
        else:
            detalle = (
                f'{sucursal.nombre} deja de controlarse. Las fichadas se siguen '
                'registrando y se pueden consultar; lo que se apaga es el juicio: '
                'no van a figurar ausencias, ni tarde, ni inconsistencias.'
            )

        return Response({
            'sucursal': sucursal.id,
            'nombre': sucursal.nombre,
            'controla': control.controla,
            'motivo': control.motivo,
            'tiene_reloj': sucursal.id in sucursales_con_reloj(),
            'creado': creado,
            'detalle': detalle,
        })
