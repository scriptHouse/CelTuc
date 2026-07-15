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
        qs = Venta.objects.select_related('sucursal', 'creado_por').prefetch_related(
            'items__producto',
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
        try:
            venta = registrar_venta(
                datos['sucursal'],
                [(i['producto'], i['cantidad'], i['precio_unitario']) for i in datos['items']],
                forma_pago=datos.get('forma_pago', ''),
                nota=datos.get('nota', ''),
                usuario=request.user,
            )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)

        # La venta tambien entra al arqueo: se anota como movimiento en el turno
        # abierto de la caja indicada (o de la unica abierta). Si no hay turno,
        # la venta vale igual y se devuelve el aviso para que el front lo muestre.
        movimiento_caja = None
        aviso_caja = None
        try:
            from caja.models import Caja, registrar_venta_en_caja

            caja_obj = Caja.objects.filter(pk=datos['caja']).first() if datos.get('caja') else None
            movimiento_caja = registrar_venta_en_caja(venta, caja=caja_obj, usuario=request.user)
        except ValidationError as e:
            aviso_caja = ' '.join(e.messages)
        if movimiento_caja is None and aviso_caja is None:
            aviso_caja = 'No hay un turno de caja abierto: la venta no entro en ningun arqueo.'

        data = VentaSerializer(venta).data
        data['movimiento_caja'] = movimiento_caja.pk if movimiento_caja else None
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
