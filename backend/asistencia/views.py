"""Vistas de Asistencia.

Dos APIs bien separadas:

- **Agentes** (`agente/…`): token de máquina `Bearer asist_…`, sin usuario.
  Reciben fichadas en lote (idempotente), heartbeat y entregan la config
  remota que administra el superadmin desde la interfaz.
- **Gestión** (todo lo demás): SOLO superadministrador, como Auditoría.
"""
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
from inventario.models import Sucursal
from usuarios.permissions import EsSuperadministrador

from . import jornada as jornada_mod
from .authentication import AgenteTokenAuthentication, EsAgenteAutenticado
from .models import (
    Agente,
    AsignacionTurno,
    Dispositivo,
    EstadoMapeo,
    Feriado,
    Fichada,
    Licencia,
    MapeoEmpleado,
    MetodoVerificacion,
    TipoFichada,
    TipoFeriado,
    Turno,
    aplicar_mapeo,
    hash_evento,
    resolver_mapeos,
)
from .serializers import (
    AgenteSerializer,
    AsignacionTurnoSerializer,
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

        Agente.todos.filter(pk=agente.pk).update(
            ultimo_heartbeat=timezone.now(),
            version=datos['agent_version'][:20],
            hostname=datos['hostname'][:120],
            iniciado_en=datos['started_at'],
            reloj_alcanzable=datos['device_reachable'],
            reloj_error=(datos['device_error'] or '')[:300],
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
            respuesta['dispositivos'] = [
                {'id': d.id, 'nombre': d.nombre, 'sucursal': d.sucursal.nombre}
                for d in Dispositivo.objects.select_related('sucursal')
            ]
            respuesta['sucursales'] = [
                {'id': s.id, 'nombre': s.nombre} for s in Sucursal.objects.all()
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
        params = request.query_params
        hasta = timezone.localtime(_fecha_local(params.get('hasta')) or _inicio_de_hoy()).date()
        desde_param = _fecha_local(params.get('desde'))
        desde = timezone.localtime(desde_param).date() if desde_param else hasta - timedelta(days=6)
        if (hasta - desde).days > self.MAX_DIAS:
            desde = hasta - timedelta(days=self.MAX_DIAS)

        inicio = timezone.make_aware(datetime.combine(desde, datetime.min.time()))
        fin = timezone.make_aware(datetime.combine(hasta, datetime.min.time())) + timedelta(days=1)

        fichadas = (
            Fichada.objects.filter(ocurrida_en__gte=inicio, ocurrida_en__lt=fin)
            .select_related('empleado', 'dispositivo')
            .order_by('ocurrida_en')
        )
        empleado_id = _id(params, 'empleado')
        if _id(params, 'dispositivo'):
            fichadas = fichadas.filter(dispositivo_id=_id(params, 'dispositivo'))
        if _id(params, 'sucursal'):
            fichadas = fichadas.filter(dispositivo__sucursal_id=_id(params, 'sucursal'))
        if empleado_id:
            fichadas = fichadas.filter(empleado_id=empleado_id)

        ctx = self._contexto(desde, hasta, empleado_id)
        turno_en, licencia_en, feriado_en, empleados_seguidos = ctx

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
                sucursal_id = f.empleado.sucursal_id or f.dispositivo.sucursal_id
            else:
                clave = (dia, 'n', '%s:%s' % (f.dispositivo_id, f.numero_reloj))
                meta = {
                    'empleado_id': None,
                    'nombre': f.nombre_reloj or f.numero_reloj or 'Sin identificar',
                    'numero_reloj': f.numero_reloj,
                    'sin_mapear': True,
                }
                sucursal_id = f.dispositivo.sucursal_id
            grupo = grupos.setdefault(
                clave, {'meta': meta, 'sucursal_id': sucursal_id, 'fichadas': []}
            )
            grupo['fichadas'].append(f)

        resultados = []
        for clave, grupo in grupos.items():
            meta = grupo['meta']
            turno, desfase = turno_en(meta['empleado_id'], clave[0])
            resultados.append(
                jornada_mod.calcular(
                    clave[0],
                    grupo['fichadas'],
                    turno=turno,
                    desfase=desfase,
                    licencia=licencia_en(meta['empleado_id'], clave[0]),
                    feriado=feriado_en(clave[0], grupo.get('sucursal_id')),
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
                turno, desfase = turno_en(emp_id, dia)
                licencia = licencia_en(emp_id, dia)
                # Feriado sin fichadas: el dia no da noticia, se omite.
                if feriado_en(dia, datos_emp['sucursal_id']) is not None:
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
                    ).to_dict()
                )
            dia += timedelta(days=1)

        resultados.sort(key=lambda j: (j['fecha'], j['nombre']), reverse=True)

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
                'por_estado': dict(conteo),
            },
        })

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
        if empleado_id:
            asignaciones = asignaciones.filter(empleado_id=empleado_id)
            licencias = licencias.filter(empleado_id=empleado_id)

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

        return turno_en, licencia_en, feriado_en, seguidos


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
