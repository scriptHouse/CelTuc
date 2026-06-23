from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Empleado
from .serializers import AccesoSerializer, EmpleadoSerializer, EmpleadoWriteSerializer


class LecturaAutenticadaEscrituraStaff(permissions.BasePermission):
    """Leer: cualquier usuario autenticado. Crear/editar/borrar: solo staff.

    Así, gestionar empleados (y darles acceso) queda reservado al admin; un
    empleado con login común (no staff) no puede administrar al equipo.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_staff)


class EmpleadoListCreateView(generics.ListCreateAPIView):
    queryset = Empleado.objects.select_related('usuario').all()
    serializer_class = EmpleadoSerializer
    permission_classes = [LecturaAutenticadaEscrituraStaff]

    def create(self, request, *args, **kwargs):
        write = EmpleadoWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        empleado = write.save()
        return Response(EmpleadoSerializer(empleado).data, status=201)


class EmpleadoDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Empleado.objects.select_related('usuario').all()
    serializer_class = EmpleadoSerializer
    permission_classes = [LecturaAutenticadaEscrituraStaff]

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
        instance.delete()
        if usuario is not None:
            usuario.delete()


class EmpleadoAccesoView(APIView):
    """Gestiona la cuenta de login del empleado: PUT crea/actualiza, DELETE quita."""

    permission_classes = [permissions.IsAdminUser]

    def put(self, request, pk):
        empleado = get_object_or_404(Empleado, pk=pk)
        serializer = AccesoSerializer(data=request.data, context={'empleado': empleado})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        empleado.refresh_from_db()
        return Response(EmpleadoSerializer(empleado).data)

    def delete(self, request, pk):
        empleado = get_object_or_404(Empleado, pk=pk)
        usuario = empleado.usuario
        if usuario is not None:
            empleado.usuario = None
            empleado.save(update_fields=['usuario'])
            usuario.delete()
        empleado.refresh_from_db()
        return Response(EmpleadoSerializer(empleado).data)
