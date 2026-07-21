"""API de la cartelera de comunicados.

- Leer y marcar como visto: cualquier usuario autenticado (la cartelera es
  para todo el equipo).
- Publicar / editar / eliminar: SOLO administradores.
- Los adjuntos NO tienen URL publica: se descargan por un endpoint autenticado
  que sirve el archivo con su content-type (el front arma blobs para mostrar
  imagenes y videos inline).
"""
from urllib.parse import quote

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin

from .models import ArchivoComunicado, Comunicado, LecturaComunicado
from .serializers import ActualizarComunicadoSerializer, ComunicadoSerializer

# Limites de subida. nginx (deploy/nginx.conf) corta el request en 20 MB, asi
# que el tope real por publicacion es ese; aca validamos por archivo para dar
# un mensaje claro antes de que el proxy devuelva un 413 opaco.
MAX_ARCHIVOS = 10
MAX_TAMANIO_ARCHIVO = 19 * 1024 * 1024  # 19 MB (margen bajo el tope de nginx)


class LecturaTodosEscrituraAdmin(permissions.BasePermission):
    """Leer: cualquier autenticado. Escribir: solo administradores."""

    message = 'Solo un administrador puede publicar en la cartelera.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.es_administrador


def _queryset_comunicados():
    return Comunicado.objects.select_related('creado_por').prefetch_related(
        'archivos', 'lecturas', 'lecturas__usuario',
    )


class ComunicadoListCreateView(APIView):
    """GET: la cartelera completa (historial). POST: publicar (multipart)."""

    permission_classes = [LecturaTodosEscrituraAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        datos = ComunicadoSerializer(
            _queryset_comunicados(), many=True, context={'usuario': request.user},
        ).data
        return Response(datos)

    def post(self, request):
        titulo = (request.data.get('titulo') or '').strip()
        cuerpo = (request.data.get('cuerpo') or '').strip()
        fijado = str(request.data.get('fijado', '')).lower() in ('1', 'true', 'on', 'yes')
        archivos = request.FILES.getlist('archivos')

        if not titulo:
            return Response({'detail': 'El titulo es obligatorio.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(archivos) > MAX_ARCHIVOS:
            return Response({'detail': f'Maximo {MAX_ARCHIVOS} archivos por comunicado.'},
                            status=status.HTTP_400_BAD_REQUEST)
        for f in archivos:
            if f.size > MAX_TAMANIO_ARCHIVO:
                return Response(
                    {'detail': f'"{f.name}" pesa mas de 19 MB. Subi archivos mas livianos.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        usuario = request.user
        comunicado = Comunicado.objects.create(
            titulo=titulo, cuerpo=cuerpo, fijado=fijado,
            creado_por=usuario, actualizado_por=usuario,
        )
        for f in archivos:
            content_type = (f.content_type or 'application/octet-stream')[:100]
            if content_type.startswith('image/'):
                tipo = ArchivoComunicado.Tipo.IMAGEN
            elif content_type.startswith('video/'):
                tipo = ArchivoComunicado.Tipo.VIDEO
            else:
                tipo = ArchivoComunicado.Tipo.ARCHIVO
            ArchivoComunicado.objects.create(
                comunicado=comunicado,
                archivo=f,
                nombre=f.name[:200],
                tipo=tipo,
                content_type=content_type,
                tamanio=f.size,
                creado_por=usuario,
                actualizado_por=usuario,
            )

        fresco = _queryset_comunicados().get(pk=comunicado.pk)
        datos = ComunicadoSerializer(fresco, context={'usuario': usuario}).data
        return Response(datos, status=status.HTTP_201_CREATED)


class ComunicadoDetailView(AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    """Editar titulo/cuerpo/fijado o eliminar (borrado logico). Solo admin."""

    permission_classes = [LecturaTodosEscrituraAdmin]

    def get_queryset(self):
        return _queryset_comunicados()

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return ActualizarComunicadoSerializer
        return ComunicadoSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['usuario'] = self.request.user
        return ctx

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        entrada = ActualizarComunicadoSerializer(instance, data=request.data, partial=partial)
        entrada.is_valid(raise_exception=True)
        self.perform_update(entrada)
        fresco = _queryset_comunicados().get(pk=instance.pk)
        return Response(ComunicadoSerializer(fresco, context={'usuario': request.user}).data)


class MarcarVistoView(APIView):
    """El usuario deja constancia de que vio el comunicado (idempotente)."""

    def post(self, request, pk):
        comunicado = get_object_or_404(Comunicado, pk=pk)
        lectura, _ = LecturaComunicado.objects.get_or_create(
            comunicado=comunicado,
            usuario=request.user,
            defaults={'creado_por': request.user, 'actualizado_por': request.user},
        )
        return Response({
            'leido': True,
            'fecha': lectura.creado.isoformat(),
            'total_lecturas': comunicado.lecturas.count(),
        })


class ArchivoDescargaView(APIView):
    """Sirve un adjunto con su content-type, detras de la autenticacion.

    Por defecto va inline (el front lo pide como blob para mostrar imagenes y
    videos); con ``?descargar=1`` se fuerza la descarga con el nombre original.
    """

    def get(self, request, pk):
        adjunto = get_object_or_404(
            ArchivoComunicado.objects.select_related('comunicado'),
            pk=pk, comunicado__borrado=False,
        )
        try:
            contenido = adjunto.archivo.open('rb')
        except (FileNotFoundError, ValueError):
            return Response(
                {'detail': 'El archivo ya no esta disponible en el servidor.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        respuesta = FileResponse(
            contenido, content_type=adjunto.content_type or 'application/octet-stream',
        )
        disposicion = 'attachment' if request.query_params.get('descargar') else 'inline'
        respuesta['Content-Disposition'] = f"{disposicion}; filename*=UTF-8''{quote(adjunto.nombre)}"
        return respuesta
