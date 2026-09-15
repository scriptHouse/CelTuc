from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from inventario.models import Sucursal
from usuarios.permissions import LecturaConPermisoEscrituraAdmin, LecturaYEscrituraConPermiso

from .models import (
    Caja,
    CierreCaja,
    ConfiguracionCaja,
    MovimientoCaja,
    SesionCaja,
    abrir_caja,
    cerrar_caja,
    configurar_por_sucursal,
    deshabilitar_caja_sucursal,
    eliminar_movimiento,
    habilitar_caja_sucursal,
    puede_operar_caja,
    registrar_movimiento,
    sucursal_restringida,
)
from .serializers import (
    AbrirCajaSerializer,
    CajaSerializer,
    CambiarCajaSucursalSerializer,
    CerrarCajaSerializer,
    CierreCajaSerializer,
    ConfiguracionCajaSerializer,
    CrearMovimientoSerializer,
    ModoSucursalSerializer,
    MovimientoCajaSerializer,
    SesionCajaSerializer,
    SucursalCajaSerializer,
)


class _BaseCaja:
    """Operar la caja (abrir, mover, cerrar) es trabajo del dia a dia del cajero."""

    permission_classes = [LecturaYEscrituraConPermiso]
    permiso_requerido = 'ver_caja'


class _BaseCajaAdmin:
    """Configuracion y gestion de cajas: leer con `ver_caja`, escribir solo admin."""

    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_caja'


# Con la caja por sucursal prendida, un empleado con sucursal solo ve y opera
# las cajas de SU sucursal (admins y superadmin ven todas). Las listas se
# filtran y lo de otra sucursal responde 404 al leer y 403 al operar.
OTRA_SUCURSAL = 'Esa caja es de otra sucursal: solo podes operar la caja de tu sucursal.'


def _prohibido_otra_sucursal():
    return Response({'detail': OTRA_SUCURSAL}, status=403)


class ConfigView(_BaseCajaAdmin, APIView):
    """Preferencias del modulo (singleton, se crea sola con los defaults)."""

    def get(self, request):
        return Response(ConfiguracionCajaSerializer(ConfiguracionCaja.instancia()).data)

    def patch(self, request):
        config = ConfiguracionCaja.instancia()
        entrada = ConfiguracionCajaSerializer(config, data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        # Cambiar de modo (caja por sucursal) no es un campo mas: valida que no
        # queden turnos abiertos y arma las cajas de cada sucursal. Va junto con
        # el resto del PATCH, todo o nada.
        modo = None
        if 'por_sucursal' in request.data:
            modo = ModoSucursalSerializer(data=request.data)
            modo.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                if modo is not None:
                    configurar_por_sucursal(
                        activar=modo.validated_data['por_sucursal'],
                        sucursales=modo.validated_data.get('sucursales_con_caja'),
                        usuario=request.user,
                    )
                    # El serializer guarda la fila entera: sin refrescar pisaria
                    # el modo recien cambiado con el valor viejo.
                    config.refresh_from_db()
                entrada.save(actualizado_por=request.user)
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response(ConfiguracionCajaSerializer(config).data)


def _sucursales_para_caja():
    """Las sucursales activas (y las que conservan cajas) con su estado de caja."""
    cajas_activas = Caja.objects.filter(sucursal=OuterRef('pk'), activa=True)
    turnos = SesionCaja.objects.filter(
        caja__sucursal=OuterRef('pk'), caja__borrado=False, estado=SesionCaja.Estado.ABIERTA,
    )
    return Sucursal.objects.annotate(
        tiene_caja=Exists(cajas_activas),
        turno_abierto=Exists(turnos),
    )


class SucursalesCajaView(_BaseCajaAdmin, APIView):
    """Que sucursales tienen caja (para el selector y la configuracion)."""

    def get(self, request):
        qs = _sucursales_para_caja().order_by('orden', 'nombre')
        propia = sucursal_restringida(request.user)
        if propia is not None:
            qs = qs.filter(pk=propia.pk)
        visibles = [s for s in qs if s.activa or s.tiene_caja]
        return Response(SucursalCajaSerializer(visibles, many=True).data)


class SucursalCajaDetailView(_BaseCajaAdmin, APIView):
    """PATCH `{tiene_caja}`: darle o quitarle la caja a una sucursal (solo admin)."""

    def patch(self, request, pk):
        sucursal = get_object_or_404(Sucursal, pk=pk)
        entrada = CambiarCajaSucursalSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            if entrada.validated_data['tiene_caja']:
                habilitar_caja_sucursal(sucursal, usuario=request.user)
            else:
                deshabilitar_caja_sucursal(sucursal, usuario=request.user)
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response(SucursalCajaSerializer(_sucursales_para_caja().get(pk=pk)).data)


class _CajasVisiblesMixin:
    """Las cajas que el usuario puede ver (todas, o las de su sucursal)."""

    def get_queryset(self):
        qs = Caja.objects.all()
        propia = sucursal_restringida(self.request.user)
        if propia is not None:
            qs = qs.filter(sucursal=propia)
        return qs


class CajaListCreateView(
    _BaseCajaAdmin, AuditoriaMixin, _CajasVisiblesMixin, generics.ListCreateAPIView,
):
    queryset = Caja.objects.all()
    serializer_class = CajaSerializer


class CajaDetailView(
    _BaseCajaAdmin, AuditoriaMixin, _CajasVisiblesMixin, generics.RetrieveUpdateDestroyAPIView,
):
    # El DELETE hace borrado logico (AuditoriaMixin.perform_destroy).
    queryset = Caja.objects.all()
    serializer_class = CajaSerializer

    def perform_destroy(self, instance):
        if Caja.objects.exclude(pk=instance.pk).count() == 0:
            raise ValidationError('Tiene que quedar al menos una caja.')
        if SesionCaja.objects.filter(caja=instance, estado=SesionCaja.Estado.ABIERTA).exists():
            raise ValidationError('Cerra el turno de esa caja antes de eliminarla.')
        super().perform_destroy(instance)

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)


