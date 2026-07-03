from django.db.models import Prefetch
from rest_framework import generics

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin

from .models import ConfiguracionService, ItemService, SeccionService
from .serializers import (
    ConfiguracionServiceSerializer,
    ItemServiceSerializer,
    SeccionServiceSerializer,
)


class _BaseService:
    """Permisos comunes: leer con el permiso del modulo, escribir solo admin."""

    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_precios_service'

    def get_serializer_context(self):
        # La configuracion se resuelve UNA vez por peticion y la usan todos los
        # items para calcular sus precios efectivos.
        contexto = super().get_serializer_context()
        contexto['config'] = ConfiguracionService.obtener()
        return contexto


def _items_queryset():
    return ItemService.objects.select_related('seccion').prefetch_related('precios')


class ConfiguracionServiceView(_BaseService, AuditoriaMixin, generics.RetrieveUpdateAPIView):
    """Fila unica de parametros (dolar, descuento, redondeo)."""

    serializer_class = ConfiguracionServiceSerializer

    def get_object(self):
        return ConfiguracionService.obtener()


class SeccionListCreateView(_BaseService, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = SeccionService.objects.prefetch_related(
        'variantes',
        Prefetch('items', queryset=_items_queryset()),
    ).all()
    serializer_class = SeccionServiceSerializer


class SeccionDetailView(_BaseService, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    # El DELETE hace borrado logico (AuditoriaMixin.perform_destroy).
    queryset = SeccionService.objects.prefetch_related(
        'variantes',
        Prefetch('items', queryset=_items_queryset()),
    ).all()
    serializer_class = SeccionServiceSerializer


class ItemListCreateView(_BaseService, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = _items_queryset().all()
    serializer_class = ItemServiceSerializer


class ItemDetailView(_BaseService, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = _items_queryset().all()
    serializer_class = ItemServiceSerializer
