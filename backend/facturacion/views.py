"""Vistas de la API de facturacion.

- Emisores: leer requiere `ver_facturacion`; crear/editar/eliminar (credenciales)
  es solo de administradores (`LecturaConPermisoEscrituraAdmin`).
- Comprobantes: leer y *emitir* requieren `ver_facturacion` (`PuedeFacturar`).
- Notas de credito: mismo permiso que emitir (acreditar es operacion de
  mostrador) y mismo manejo de errores.
- La emision real la hace `arca.servicio.emitir`; si ARCA falla, devolvemos 502
  con un mensaje claro en `detail`.
"""
import base64
import logging

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import (
    EsAdministrador,
    LecturaConPermisoEscrituraAdmin,
    LecturaConPermisoEscrituraSuperadmin,
)

from . import logica
from .arca import servicio
from .arca.errores import ErrorARCA
from .clientes import registrar_cliente_desde_comprobante
from .concepto import agrupar_en_concepto
from .email import EmailNoConfigurado, enviar_comprobante
from .limites import estado_limites_del_anio, guardar_limites, verificar_limite_mensual
from .models import Cliente, Comprobante, ConceptoFactura, Emisor
from .permissions import PuedeFacturar
from .resumen import resumen_mensual
from .serializers import (
    ActualizarComprobanteSerializer,
    ClienteDetalleSerializer,
    ClienteSerializer,
    ClienteWriteSerializer,
    ComprobanteDetailSerializer,
    ComprobanteListSerializer,
    ConceptoFacturaSerializer,
    CrearComprobanteSerializer,
    CrearNotaCreditoSerializer,
    DevolverStockSerializer,
    EmisorSerializer,
    EnviarEmailSerializer,
    GuardarLimitesSerializer,
)

logger = logging.getLogger(__name__)


def _solo_digitos(valor: str) -> str:
    import re
    return re.sub(r'\D', '', valor or '')


def _descontar_stock(comprobante, sucursal, items, productos, usuario):
    """Descuenta stock por los items facturados con producto del catalogo.

    Devuelve la lista de avisos legibles por lo que NO se pudo descontar. La
    factura ya esta emitida en ARCA, asi que aca nunca se levanta error.
    """
    if sucursal is None or not any(productos):
        return []
    from django.core.exceptions import ValidationError

    from inventario.models import MovimientoStock, aplicar_ajuste

    avisos = []
    nota = f'Factura {comprobante.tipo} {comprobante.numero_formateado}'
    for item, producto in zip(items, productos):
        if producto is None:
            continue
        cantidad = item['cantidad']
        if cantidad != int(cantidad):
            avisos.append(f'"{item["descripcion"]}": la cantidad no es entera, '
                          'el stock quedo sin descontar.')
            continue
        try:
            aplicar_ajuste(
                producto, sucursal,
                delta=-int(cantidad),
                tipo=MovimientoStock.Tipo.VENTA,
                nota=nota,
                usuario=usuario,
            )
        except ValidationError as exc:
            avisos.append(' '.join(exc.messages))
        except Exception:  # el stock jamas voltea una factura emitida
            logger.exception('Error descontando stock del comprobante %s', comprobante.pk)
            avisos.append(f'"{item["descripcion"]}": no se pudo descontar el stock.')
    return avisos


# ===== Emisores =====

class _EmisoresVisiblesMixin:
    """Los facturadores ven SOLO emisores activos; el superadmin ve todos
    (incluidos los inactivos, para poder reactivarlos)."""

    def get_queryset(self):
        qs = Emisor.objects.all()
        if not self.request.user.is_superuser:
            qs = qs.filter(activo=True)
        return qs


class EmisorListCreateView(_EmisoresVisiblesMixin, AuditoriaMixin, generics.ListCreateAPIView):
    serializer_class = EmisorSerializer
    permission_classes = [LecturaConPermisoEscrituraSuperadmin]
    permiso_requerido = 'ver_facturacion'


