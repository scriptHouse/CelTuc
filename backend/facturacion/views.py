"""Vistas de la API de facturacion.

- Emisores: leer requiere `ver_facturacion`; crear/editar/eliminar (credenciales)
  es solo de administradores (`LecturaConPermisoEscrituraAdmin`).
- Comprobantes: leer y *emitir* requieren `ver_facturacion` (`PuedeFacturar`).
- La emision real la hace `arca.servicio.emitir`; si ARCA falla, devolvemos 502
  con un mensaje claro en `detail`.
"""
import logging

from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraSuperadmin

from .arca import servicio
from .arca.errores import ErrorARCA
from .models import Comprobante, Emisor
from .permissions import PuedeFacturar
from .serializers import (
    ActualizarComprobanteSerializer,
    ComprobanteDetailSerializer,
    ComprobanteListSerializer,
    CrearComprobanteSerializer,
    EmisorSerializer,
)

logger = logging.getLogger(__name__)


# ===== Emisores =====

class EmisorListCreateView(AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Emisor.objects.all()
    serializer_class = EmisorSerializer
    permission_classes = [LecturaConPermisoEscrituraSuperadmin]
    permiso_requerido = 'ver_facturacion'


class EmisorDetailView(AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Emisor.objects.all()
    serializer_class = EmisorSerializer
    permission_classes = [LecturaConPermisoEscrituraSuperadmin]
    permiso_requerido = 'ver_facturacion'


class EmisorProbarConexionView(APIView):
    """Prueba conexion y credenciales del emisor contra ARCA, sin emitir."""

    permission_classes = [PuedeFacturar]

    def post(self, request, pk):
        emisor = get_object_or_404(Emisor, pk=pk)
        return Response(servicio.probar_conexion(emisor))


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
        usuario = request.user if request.user.is_authenticated else None
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
        salida = ComprobanteDetailSerializer(comprobante, context=self.get_serializer_context())
        return Response(salida.data, status=status.HTTP_201_CREATED)


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
