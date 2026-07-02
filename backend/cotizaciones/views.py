from django.db.models import Prefetch
from rest_framework import generics

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin

from .models import ModeloEquipo, PrecioServicio, TipoServicio
from .serializers import ModeloEquipoSerializer, TipoServicioSerializer


def _modelos_queryset():
    """Modelos con sus precios anidados en una sola consulta.

    El prefetch de `servicios` excluye los precios cuyo tipo fue borrado
    logicamente: al esconder un TipoServicio, sus precios dejan de mostrarse
    sin tocar cada modelo (y se limpian fisicamente al proximo guardado).
    """
    return ModeloEquipo.objects.prefetch_related(
        'cotizaciones',
        Prefetch(
            'servicios',
            queryset=PrecioServicio.objects.filter(tipo__borrado=False).select_related('tipo'),
        ),
    ).all()


class ModeloEquipoListCreateView(AuditoriaMixin, generics.ListCreateAPIView):
    # Leer (consultar cotizaciones): quien tenga el permiso del modulo.
    # Escribir (editar precios/modelos): solo administradores.
    # `objects` ya oculta los modelos borrados logicamente (ver ModeloBase).
    queryset = _modelos_queryset()
    serializer_class = ModeloEquipoSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_cotizaciones'


class ModeloEquipoDetailView(AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    # El DELETE hace borrado logico (AuditoriaMixin.perform_destroy).
    queryset = _modelos_queryset()
    serializer_class = ModeloEquipoSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_cotizaciones'


class TipoServicioListCreateView(AuditoriaMixin, generics.ListCreateAPIView):
    queryset = TipoServicio.objects.all()
    serializer_class = TipoServicioSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_cotizaciones'


class TipoServicioDetailView(AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = TipoServicio.objects.all()
    serializer_class = TipoServicioSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_cotizaciones'
