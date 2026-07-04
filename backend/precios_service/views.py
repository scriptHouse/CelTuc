import requests
from django.core.cache import cache
from django.db.models import Prefetch
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin

from .models import ConfiguracionService, Dispositivo, ItemService, SeccionService
from .serializers import (
    ConfiguracionServiceSerializer,
    DispositivoSerializer,
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
    return ItemService.objects.select_related('seccion').prefetch_related('precios', 'dispositivos')


class ConfiguracionServiceView(_BaseService, AuditoriaMixin, generics.RetrieveUpdateAPIView):
    """Fila unica de parametros (dolar, descuento, redondeo)."""

    serializer_class = ConfiguracionServiceSerializer
    # La lee tambien el gestor de dolar (pagina Dolar y bloque del Panel).
    permiso_requerido = ('ver_precios_service', 'ver_dolar')

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


class DolarBlueView(_BaseService, APIView):
    """Cotizacion del dolar blue, de DolarAPI (https://dolarapi.com).

    El backend hace de proxy (evita CORS y centraliza el manejo de errores) y
    cachea la respuesta 2 minutos para no golpear la API en cada apertura del
    gestor. Es SOLO una referencia: el dolar del negocio sigue siendo manual y
    se actualiza desde Configurar (con el boton "Usar venta" del gestor).
    """

    URL = 'https://dolarapi.com/v1/dolares/blue'
    CACHE_KEY = 'dolar_blue'
    CACHE_SEGUNDOS = 120

    # Lo consultan los gestores de dolar (pagina Dolar, Panel, Service y Productos).
    permiso_requerido = ('ver_precios_service', 'ver_productos', 'ver_equipos', 'ver_dolar')

    def get(self, request):
        datos = cache.get(self.CACHE_KEY)
        if datos is None:
            try:
                respuesta = requests.get(self.URL, timeout=6)
                respuesta.raise_for_status()
                cuerpo = respuesta.json()
                datos = {
                    'compra': cuerpo.get('compra'),
                    'venta': cuerpo.get('venta'),
                    'fecha': cuerpo.get('fechaActualizacion'),
                }
            except (requests.RequestException, ValueError):
                return Response(
                    {'detail': 'No se pudo consultar DolarAPI. Probá de nuevo en un rato.'},
                    status=503,
                )
            cache.set(self.CACHE_KEY, datos, self.CACHE_SEGUNDOS)
        return Response(datos)


class DispositivoListCreateView(_BaseService, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Dispositivo.objects.all()
    serializer_class = DispositivoSerializer
    # El catalogo de equipos tambien alimenta la Ficha de equipo.
    permiso_requerido = ('ver_precios_service', 'ver_equipos')


class DispositivoDetailView(_BaseService, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Dispositivo.objects.all()
    serializer_class = DispositivoSerializer
    permiso_requerido = ('ver_precios_service', 'ver_equipos')
