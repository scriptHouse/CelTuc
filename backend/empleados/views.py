from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from inventario.models import Sucursal
from usuarios.permissions import EsAdministrador, LecturaConPermisoEscrituraAdmin

from .models import Empleado
from .serializers import (
    AccesoSerializer,
    EmpleadoSerializer,
    EmpleadoWriteSerializer,
    SucursalSerializer,
)


class SucursalListCreateView(generics.ListCreateAPIView):
    # Leer: quien tenga el permiso del módulo Empleados. Escribir: solo admin.
    queryset = Sucursal.objects.all()
    serializer_class = SucursalSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'


class SucursalDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Sucursal.objects.all()
    serializer_class = SucursalSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'

    def perform_destroy(self, instance):
        # El borrado es lógico (no dispara el SET_NULL de la FK), así que
        # desvinculamos a mano a los empleados que tenían esta sucursal.
        Empleado.todos.filter(sucursal=instance).update(sucursal=None)
        instance.delete()


class EmpleadoListCreateView(generics.ListCreateAPIView):
    # Leer: quien tenga el permiso del modulo Empleados. Escribir: solo admin.
    queryset = Empleado.objects.select_related('usuario', 'usuario__rol', 'sucursal').all()
    serializer_class = EmpleadoSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'

    def create(self, request, *args, **kwargs):
        write = EmpleadoWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        empleado = write.save()
        return Response(EmpleadoSerializer(empleado).data, status=201)


class EmpleadoDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Empleado.objects.select_related('usuario', 'usuario__rol', 'sucursal').all()
    serializer_class = EmpleadoSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'

    def update(self, request, *args, **kwargs):
        empleado = self.get_object()
        write = EmpleadoWriteSerializer(
            empleado, data=request.data, partial=kwargs.get('partial', False),
        )
        write.is_valid(raise_exception=True)
        empleado = write.save()
        return Response(EmpleadoSerializer(empleado).data)

    def perform_destroy(self, instance):
        # Borrar el empleado también elimina su cuenta de login (si la tenía).
        usuario = instance.usuario
        # Jerarquia: un admin comun no puede eliminar a un empleado con cuenta admin.
        if usuario is not None and usuario.es_administrador and not self.request.user.is_superuser:
            raise PermissionDenied('Solo un superadministrador puede eliminar a un administrador.')
        instance.delete()
        if usuario is not None:
            usuario.delete()


class EmpleadoAccesoView(APIView):
    """Gestiona la cuenta de login del empleado: PUT crea/actualiza, DELETE quita."""

    permission_classes = [EsAdministrador]

    def put(self, request, pk):
        empleado = get_object_or_404(Empleado, pk=pk)
        # No gestionar el acceso de una cuenta administradora si no sos superadmin.
        if empleado.usuario is not None and empleado.usuario.es_administrador and not request.user.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede gestionar el acceso de un administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AccesoSerializer(data=request.data, context={'empleado': empleado})
        serializer.is_valid(raise_exception=True)
        # Tampoco puede asignar un rol de administrador si no es superadmin.
        rol = serializer.validated_data.get('rol_id')
        if rol is not None and rol.es_admin and not request.user.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede asignar un rol de administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer.save()
        empleado.refresh_from_db()
        return Response(EmpleadoSerializer(empleado).data)

    def delete(self, request, pk):
        empleado = get_object_or_404(Empleado, pk=pk)
        usuario = empleado.usuario
        # Quitarle el acceso a una cuenta administradora es solo del superadmin.
        if usuario is not None and usuario.es_administrador and not request.user.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede quitar el acceso de un administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if usuario is not None:
            empleado.usuario = None
            empleado.save(update_fields=['usuario'])
            usuario.delete()
        empleado.refresh_from_db()
        return Response(EmpleadoSerializer(empleado).data)
