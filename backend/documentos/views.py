"""API del historial de documentos generados.

- Registrar una exportacion: cualquier cuenta autenticada (lo hace sola la
  pagina de Documentos al descargar el PDF / Excel / ticket).
- Ver el historial: cada uno ve LO SUYO; los administradores ven el de todo el
  equipo.
- Eliminar: solo administradores, y es borrado logico (sale del historial pero
  no se pierde, y queda en /auditoria quien lo saco).

Los archivos no tienen URL publica: se sirven por un endpoint autenticado con
el content-type que decide el servidor segun el formato guardado.
"""
from datetime import datetime, timedelta
from urllib.parse import quote

from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FORMATOS, DocumentoGenerado
from .serializers import DocumentoGeneradoSerializer, NuevoDocumentoSerializer

# nginx (deploy/nginx.conf) corta el request en 20 MB. Un PDF de estos pesa
# menos de 1 MB; el tope es un cinturon de seguridad, no un limite real.
MAX_TAMANIO_ARCHIVO = 15 * 1024 * 1024  # 15 MB

LIMITE_MAXIMO = 100
LIMITE_POR_DEFECTO = 30


class HistorialDocumentos(permissions.BasePermission):
    """Ver y registrar: cualquier autenticado. Eliminar: solo administradores."""

    message = 'Solo un administrador puede eliminar documentos del historial.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method == 'DELETE':
            return user.es_administrador
        return True


def _visibles_para(usuario):
    """Documentos que esta cuenta puede ver: los suyos, o todos si es admin."""
    qs = DocumentoGenerado.objects.select_related('creado_por', 'creado_por__empleado')
    if not usuario.es_administrador:
        qs = qs.filter(creado_por=usuario)
    return qs


def _fecha_local(texto):
    """'2026-08-05' -> datetime aware al inicio de ese dia local (o None)."""
    try:
        dia = datetime.strptime(texto, '%Y-%m-%d')
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(dia)


def _entero(params, clave, defecto, minimo, maximo):
    try:
        return min(max(int(params.get(clave, defecto)), minimo), maximo)
    except (TypeError, ValueError):
        return defecto


class DocumentoListCreateView(APIView):
    """GET: el historial con filtros y paginacion. POST: registrar una exportacion."""

    permission_classes = [HistorialDocumentos]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        params = request.query_params
        qs = _visibles_para(request.user)

        tipo = (params.get('tipo') or '').strip()
        if tipo:
            qs = qs.filter(tipo=tipo)
        formato = (params.get('formato') or '').strip()
        if formato in DocumentoGenerado.Formato.values:
            qs = qs.filter(formato=formato)
        sucursal = (params.get('sucursal') or '').strip()
        if sucursal:
            qs = qs.filter(sucursal=sucursal)
        # Filtrar por autor solo tiene sentido para el admin: el resto ya esta
        # acotado a sus propios documentos por `_visibles_para`.
        autor = (params.get('usuario') or '').strip()
        if autor and request.user.es_administrador:
            qs = qs.filter(creado_por__username__iexact=autor)
        q = (params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(cliente__icontains=q)
                | Q(cliente_documento__icontains=q)
                | Q(referencia__icontains=q)
                | Q(detalle__icontains=q)
                | Q(tipo_nombre__icontains=q)
                | Q(nombre_archivo__icontains=q)
            )
        desde = _fecha_local(params.get('desde'))
        if desde is not None:
            qs = qs.filter(creado__gte=desde)
        hasta = _fecha_local(params.get('hasta'))
        if hasta is not None:
            qs = qs.filter(creado__lt=hasta + timedelta(days=1))

        limite = _entero(params, 'limit', LIMITE_POR_DEFECTO, 1, LIMITE_MAXIMO)
        offset = _entero(params, 'offset', 0, 0, 1_000_000)

        total = qs.count()
        respuesta = {
            'total': total,
            'resultados': DocumentoGeneradoSerializer(qs[offset:offset + limite], many=True).data,
        }
        # El resumen y las opciones de los filtros solo hacen falta en la
        # primera pagina: el "cargar mas" no vuelve a pagar esos conteos.
        if offset == 0:
            respuesta['resumen'] = self._resumen(request.user)
            respuesta['puede_ver_todo'] = bool(request.user.es_administrador)
            base = _visibles_para(request.user)
            respuesta['sucursales'] = sorted(
                s for s in base.values_list('sucursal', flat=True).distinct() if s
            )
            if request.user.es_administrador:
                respuesta['usuarios'] = sorted(
                    u for u in base.exclude(creado_por=None)
                    .values_list('creado_por__username', flat=True).distinct() if u
                )
        return Response(respuesta)

    @staticmethod
    def _resumen(usuario):
        inicio_hoy = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        base = _visibles_para(usuario)
        return {
            'hoy': base.filter(creado__gte=inicio_hoy).count(),
            'semana': base.filter(creado__gte=inicio_hoy - timedelta(days=6)).count(),
            'total': base.count(),
        }

    def post(self, request):
        archivo = request.FILES.get('archivo')
        if archivo is None:
            return Response({'detail': 'Falta el archivo del documento.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if archivo.size > MAX_TAMANIO_ARCHIVO:
            return Response({'detail': 'El documento pesa mas de 15 MB.'},
                            status=status.HTTP_400_BAD_REQUEST)

        entrada = NuevoDocumentoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        formato = datos.get('formato') or DocumentoGenerado.Formato.PDF
        usuario = request.user
        documento = DocumentoGenerado.objects.create(
            **{**datos, 'formato': formato},
            archivo=archivo,
            # El content-type sale de nuestra tabla de formatos, NUNCA del que
            # declara el navegador: asi lo que se sirve de vuelta es siempre lo
            # que decimos que es.
            content_type=FORMATOS[formato][1],
            tamanio=archivo.size,
            creado_por=usuario,
            actualizado_por=usuario,
        )
        return Response(DocumentoGeneradoSerializer(documento).data,
                        status=status.HTTP_201_CREATED)


class DocumentoDetailView(APIView):
    """DELETE: saca el documento del historial (borrado logico). Solo admin."""

    permission_classes = [HistorialDocumentos]

    def delete(self, request, pk):
        documento = get_object_or_404(DocumentoGenerado, pk=pk)
        documento.delete(usuario=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentoArchivoView(APIView):
    """Sirve el archivo guardado, detras de la autenticacion.

    Por defecto va inline (el front lo abre en una pestaña para verlo); con
    ``?descargar=1`` fuerza la descarga con el nombre original.
    """

    permission_classes = [HistorialDocumentos]

    def get(self, request, pk):
        documento = get_object_or_404(_visibles_para(request.user), pk=pk)
        try:
            contenido = documento.archivo.open('rb')
        except (FileNotFoundError, ValueError):
            return Response({'detail': 'El archivo ya no esta disponible en el servidor.'},
                            status=status.HTTP_404_NOT_FOUND)
        respuesta = FileResponse(
            contenido,
            content_type=documento.content_type or FORMATOS.get(documento.formato, ('', ''))[1]
            or 'application/octet-stream',
        )
        nombre = documento.nombre_archivo or f'documento-{documento.pk}{documento.extension}'
        if not nombre.lower().endswith(documento.extension):
            nombre = f'{nombre}{documento.extension}'
        disposicion = 'attachment' if request.query_params.get('descargar') else 'inline'
        respuesta['Content-Disposition'] = f"{disposicion}; filename*=UTF-8''{quote(nombre)}"
        return respuesta