class EmisorDetailView(_EmisoresVisiblesMixin, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EmisorSerializer
    permission_classes = [LecturaConPermisoEscrituraSuperadmin]
    permiso_requerido = 'ver_facturacion'


# ===== Banco de conceptos =====

class _ConceptosVisiblesMixin:
    """Quien factura ve solo los conceptos ACTIVOS (los que puede elegir); el
    administrador ve todos, para poder editarlos y reactivarlos."""

    def get_queryset(self):
        qs = ConceptoFactura.objects.all()
        if not getattr(self.request.user, 'es_administrador', False):
            qs = qs.filter(activo=True)
        return qs


class ConceptoListCreateView(_ConceptosVisiblesMixin, AuditoriaMixin, generics.ListCreateAPIView):
    """Banco de conceptos: leer para elegir uno al facturar, escribir es de admins."""

    serializer_class = ConceptoFacturaSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_facturacion'


class ConceptoDetailView(_ConceptosVisiblesMixin, AuditoriaMixin,
                         generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ConceptoFacturaSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_facturacion'


class EmisorProbarConexionView(APIView):
    """Prueba conexion y credenciales del emisor contra ARCA, sin emitir."""

    permission_classes = [PuedeFacturar]

    def post(self, request, pk):
        emisor = get_object_or_404(Emisor, pk=pk)
        return Response(servicio.probar_conexion(emisor))


class EmisorLimitesView(APIView):
    """Limites de facturacion mensual del emisor (control interno, sin ARCA).

    - GET ``?anio=2026``: los 12 meses del año con su tope (o null) y lo ya
      facturado en cada uno. Lo puede ver quien factura (para la barra de uso).
    - PUT ``{anio, limites: [{mes, monto|null}]}``: aplica los topes de los meses
      recibidos de una vez (uno solo o varios); monto null quita el limite. Lo
      puede hacer cualquier administrador (a diferencia de editar el emisor, que
      toca credenciales y sigue siendo solo del superadministrador): el tope es
      un control interno de gestion y no afecta la emision en ARCA.
    """

    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_facturacion'

    def _anio(self, crudo):
        try:
            anio = int(crudo)
        except (TypeError, ValueError):
            return None
        return anio if 2000 <= anio <= 2100 else None

    def get(self, request, pk):
        emisor = get_object_or_404(Emisor, pk=pk)
        anio = self._anio(request.query_params.get('anio'))
        if anio is None:
            anio = timezone.localdate().year
        return Response({'anio': anio, 'limites': estado_limites_del_anio(emisor, anio)})

    def put(self, request, pk):
        emisor = get_object_or_404(Emisor, pk=pk)
        entrada = GuardarLimitesSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        anio = entrada.validated_data['anio']
        usuario = request.user if request.user.is_authenticated else None
        guardar_limites(emisor, anio, entrada.validated_data['limites'], usuario=usuario)
        return Response({'anio': anio, 'limites': estado_limites_del_anio(emisor, anio)})


# ===== Comprobantes =====

class ComprobanteListCreateView(generics.ListCreateAPIView):
    permission_classes = [PuedeFacturar]

    def get_queryset(self):
        qs = Comprobante.objects.select_related('emisor').prefetch_related('items')
        emisor = self.request.query_params.get('emisor')
        if emisor:
            qs = qs.filter(emisor_id=emisor)
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado_cobro=estado)
        # `?clase=factura` / `?clase=nota_credito` para ver solo unas u otras.
        clase = self.request.query_params.get('clase')
        if clase in Comprobante.Clase.values:
            qs = qs.filter(clase=clase)
        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CrearComprobanteSerializer
        return ComprobanteListSerializer

    def create(self, request, *args, **kwargs):
        entrada = CrearComprobanteSerializer(data=request.data, context=self.get_serializer_context())
        entrada.is_valid(raise_exception=True)
        datos = dict(entrada.validated_data)
        emisor = datos.pop('emisor')
        # Datos de stock: se separan ANTES de emitir (ARCA no los conoce).
        sucursal_stock = datos.pop('sucursal_stock', None)
        confirmar_limite = datos.pop('confirmar_limite', False)
        # Concepto elegido para ESTA factura (o None = detalle real). Lo elige
        # quien factura en el modal; no cambia nada del banco de conceptos.
        concepto = datos.pop('concepto_generico', None)
        # Venta de mostrador que origina esta factura (opcional, viene de Caja).
        venta_origen = datos.pop('venta', None)
        items_limpios, productos_stock = [], []
        for item in datos['items']:
            item = dict(item)
            productos_stock.append(item.pop('producto', None))
            item.pop('item_service', None)  # solo trazabilidad; no viaja a emitir
            items_limpios.append(item)
        # Con concepto elegido, TODOS los renglones se juntan en uno solo. Cambia
        # el DETALLE que se guarda y se imprime, nada mas: los totales se calculan
        # despues, sobre esta lista, y ARCA no recibe renglones. `items_limpios`
        # queda intacto para el stock.
        datos['items'] = (
            agrupar_en_concepto(items_limpios, concepto.texto) if concepto else items_limpios
        )
        usuario = request.user if request.user.is_authenticated else None
        # Control interno de limite mensual, ANTES de pedir el CAE (no toca la
        # logica de ARCA): si el mes queda pasado del tope se devuelve 409 y el
        # front pide confirmacion; con `confirmar_limite` se emite igual.
        if not confirmar_limite:
            aviso_limite = verificar_limite_mensual(emisor, datos)
            if aviso_limite:
                return Response(aviso_limite, status=status.HTTP_409_CONFLICT)
        try:
            comprobante = servicio.emitir(emisor, datos, usuario=usuario)
        except ErrorARCA as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:  # nunca devolvemos un 500 opaco al facturar
            logger.exception('Error inesperado al emitir comprobante')
            return Response(
                {'detail': f'Error inesperado al emitir: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        # La factura ya salio (tiene CAE): el stock se descuenta a continuacion y
        # si algo no se puede (sin stock, cantidad no entera) se AVISA, jamas se
        # anula la emision ni se deja stock negativo.
        avisos_stock = _descontar_stock(comprobante, sucursal_stock, items_limpios,
                                        productos_stock, usuario)
        # Alimenta la base de clientes con lo cargado en la factura. Es secundario:
        # jamas puede voltear una emision ya autorizada (por eso el try/except).
        cliente = None
        try:
            cliente = registrar_cliente_desde_comprobante(comprobante)
        except Exception:
            logger.exception('No se pudo registrar el cliente del comprobante %s', comprobante.pk)
        # Si la factura nacio de una venta de mostrador, la venta queda apuntada
        # a esta factura (para no contar la misma plata dos veces en el historial
        # del cliente) y hereda el cliente si no tenia. Tambien es secundario.
        if venta_origen is not None:
            try:
                venta_origen.comprobante = comprobante
                campos = ['comprobante']
                if cliente is not None and venta_origen.cliente_id is None:
                    venta_origen.cliente = cliente
                    campos.append('cliente')
                venta_origen.save(update_fields=campos)
            except Exception:
                logger.exception('No se pudo ligar la venta %s al comprobante %s',
                                 venta_origen.pk, comprobante.pk)
        salida = ComprobanteDetailSerializer(comprobante, context=self.get_serializer_context())
        cuerpo = dict(salida.data)
        if avisos_stock:
            cuerpo['avisos_stock'] = avisos_stock
        return Response(cuerpo, status=status.HTTP_201_CREATED)


class NotaCreditoCreateView(APIView):
    """POST: emite la nota de credito que acredita esta factura.

    Mismo permiso que emitir (`PuedeFacturar`): acreditar es una operacion de
    mostrador. El limite mensual NO se chequea porque una nota de credito RESTA
    de lo facturado del mes: nunca lo hace superar el tope.

    Los motivos por los que no se puede acreditar (ya esta acreditada del todo,
    el importe se pasa del saldo, la fecha es anterior a la factura) se
    responden con 400 y un mensaje claro ANTES de hablar con ARCA; los fallos de
    ARCA siguen siendo 502, igual que al facturar.
    """

    permission_classes = [PuedeFacturar]

    def post(self, request, pk):
        origen = get_object_or_404(
            Comprobante.objects.select_related('emisor').prefetch_related('items'), pk=pk,
        )
        entrada = CrearNotaCreditoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = dict(entrada.validated_data)

        problema = _revisar_nota_credito(origen, datos)
        if problema:
            return Response({'detail': problema}, status=status.HTTP_400_BAD_REQUEST)

        usuario = request.user if request.user.is_authenticated else None
        try:
            nota = servicio.emitir_nota_credito(origen, datos, usuario=usuario)
        except ErrorARCA as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:  # nunca un 500 opaco al acreditar
            logger.exception('Error inesperado al emitir la nota de credito de %s', origen.pk)
            return Response(
                {'detail': f'Error inesperado al emitir la nota de credito: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        salida = ComprobanteDetailSerializer(nota, context=self.get_serializer_context())
        return Response(salida.data, status=status.HTTP_201_CREATED)

    def get_serializer_context(self):
        return {'request': self.request, 'view': self}


def _revisar_nota_credito(origen, datos) -> str:
    """Devuelve el motivo por el que NO se puede acreditar, o '' si se puede."""
    from decimal import Decimal

    if origen.es_nota_credito:
        return 'Una nota de credito no se puede acreditar.'
    if not origen.cae:
        return 'La factura no tiene CAE: no hay nada que acreditar en ARCA.'
    saldo = origen.saldo_acreditable
    if saldo <= 0:
        return (
            f'La factura {origen.numero_formateado} ya esta acreditada por completo '
            f'({origen.acreditado}).'
        )
    totales = logica.calcular_totales(
        datos['items'], origen.tipo, origen.alicuota_iva or Decimal('21'),
    )
    if totales['total'] <= 0:
        return 'El total de la nota de credito debe ser mayor a cero.'
    if totales['total'] > saldo + Decimal('0.01'):
        return (
            f'La nota de credito ({totales["total"]}) supera lo que queda por acreditar '
            f'de la factura ({saldo}).'
        )
    fecha = datos.get('fecha')
    if fecha and fecha < origen.fecha:
        return 'La nota de credito no puede tener fecha anterior a la factura.'
    return ''


class DevolverStockNotaCreditoView(APIView):
    """POST: devuelve al inventario la mercaderia de una nota de credito.

    Es OPCIONAL y va aparte de la emision: la nota ya salio con su CAE y esto
    solo mueve stock. Lo dispara la persona contestando que si en el modal que
    aparece despues de acreditar; si dice que no, no pasa nada (y siempre puede
    cargar el ingreso a mano desde Inventario).

    Que producto vuelve y cuanto llega decidido desde la pantalla: los renglones
    del comprobante son texto (y con concepto generico son uno solo), asi que el
    sistema no puede deducirlo.

    Mismo permiso que emitir, igual que el descuento de stock al facturar: son
    las dos caras de la misma operacion de mostrador.
    """

    permission_classes = [PuedeFacturar]

    def post(self, request, pk):
        nota = get_object_or_404(Comprobante.objects.select_related('emisor'), pk=pk)
        if not nota.es_nota_credito:
            return Response(
                {'detail': 'Solo una nota de credito devuelve mercaderia al stock.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entrada = DevolverStockSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        sucursal = datos['sucursal']

        from django.core.exceptions import ValidationError

        from inventario.models import MovimientoStock, aplicar_ajuste

        # Texto con el que queda firmado el movimiento en Inventario. Sirve
        # ademas de guarda: si ya hay movimientos con esta nota, el stock de
        # esta nota de credito ya se devolvio y no se repite (un doble clic o un
        # reintento no puede duplicar unidades).
        etiqueta = f'{nota.nombre_comprobante} {nota.numero_formateado}'
        if MovimientoStock.objects.filter(nota=etiqueta).exists():
            return Response(
                {'detail': f'El stock de esta nota ya se devolvio ({etiqueta}). '
                           'Miralo en los movimientos de Inventario.'},
                status=status.HTTP_409_CONFLICT,
            )

        usuario = request.user if request.user.is_authenticated else None
        avisos, movidos, unidades = [], 0, 0
        for fila in datos['items']:
            producto, cantidad = fila['producto'], fila['cantidad']
            try:
                aplicar_ajuste(
                    producto, sucursal,
                    delta=cantidad,
                    tipo=MovimientoStock.Tipo.INGRESO,
                    nota=etiqueta,
                    usuario=usuario,
                )
                movidos += 1
                unidades += cantidad
            except ValidationError as exc:
                avisos.append(' '.join(exc.messages))
            except Exception:  # el inventario jamas voltea una nota ya emitida
                logger.exception('Error devolviendo stock de la nota %s', nota.pk)
                avisos.append(f'"{producto.nombre}": no se pudo sumar al stock.')

        return Response({
            'detail': (
                f'{unidades} unidad{"" if unidades == 1 else "es"} de vuelta en '
                f'{sucursal.nombre}.'
                if movidos
                else 'No se pudo sumar ninguna unidad al stock.'
            ),
            'movimientos': movidos,
            'unidades': unidades,
            'avisos': avisos,
        })


class ResumenMensualView(APIView):
    """Lo facturado en un mes, por dia y por medio de cobro (ver `resumen.py`).

    Alimenta el boton "Exportar facturacion" (Facturacion y Panel). Son numeros
    del negocio: SOLO administradores, igual que los KPIs del Panel.

    ``GET ?anio=2026&mes=8[&emisores=1,2][&incluir_ocultos=1]``. Sin anio/mes
    se toma el mes en curso.
    """

    permission_classes = [EsAdministrador]

    def get(self, request):
        hoy = timezone.localdate()
        try:
            anio = int(request.query_params.get('anio') or hoy.year)
            mes = int(request.query_params.get('mes') or hoy.month)
        except (TypeError, ValueError):
            return Response({'detail': 'Año o mes inválidos.'}, status=status.HTTP_400_BAD_REQUEST)
        if not (2000 <= anio <= 2100) or not (1 <= mes <= 12):
            return Response({'detail': 'Año o mes inválidos.'}, status=status.HTTP_400_BAD_REQUEST)
        crudo = request.query_params.get('emisores') or ''
        try:
            emisores = [int(parte) for parte in crudo.split(',') if parte.strip()]
        except ValueError:
            return Response({'detail': 'Cuentas inválidas.'}, status=status.HTTP_400_BAD_REQUEST)
        incluir_ocultos = (request.query_params.get('incluir_ocultos') or '').lower() in ('1', 'true', 'si')
        return Response(resumen_mensual(anio, mes, emisores=emisores, incluir_ocultos=incluir_ocultos))


class ComprobanteDetailView(AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Comprobante.objects.select_related('emisor').prefetch_related('items')
    permission_classes = [PuedeFacturar]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return ActualizarComprobanteSerializer
        return ComprobanteDetailSerializer

    def update(self, request, *args, **kwargs):
        # Un comprobante emitido es inmutable a nivel fiscal: solo cambia su estado
        # de cobro y las observaciones. Devolvemos el detalle completo, igual.
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ActualizarComprobanteSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        instance.refresh_from_db()
        detalle = ComprobanteDetailSerializer(instance, context=self.get_serializer_context())
        return Response(detalle.data)


class EnviarComprobanteEmailView(APIView):
    """Envia por email el PDF de un comprobante. El PDF lo genera el front (mismo
    que se descarga) y lo manda en base64; aca solo se adjunta y se envia por SMTP.
    Es una funcionalidad aparte: no afecta la emision ni el resto del modulo."""

    permission_classes = [PuedeFacturar]

    def post(self, request, pk):
        comprobante = get_object_or_404(Comprobante, pk=pk)
        entrada = EnviarEmailSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        crudo = datos['pdf_base64']
        if ',' in crudo:  # tolera un data URL "data:application/pdf;base64,XXXX"
            crudo = crudo.split(',', 1)[1]
        try:
            pdf_bytes = base64.b64decode(crudo, validate=True)
        except Exception:
            return Response({'detail': 'El PDF adjunto no es válido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            enviar_comprobante(comprobante, datos['email'], pdf_bytes, datos.get('mensaje'))
        except EmailNoConfigurado as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as exc:  # SMTP caido, credenciales mal, etc.
            logger.exception('Error enviando comprobante por email')
            return Response(
                {'detail': f'No se pudo enviar el email: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'detail': f'Factura enviada a {datos["email"]}.'})


# ===== Clientes =====

class ClienteListView(generics.ListAPIView):
    """Base de clientes: autocompletado del formulario y lista del gestor.

    - `?buscar=` filtra por nombre, teléfono, email o documento.
    - `?stats=1` agrega a cada cliente cantidad de compras, total gastado y última
      compra (facturas + ventas de mostrador). Lo pide la página de Clientes; el
      autocompletado no, para ser liviano.
    """

    serializer_class = ClienteSerializer
    permission_classes = [PuedeFacturar]

    def get_queryset(self):
        qs = Cliente.objects.all()
        buscar = (self.request.query_params.get('buscar') or '').strip()
        if buscar:
            filtro = (
                Q(nombre__icontains=buscar)
                | Q(telefono__icontains=buscar)
                | Q(email__icontains=buscar)
            )
            digitos = _solo_digitos(buscar)
            if digitos:
                filtro |= Q(doc_numero__icontains=digitos) | Q(telefono__icontains=digitos)
            qs = qs.filter(filtro)
        # El autocompletado del formulario (sin `stats`) solo necesita unas pocas
        # sugerencias; el gestor pide la base completa con `?stats=1`.
        if not self.request.query_params.get('stats'):
            qs = qs[:20]
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.request.query_params.get('stats'):
            from .clientes import stats_por_cliente
            ctx['stats'] = stats_por_cliente()
        return ctx


class ClienteDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Detalle del cliente con su historial de compras; permite editar y eliminar.

    El historial trae los dos tipos de compra: facturas y ventas de mostrador.
    El borrado es lógico (lo saca de la base) y NO toca los comprobantes ni las
    ventas: son documentos y movimientos independientes.
    """

    queryset = Cliente.objects.all()
    permission_classes = [PuedeFacturar]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return ClienteWriteSerializer
        return ClienteDetalleSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ClienteWriteSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        return Response(ClienteDetalleSerializer(instance).data)
