from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin, LecturaYEscrituraConPermiso

from .models import (
    Caja,
    CierreCaja,
    ConfiguracionCaja,
    MovimientoCaja,
    SesionCaja,
    abrir_caja,
    cerrar_caja,
    eliminar_movimiento,
    registrar_movimiento,
)
from .serializers import (
    AbrirCajaSerializer,
    CajaSerializer,
    CerrarCajaSerializer,
    CierreCajaSerializer,
    ConfiguracionCajaSerializer,
    CrearMovimientoSerializer,
    MovimientoCajaSerializer,
    SesionCajaSerializer,
)


class _BaseCaja:
    """Operar la caja (abrir, mover, cerrar) es trabajo del dia a dia del cajero."""

    permission_classes = [LecturaYEscrituraConPermiso]
    permiso_requerido = 'ver_caja'


class _BaseCajaAdmin:
    """Configuracion y gestion de cajas: leer con `ver_caja`, escribir solo admin."""

    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_caja'


class ConfigView(_BaseCajaAdmin, APIView):
    """Preferencias del modulo (singleton, se crea sola con los defaults)."""

    def get(self, request):
        return Response(ConfiguracionCajaSerializer(ConfiguracionCaja.instancia()).data)

    def patch(self, request):
        config = ConfiguracionCaja.instancia()
        entrada = ConfiguracionCajaSerializer(config, data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        entrada.save(actualizado_por=request.user)
        return Response(entrada.data)


class CajaListCreateView(_BaseCajaAdmin, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Caja.objects.all()
    serializer_class = CajaSerializer


class CajaDetailView(_BaseCajaAdmin, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
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
        sesion = (
            SesionCaja.objects.select_related('creado_por')
            .filter(caja=caja, estado=SesionCaja.Estado.ABIERTA)
            .first()
        )
        if sesion is None:
            return Response({'sesion': None, 'movimientos': []})
        movimientos = sesion.movimientos.select_related('creado_por').all()
        return Response({
            'sesion': SesionCajaSerializer(sesion).data,
            'movimientos': MovimientoCajaSerializer(movimientos, many=True).data,
        })


class AbiertasView(_BaseCaja, APIView):
    """Ids de las cajas con turno abierto (para el selector multi-caja)."""

    def get(self, request):
        ids = SesionCaja.objects.filter(estado=SesionCaja.Estado.ABIERTA).values_list(
            'caja_id', flat=True,
        )
        return Response(list(ids))


class AbrirCajaView(_BaseCaja, APIView):
    def post(self, request):
        entrada = AbrirCajaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
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
        movimiento = get_object_or_404(MovimientoCaja.objects.select_related('sesion'), pk=pk)
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
            'sesion', 'sesion__caja', 'sesion__creado_por', 'creado_por',
        ).prefetch_related('sesion__movimientos__creado_por')
        caja = request.query_params.get('caja')
        if caja and caja.isdigit():
            qs = qs.filter(sesion__caja_id=caja)
        try:
            limite = min(int(request.query_params.get('limite', 100)), 500)
        except ValueError:
            limite = 100
        return Response(CierreCajaSerializer(qs[:limite], many=True).data)