class EstadoCajaView(_BaseCaja, APIView):
    """El turno abierto de una caja (o null) con sus movimientos en orden."""

    def get(self, request, pk):
        caja = get_object_or_404(Caja, pk=pk)
        if not puede_operar_caja(request.user, caja):
            raise Http404
        sesion = (
            SesionCaja.objects.select_related('creado_por')
            .filter(caja=caja, estado=SesionCaja.Estado.ABIERTA)
            .first()
        )
        if sesion is None:
            return Response({'sesion': None, 'movimientos': []})
        movimientos = sesion.movimientos.select_related('creado_por', 'venta', 'pago').all()
        return Response({
            'sesion': SesionCajaSerializer(sesion).data,
            'movimientos': MovimientoCajaSerializer(movimientos, many=True).data,
        })


class AbiertasView(_BaseCaja, APIView):
    """Ids de las cajas con turno abierto (para el selector multi-caja)."""

    def get(self, request):
        qs = SesionCaja.objects.filter(estado=SesionCaja.Estado.ABIERTA)
        propia = sucursal_restringida(request.user)
        if propia is not None:
            qs = qs.filter(caja__sucursal=propia)
        return Response(list(qs.values_list('caja_id', flat=True)))


class AbrirCajaView(_BaseCaja, APIView):
    def post(self, request):
        entrada = AbrirCajaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        if not puede_operar_caja(request.user, datos['caja']):
            return _prohibido_otra_sucursal()
        try:
            sesion = abrir_caja(
                datos['caja'],
                fondo_inicial=datos['fondo_inicial'],
                conteo_apertura=datos.get('conteo_apertura'),
                nota_apertura=datos.get('nota_apertura', ''),
                usuario=request.user,
            )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response(SesionCajaSerializer(sesion).data, status=201)


class MovimientosView(_BaseCaja, APIView):
    """POST registra un movimiento manual (ingreso / egreso / retiro)."""

    def post(self, request):
        entrada = CrearMovimientoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        if not puede_operar_caja(request.user, datos['sesion'].caja):
            return _prohibido_otra_sucursal()
        try:
            movimiento = registrar_movimiento(
                datos['sesion'],
                tipo=datos['tipo'],
                medio=datos.get('medio', ''),
                monto=datos['monto'],
                motivo=datos['motivo'],
                detalle=datos.get('detalle', ''),
                usuario=request.user,
            )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response(MovimientoCajaSerializer(movimiento).data, status=201)


class MovimientoDetailView(_BaseCaja, APIView):
    def delete(self, request, pk):
        movimiento = get_object_or_404(
            MovimientoCaja.objects.select_related('sesion', 'sesion__caja'), pk=pk,
        )
        if not puede_operar_caja(request.user, movimiento.sesion.caja):
            return _prohibido_otra_sucursal()
        try:
            eliminar_movimiento(movimiento, usuario=request.user)
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response(status=204)


class CerrarCajaView(_BaseCaja, APIView):
    def post(self, request):
        entrada = CerrarCajaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        if not puede_operar_caja(request.user, datos['sesion'].caja):
            return _prohibido_otra_sucursal()
        try:
            cierre = cerrar_caja(
                datos['sesion'],
                contado_por_medio=datos['contado_por_medio'],
                conteo_cierre=datos.get('conteo_cierre'),
                fondo_siguiente=datos['fondo_siguiente'],
                motivo_diferencia=datos.get('motivo_diferencia', ''),
                nota_diferencia=datos.get('nota_diferencia', ''),
                usuario=request.user,
            )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response(CierreCajaSerializer(cierre).data, status=201)


class CierresView(_BaseCaja, APIView):
    """Historial de comprobantes Z (mas recientes primero)."""

    def get(self, request):
        qs = CierreCaja.objects.select_related(
            'sesion', 'sesion__caja', 'sesion__caja__sucursal', 'sesion__creado_por', 'creado_por',
        ).prefetch_related(
            'sesion__movimientos__creado_por',
            'sesion__movimientos__venta',
            'sesion__movimientos__pago',
        )
        caja = request.query_params.get('caja')
        if caja and caja.isdigit():
            qs = qs.filter(sesion__caja_id=caja)
        sucursal = request.query_params.get('sucursal')
        if sucursal and sucursal.isdigit():
            qs = qs.filter(sesion__caja__sucursal_id=sucursal)
        propia = sucursal_restringida(request.user)
        if propia is not None:
            qs = qs.filter(sesion__caja__sucursal=propia)
        try:
            limite = min(int(request.query_params.get('limite', 100)), 500)
        except ValueError:
            limite = 100
        return Response(CierreCajaSerializer(qs[:limite], many=True).data)
