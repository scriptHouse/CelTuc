import datetime
import logging

from django.core.exceptions import ValidationError
from django.db.models import Prefetch, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import generics
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin

from . import dolar as modulo_dolar
from .importacion import analizar as analizar_lista
from .importacion import aplicar as aplicar_lista
from .models import (
    ConfiguracionService,
    Dispositivo,
    HistorialDolar,
    ItemService,
    SeccionService,
)
from .serializers import (
    AnalizarListaServiceSerializer,
    AplicarListaServiceSerializer,
    ConfiguracionServiceSerializer,
    DispositivoSerializer,
    HistorialDolarSerializer,
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


class _DolarAlDiaMixin:
    """Antes de listar precios, revisa el dolar automatico (si esta activo).

    Es lo que mantiene el dolar al dia «al usar el sistema»: en modo manual
    no cuesta nada; en automatico, como mucho una consulta al blue por minuto.
    """

    def get(self, request, *args, **kwargs):
        modulo_dolar.asegurar_dolar_al_dia()
        return super().get(request, *args, **kwargs)


class ConfiguracionServiceView(
    _DolarAlDiaMixin, _BaseService, AuditoriaMixin, generics.RetrieveUpdateAPIView,
):
    """Fila unica de parametros (dolar, descuento, redondeo).

    El PATCH del dolar pasa por el historial (ver el serializer): con `dolar`
    en manual lo fija una persona; con `dolar_modo=automatico` y la regla, el
    valor se calcula al instante y la respuesta ya lo trae.
    """

    serializer_class = ConfiguracionServiceSerializer
    # La lee tambien el gestor de dolar (pagina Dolar y bloque del Panel).
    permiso_requerido = ('ver_precios_service', 'ver_dolar')

    def get_object(self):
        return ConfiguracionService.obtener()


class SeccionListCreateView(
    _DolarAlDiaMixin, _BaseService, AuditoriaMixin, generics.ListCreateAPIView,
):
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


class ItemListCreateView(
    _DolarAlDiaMixin, _BaseService, AuditoriaMixin, generics.ListCreateAPIView,
):
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
    caso de que nunca se haya podido obtener ninguna. (La mecanica vive en
    `precios_service.dolar`.)

    Con el dolar del negocio en modo automatico, cada cotizacion que pasa por
    aca tambien lo recalcula: es la via por la que el gestor abierto mantiene
    los precios al dia.
    """

    URL = modulo_dolar.URL
    CACHE_KEY = modulo_dolar.CACHE_KEY
    CACHE_SEGUNDOS = modulo_dolar.CACHE_SEGUNDOS

    # Lo consultan los gestores de dolar (pagina Dolar, Panel, Service y Productos).
    permiso_requerido = ('ver_precios_service', 'ver_productos', 'ver_equipos', 'ver_dolar')

    def get(self, request):
        datos = modulo_dolar.obtener_blue()
        if datos is None:
            return Response(
                {'detail': 'No se pudo consultar DolarAPI y todavía no hay ninguna '
                           'cotización guardada. Probá de nuevo en un rato.'},
                status=503,
            )
        modulo_dolar.aplicar_si_corresponde(datos)
        return Response(datos)


# Cuantas filas del historial del dolar devuelve una consulta, como mucho.
MAX_HISTORIAL_DOLAR = 500


class HistorialDolarView(_BaseService, APIView):
    """GET /dolar/historial/: cada valor que tuvo el dolar, con su vigencia.

    Filtros opcionales `desde` y `hasta` (fechas yyyy-mm-dd, inclusive): trae
    las filas que estuvieron vigentes en algun momento de ese rango. `limite`
    acota cuantas (las mas recientes primero). Lo lee quien puede ver el
    gestor de dolar.
    """

    permiso_requerido = ('ver_precios_service', 'ver_dolar')

    def get(self, request):
        qs = HistorialDolar.objects.select_related('usuario')
        desde = parse_date(request.query_params.get('desde') or '')
        hasta = parse_date(request.query_params.get('hasta') or '')
        zona = timezone.get_current_timezone()
        if desde:
            inicio = timezone.make_aware(datetime.datetime.combine(desde, datetime.time.min), zona)
            qs = qs.filter(Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=inicio))
        if hasta:
            fin = timezone.make_aware(datetime.datetime.combine(hasta, datetime.time.max), zona)
            qs = qs.filter(vigente_desde__lte=fin)
        try:
            limite = min(int(request.query_params.get('limite', 100)), MAX_HISTORIAL_DOLAR)
        except ValueError:
            limite = 100
        total = qs.count()
        return Response({
            'items': HistorialDolarSerializer(qs[:max(limite, 1)], many=True).data,
            'total': total,
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
