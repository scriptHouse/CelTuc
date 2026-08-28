"""Gestión de cuentas de usuario (solo administradores).

Endpoints para crear/listar/editar/eliminar usuarios desde la app, con la opción
de crear su Empleado en el mismo paso. Separado de la autenticación (login/me)
para mantener esos archivos enfocados.
"""
from django.core.exceptions import ObjectDoesNotExist
from django.core.validators import MinLengthValidator
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Rol, Usuario, username_validator
from .permissions import EsAdministrador


# --- Serializers -------------------------------------------------------------

class UsuarioAdminSerializer(serializers.ModelSerializer):
    """Vista de una cuenta para el panel de administración del front."""

    empleado = serializers.SerializerMethodField()
    rol = serializers.SerializerMethodField()
    en_linea = serializers.BooleanField(read_only=True)
    es_administrador = serializers.BooleanField(read_only=True)
    es_superadministrador = serializers.BooleanField(read_only=True)

    class Meta:
        model = Usuario
        fields = (
            'id', 'username', 'email',
            'is_active', 'is_staff', 'is_superuser', 'date_joined', 'empleado',
            'rol', 'last_login', 'ultima_actividad', 'en_linea',
            'es_administrador', 'es_superadministrador',
        )

    def get_rol(self, obj):
        # Mismo formato breve que usa el modulo de empleados (UsuarioBreveSerializer).
        if not obj.rol_id:
            return None
        return {'id': obj.rol_id, 'nombre': obj.rol.nombre, 'es_admin': obj.rol.es_admin}

    def get_empleado(self, obj):
        # Relación inversa OneToOne: puede no existir (cuenta sin empleado).
        try:
            emp = obj.empleado
        except ObjectDoesNotExist:
            return None
        return {
            'id': emp.id,
            'nombre': emp.nombre,
            'apellido': emp.apellido,
            'nombre_completo': emp.nombre_completo,
        }


class _EmpleadoMiniSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=120)
    apellido = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')


class UsuarioCreateSerializer(serializers.Serializer):
    """Crea una cuenta y, opcionalmente, su Empleado en el mismo request.

    Nunca crea superusuarios: como mucho, una cuenta `is_staff` (administradora).
    El único superusuario es el admin original.
    """

    username = serializers.CharField(max_length=30, validators=[MinLengthValidator(3), username_validator])
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    is_staff = serializers.BooleanField(default=False)
    # Rol que define a que modulos entra la cuenta (opcional: sin rol = sin acceso).
    rol = serializers.PrimaryKeyRelatedField(
        queryset=Rol.objects.all(), required=False, allow_null=True,
    )
    empleado = _EmpleadoMiniSerializer(required=False, allow_null=True)

    def validate_username(self, value):
        value = value.strip().lower()
        if Usuario.todos.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya está en uso.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if Usuario.todos.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Ese email ya está en uso.')
        return value

    def validate_password(self, value):
        if not value:
            raise serializers.ValidationError('La contraseña es obligatoria.')
        return value

    def create(self, validated_data):
        empleado_data = validated_data.pop('empleado', None)
        user = Usuario(
            username=validated_data['username'],
            email=validated_data['email'],
            is_staff=validated_data.get('is_staff', False),
            is_superuser=False,
            rol=validated_data.get('rol'),
        )
        user.set_password(validated_data['password'])
        user.save()
        if empleado_data:
            # Import perezoso: evita el ciclo usuarios <-> empleados al cargar.
            from empleados.models import Empleado
            Empleado.objects.create(
                usuario=user,
                nombre=empleado_data['nombre'],
                apellido=empleado_data.get('apellido', ''),
            )
        return user


class UsuarioUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=30, validators=[MinLengthValidator(3), username_validator], required=False,
    )
    email = serializers.EmailField(required=False)
    is_active = serializers.BooleanField(required=False)
    is_staff = serializers.BooleanField(required=False)
    rol = serializers.PrimaryKeyRelatedField(
        queryset=Rol.objects.all(), required=False, allow_null=True,
    )
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate_username(self, value):
        value = value.strip().lower()
        if Usuario.todos.filter(username__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya está en uso.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if Usuario.todos.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Ese email ya está en uso.')
        return value

    def update(self, instance, validated_data):
        for field in ('username', 'email', 'is_active', 'is_staff'):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        if 'rol' in validated_data:
            instance.rol = validated_data['rol']
        if validated_data.get('password'):
            instance.set_password(validated_data['password'])
        instance.save()
        return instance


# --- Vistas ------------------------------------------------------------------

class UsuarioListCreateView(APIView):
    permission_classes = [EsAdministrador]

    def get(self, request):
        # `objects` ya excluye las cuentas borradas logicamente (ver UsuarioManager).
        usuarios = Usuario.objects.select_related('empleado', 'rol').order_by('username')
        return Response(UsuarioAdminSerializer(usuarios, many=True).data)

    def post(self, request):
        serializer = UsuarioCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Cualquier administrador puede crear cuentas, incluso administradoras
        # (nunca superusuarios: eso lo garantiza el serializer).
        user = serializer.save()
        return Response(UsuarioAdminSerializer(user).data, status=status.HTTP_201_CREATED)


class UsuarioDetailView(APIView):
    permission_classes = [EsAdministrador]

    def patch(self, request, pk):
        user = get_object_or_404(Usuario, pk=pk)
        actor = request.user
        # Jerarquia: solo un superadministrador edita cuentas de nivel administrador
        # (a sí mismo sí puede, para cambiar sus propios datos).
        if user.es_administrador and user.pk != actor.pk and not actor.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede editar a un administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Evitar que el admin se deje afuera a sí mismo.
        if user.pk == request.user.pk:
            if request.data.get('is_active') is False:
                return Response(
                    {'detail': 'No podés desactivar tu propia cuenta.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if request.data.get('is_staff') is False:
                return Response(
                    {'detail': 'No podés quitarte tu propio acceso de administrador.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Mismo espíritu que lo anterior: cambiarse el propio rol puede dejarlo
            # sin administración (si le viene del rol) o sin módulos, por accidente.
            if 'rol' in request.data:
                return Response(
                    {'detail': 'No podés cambiar tu propio rol.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        serializer = UsuarioUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UsuarioAdminSerializer(user).data)

    def delete(self, request, pk):
        user = get_object_or_404(Usuario, pk=pk)
        if user.pk == request.user.pk:
            return Response(
                {'detail': 'No podés eliminar tu propia cuenta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_superuser:
            return Response(
                {'detail': 'No se puede eliminar a un superusuario.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Jerarquia: solo un superadministrador puede eliminar a un administrador.
        if user.es_administrador and not request.user.is_superuser:
            return Response(
                {'detail': 'Solo un superadministrador puede eliminar a un administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # El Empleado vinculado (si hay) sobrevive sin login (Empleado.usuario = SET_NULL).
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
