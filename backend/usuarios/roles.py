"""Gestion de roles y permisos (solo administradores).

Endpoints para listar el catalogo de permisos y para crear/editar/eliminar roles
con su conjunto de permisos. La asignacion de un rol a una cuenta se hace al dar
acceso a un empleado (ver empleados/serializers.py).
"""
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Permiso, Rol
from .permissions import EsAdministrador


# --- Serializers -------------------------------------------------------------

class PermisoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permiso
        fields = ('codigo', 'nombre', 'descripcion', 'orden')


class RolSerializer(serializers.ModelSerializer):
    """Rol con sus permisos como lista de codigos (`['ver_panel', ...]`)."""

    permisos = serializers.SlugRelatedField(
        slug_field='codigo', queryset=Permiso.objects.all(), many=True, required=False,
    )
    cantidad_usuarios = serializers.SerializerMethodField()

    class Meta:
        model = Rol
        fields = (
            'id', 'nombre', 'descripcion', 'es_admin', 'es_sistema',
            'permisos', 'cantidad_usuarios', 'creado',
        )
        read_only_fields = ('id', 'es_sistema', 'cantidad_usuarios', 'creado')

    def get_cantidad_usuarios(self, obj):
        return obj.usuarios.count()

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        # `todos` incluye los borrados logicamente: el nombre sigue "ocupado"
        # mientras exista la fila, asi evitamos chocar con la constraint unica.
        qs = Rol.todos.filter(nombre__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Ya existe un rol con ese nombre.')
        return value

    def validate(self, attrs):
        # Un rol del sistema no cambia su naturaleza de admin (evita dejar al
        # equipo sin quien administre por error).
        if self.instance and self.instance.es_sistema and 'es_admin' in attrs:
            attrs.pop('es_admin')
        return attrs


# --- Vistas ------------------------------------------------------------------

class RolListCreateView(APIView):
    permission_classes = [EsAdministrador]

    def get(self, request):
        roles = Rol.objects.prefetch_related('permisos').all()
        return Response(RolSerializer(roles, many=True).data)

    def post(self, request):
        serializer = RolSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Crear un rol de administrador es solo del superadministrador (evita que un
        # admin se fabrique un rol admin y escale permisos).
        if serializer.validated_data.get('es_admin') and not request.user.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede crear roles de administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RolDetailView(APIView):
    permission_classes = [EsAdministrador]

    def patch(self, request, pk):
        rol = get_object_or_404(Rol, pk=pk)
        # Tocar un rol de administrador (o convertir uno en admin) es solo del superadmin.
        if (rol.es_admin or request.data.get('es_admin')) and not request.user.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede modificar roles de administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RolSerializer(rol, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        rol = get_object_or_404(Rol, pk=pk)
        if rol.es_sistema:
            return Response(
                {'detail': 'No se puede eliminar un rol del sistema.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if rol.es_admin and not request.user.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede eliminar roles de administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Las cuentas con este rol quedan sin rol (Usuario.rol = SET_NULL).
        rol.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermisoListView(APIView):
    """Catalogo de permisos disponibles (para armar el editor de roles)."""

    permission_classes = [EsAdministrador]

    def get(self, request):
        return Response(PermisoSerializer(Permiso.objects.all(), many=True).data)
