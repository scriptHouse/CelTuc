from rest_framework import generics

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin

from .models import Tarjeta
from .serializers import TarjetaSerializer


class TarjetaListCreateView(AuditoriaMixin, generics.ListCreateAPIView):
    # Leer (usar el simulador): quien tenga el permiso del modulo.
    # Escribir (editar los porcentajes): solo administradores.
    # `objects` ya oculta las tarjetas borradas logicamente (ver ModeloBase).
    queryset = Tarjeta.objects.prefetch_related('planes').all()
    serializer_class = TarjetaSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_simulador'


class TarjetaDetailView(AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    # El DELETE hace borrado logico (AuditoriaMixin.perform_destroy).
    queryset = Tarjeta.objects.prefetch_related('planes').all()
    serializer_class = TarjetaSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_simulador'
