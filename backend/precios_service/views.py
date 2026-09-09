import logging

import requests
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db.models import Prefetch
from rest_framework import generics
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin

from .importacion import analizar as analizar_lista
from .importacion import aplicar as aplicar_lista
from .models import (
    ConfiguracionService,
    CotizacionDolarBlue,
    Dispositivo,
    ItemService,
    SeccionService,
)
from .serializers import (
    AnalizarListaServiceSerializer,
    AplicarListaServiceSerializer,
    ConfiguracionServiceSerializer,
    DispositivoSerializer,
    ItemServiceSerializer,
    SeccionServiceSerializer,
)


logger = logging.getLogger(__name__)


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
    gestor. Cada cotizacion exitosa se GUARDA en `CotizacionDolarBlue`: si
    DolarAPI no responde se devuelve esa ultima guardada (con
    `desactualizado=True` para que la UI lo avise); el 503 queda solo para el
    caso de que nunca se haya podido obtener ninguna. Es SOLO una referencia:
    el dolar del negocio sigue siendo manual y se edita en el gestor.
    """

    URL = 'https://dolarapi.com/v1/dolares/blue'
    CACHE_KEY = 'dolar_blue'
    CACHE_SEGUNDOS = 120

    # Lo consultan los gestores de dolar (pagina Dolar, Panel, Service y Productos).
    permiso_requerido = ('ver_precios_service', 'ver_productos', 'ver_equipos', 'ver_dolar')

    def get(self, request):
        datos = cache.get(self.CACHE_KEY)
        if datos is not None:
            return Response(datos)
        try:
            respuesta = requests.get(self.URL, timeout=6)
            respuesta.raise_for_status()
            cuerpo = respuesta.json()
            datos = {
                'compra': cuerpo.get('compra'),
                'venta': cuerpo.get('venta'),
                'fecha': cuerpo.get('fechaActualizacion'),
                'desactualizado': False,
                'guardado': None,
            }
        except (requests.RequestException, ValueError):
            return self._ultima_guardada()
        CotizacionDolarBlue.guardar(datos['compra'], datos['venta'], datos['fecha'])
        cache.set(self.CACHE_KEY, datos, self.CACHE_SEGUNDOS)
        return Response(datos)

    def _ultima_guardada(self):
        """Respaldo cuando DolarAPI no responde: la ultima cotizacion guardada.

        No se cachea, asi la proxima consulta vuelve a intentar contra la API.
        """
        fila = CotizacionDolarBlue.ultima()
        if fila is None:
            return Response(
                {'detail': 'No se pudo consultar DolarAPI y todavía no hay ninguna '
                           'cotización guardada. Probá de nuevo en un rato.'},
                status=503,
            )
        return Response({
            'compra': fila.compra,
            'venta': fila.venta,
            'fecha': fila.fecha.isoformat() if fila.fecha else None,
            'desactualizado': True,
            'guardado': fila.actualizado.isoformat() if fila.actualizado else None,
        })


class DispositivoListCreateView(_BaseService, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = Dispositivo.objects.all()
    serializer_class = DispositivoSerializer
    # El catalogo de equipos tambien alimenta la Ficha de equipo.
    permiso_requerido = ('ver_precios_service', 'ver_equipos')


class DispositivoDetailView(_BaseService, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Dispositivo.objects.all()
    serializer_class = DispositivoSerializer
    permiso_requerido = ('ver_precios_service', 'ver_equipos')


class ImportarListaAnalizarView(_BaseService, APIView):
    """Lee una lista de precios (.xlsx) y devuelve el diff, SIN escribir nada.

    Entra el archivo que baja «Exportar» —o cualquier planilla parecida: las
    columnas se reconocen por su rotulo y se puede corregir cual es cual. Como
    tocar la lista de precios es tarea de administrador, el paso de revision
    tambien lo es.
    """

    permiso_requerido = 'ver_precios_service'
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        entrada = AnalizarListaServiceSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        try:
            resultado = analizar_lista(
                datos['archivo'],
                columnas=datos.get('columnas'),
                con_pesos=datos['con_pesos'],
            )
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        except Exception:
            logger.exception('No se pudo analizar la lista de precios de service')
            return Response(
                {'detail': 'No se pudo leer el archivo. Revisá que sea el .xlsx que '
                           'baja «Exportar» y volvé a intentar.'},
                status=400,
            )
        resultado['archivo'] = datos['archivo'].name
        return Response(resultado)


class ImportarListaAplicarView(_BaseService, APIView):
    """Aplica las filas confirmadas de la lista (todo o nada)."""

    permiso_requerido = 'ver_precios_service'

    def post(self, request):
        entrada = AplicarListaServiceSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            resultado = aplicar_lista(entrada.validated_data['items'], usuario=request.user)
        except ValidationError as e:
            return Response({'detail': ' '.join(e.messages)}, status=400)
        return Response(resultado)
