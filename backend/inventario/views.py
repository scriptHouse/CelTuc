import logging

from django.core.exceptions import ValidationError
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin, LecturaYEscrituraConPermiso

from .models import (
    MovimientoStock,
    StockProducto,
    Sucursal,
    Venta,
    aplicar_ajuste,
    aplicar_transferencia,
    registrar_venta,
)
from .serializers import (
    AjusteStockSerializer,
    CrearVentaSerializer,
    MovimientoStockSerializer,
    StockProductoSerializer,
    SucursalSerializer,
    TransferenciaStockSerializer,
    VentaSerializer,
)

logger = logging.getLogger(__name__)


class _BaseInventario:
    """Lectura con `ver_inventario`; la escritura la define cada vista."""

    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_inventario'


class SucursalListCreateView(_BaseInventario, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Sucursal.objects.all()
    serializer_class = SucursalSerializer


class SucursalDetailView(_BaseInventario, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    # El DELETE hace borrado logico (AuditoriaMixin.perform_destroy).
    queryset = Sucursal.objects.all()
    serializer_class = SucursalSerializer


class StockListView(_BaseInventario, generics.ListAPIView):
    """Todas las filas de stock (el front cruza con el catalogo por id)."""

    serializer_class = StockProductoSerializer

    def get_queryset(self):
        qs = StockProducto.objects.select_related('sucursal').filter(
            producto__borrado=False, sucursal__borrado=False,
        )
        sucursal = self.request.query_params.get('sucursal')
        if sucursal:
            qs = qs.filter(sucursal_id=sucursal)
        return qs


class AjustarStockView(_BaseInventario, APIView):
    """Ajuste de mostrador: lo puede hacer cualquier cuenta con `ver_inventario`.

    (A diferencia de los precios, que son solo-admin: reponer y descontar
    stock es trabajo del dia a dia de los empleados.)
    """

    permission_classes = [LecturaYEscrituraConPermiso]

    def post(self, request):
        entrada = AjusteStockSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        movimiento = None
        try:
            if 'delta' in datos or 'cantidad' in datos:
                fila, movimiento = aplicar_ajuste(
                    datos['producto'], datos['sucursal'],
                    delta=datos.get('delta'),
                    cantidad=datos.get('cantidad'),
                    tipo=datos.get('tipo', ''),
                    nota=datos.get('nota', ''),
                    usuario=request.user,
                )
            else:
                fila, _ = StockProducto.objects.get_or_create(
                    producto=datos['producto'], sucursal=datos['sucursal'],
                )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)

        if 'stock_minimo' in datos:
            fila.stock_minimo = datos['stock_minimo']
            fila.actualizado_por = request.user
            fila.save(update_fields=['stock_minimo', 'actualizado_por'])

        return Response({
            'stock': StockProductoSerializer(fila).data,
            'movimiento': MovimientoStockSerializer(movimiento).data if movimiento else None,
        })


class TransferirStockView(_BaseInventario, APIView):
    """Transferencia entre sucursales en una sola operacion."""

    permission_classes = [LecturaYEscrituraConPermiso]

    def post(self, request):
        entrada = TransferenciaStockSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        try:
            salida, entrada_fila = aplicar_transferencia(
                datos['producto'], datos['origen'], datos['destino'], datos['cantidad'],
                nota=datos.get('nota', ''), usuario=request.user,
            )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response({
            'origen': StockProductoSerializer(salida).data,
            'destino': StockProductoSerializer(entrada_fila).data,
        })


class VentasView(_BaseInventario, APIView):
    """Ventas de mostrador: POST registra y descuenta stock; GET lista.

    Como los ajustes, la puede usar cualquier cuenta con `ver_inventario`.
    """

    permission_classes = [LecturaYEscrituraConPermiso]

    def get(self, request):
        qs = Venta.objects.select_related('sucursal', 'creado_por', 'cliente').prefetch_related(
            'items__producto', 'pagos',
        )
        sucursal = request.query_params.get('sucursal')
        if sucursal:
            qs = qs.filter(sucursal_id=sucursal)
        try:
            limite = min(int(request.query_params.get('limite', 50)), 500)
        except ValueError:
            limite = 50
        return Response(VentaSerializer(qs[:limite], many=True).data)

    def post(self, request):
        entrada = CrearVentaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        usuario = request.user if request.user.is_authenticated else None
        # A quien se le vende: uno ya guardado o los datos cargados a mano (que
        # dan de alta el cliente con la misma logica que una factura). Nunca
        # frena la venta: si algo falla, la venta se registra sin cliente.
        cliente = datos.get('cliente')
        if cliente is None and datos.get('cliente_datos'):
            try:
                from facturacion.clientes import registrar_cliente

                cliente = registrar_cliente(usuario=usuario, **datos['cliente_datos'])
            except Exception:
                logger.exception('No se pudo registrar el cliente de la venta')
        try:
            venta = registrar_venta(
                datos['sucursal'],
                datos['items'],  # ya normalizados por el serializer (producto/service/otro)
                forma_pago=datos.get('forma_pago', ''),
                facturacion=datos.get('facturacion', ''),
                nota=datos.get('nota', ''),
                cliente=cliente,
                usuario=usuario,
                permitir_faltante=datos.get('permitir_faltante', False),
                pagos=datos.get('pagos'),
            )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)

        # La venta tambien entra al arqueo: se anota como movimiento en el turno
        # abierto de la caja indicada (o de la unica abierta). Cobrada con varios
        # medios genera un movimiento por medio. Si no hay turno, la venta vale
        # igual y se devuelve el aviso para que el front lo muestre.
        movimientos_caja = []
        aviso_caja = None
        try:
            from caja.models import Caja, registrar_venta_en_caja

            caja_obj = Caja.objects.filter(pk=datos['caja']).first() if datos.get('caja') else None
            movimientos_caja, avisos = registrar_venta_en_caja(
                venta, caja=caja_obj, usuario=request.user,
            )
            # Puede haber entrado una parte y otra no (cajas de distinto canal).
            aviso_caja = ' '.join(avisos) if avisos else None
        except ValidationError as e:
            aviso_caja = ' '.join(e.messages)
        if not movimientos_caja and aviso_caja is None:
            aviso_caja = 'No hay un turno de caja abierto: la venta no entro en ningun arqueo.'

        data = VentaSerializer(venta).data
        # `movimiento_caja` (singular) se mantiene por compatibilidad: es el
        # primero. `movimientos_caja` trae todos (uno por medio cobrado).
        data['movimiento_caja'] = movimientos_caja[0].pk if movimientos_caja else None
        data['movimientos_caja'] = [m.pk for m in movimientos_caja]
        # Nombre de la caja donde quedo anotada (el enrutamiento por canal
        # fiscal puede mandarla a otra caja que la seleccionada en pantalla).
        data['caja_arqueo'] = (
            movimientos_caja[0].sesion.caja.nombre if movimientos_caja else None
        )
        data['aviso_caja'] = aviso_caja
        return Response(data, status=201)


class MovimientoListView(_BaseInventario, generics.ListAPIView):
    """Kardex: los ultimos movimientos, filtrables por producto y sucursal."""

    serializer_class = MovimientoStockSerializer

    def get_queryset(self):
        qs = MovimientoStock.objects.select_related('sucursal', 'creado_por').filter(
            producto__borrado=False,
        )
        producto = self.request.query_params.get('producto')
        sucursal = self.request.query_params.get('sucursal')
        if producto:
            qs = qs.filter(producto_id=producto)
        if sucursal:
            qs = qs.filter(sucursal_id=sucursal)
        try:
            limite = min(int(self.request.query_params.get('limite', 100)), 500)
        except ValueError:
            limite = 100
        return qs[:limite]
