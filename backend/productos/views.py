from rest_framework import generics

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraAdmin

from .models import CategoriaProducto, ConfiguracionProductos, Producto
from .serializers import (
    CategoriaProductoSerializer,
    ConfiguracionProductosSerializer,
    ProductoSerializer,
)


class _BaseProductos:
    """Permisos comunes: leer con el permiso del modulo, escribir solo admin.

    `ver_equipos` tambien habilita la lectura: la Ficha de equipo necesita los
    productos vinculados aunque la cuenta no tenga acceso a la pagina Productos.
    """

    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = ('ver_productos', 'ver_equipos')

    def get_serializer_context(self):
        contexto = super().get_serializer_context()
        contexto['config'] = ConfiguracionProductos.obtener()
        return contexto


def _productos_queryset():
    return Producto.objects.select_related('categoria').prefetch_related('dispositivos')


class ConfiguracionProductosView(_BaseProductos, AuditoriaMixin, generics.RetrieveUpdateAPIView):
    serializer_class = ConfiguracionProductosSerializer

    def get_object(self):
        return ConfiguracionProductos.obtener()


class CategoriaListCreateView(_BaseProductos, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = CategoriaProducto.objects.select_related('padre').all()
    serializer_class = CategoriaProductoSerializer


class CategoriaDetailView(_BaseProductos, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    # El DELETE hace borrado logico (AuditoriaMixin.perform_destroy).
    queryset = CategoriaProducto.objects.select_related('padre').all()
    serializer_class = CategoriaProductoSerializer


class ProductoListCreateView(_BaseProductos, AuditoriaMixin, generics.ListCreateAPIView):
    queryset = _productos_queryset().all()
    serializer_class = ProductoSerializer


class ProductoDetailView(_BaseProductos, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = _productos_queryset().all()
    serializer_class = ProductoSerializer
