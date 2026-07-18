from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from .models import Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    """Datos del usuario que devuelve la API (nunca la contrasena).

    Incluye lo que el frontend necesita para decidir que modulos mostrar:
    `es_administrador`, los `permisos` efectivos (codigos) y el `rol`.
    """

    es_administrador = serializers.BooleanField(read_only=True)
    permisos = serializers.SerializerMethodField()
    rol = serializers.SerializerMethodField()
    sucursal = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = (
            'id', 'email', 'username',
            'is_active', 'is_staff', 'is_superuser', 'date_joined',
            'es_administrador', 'permisos', 'rol', 'sucursal',
        )
        read_only_fields = fields

    def get_permisos(self, obj):
        return obj.codigos_permisos()

    def get_rol(self, obj):
        if not obj.rol_id:
            return None
        return {'id': obj.rol_id, 'nombre': obj.rol.nombre, 'es_admin': obj.rol.es_admin}

    def get_sucursal(self, obj):
        """Sucursal del empleado vinculado (para preseleccionarla en documentos)."""
        from django.core.exceptions import ObjectDoesNotExist
        try:
            empleado = obj.empleado
        except ObjectDoesNotExist:
            return None
        if empleado is None or empleado.sucursal_id is None:
            return None
        suc = empleado.sucursal
        return {'id': suc.id, 'nombre': suc.nombre, 'codigo_postal': suc.codigo_postal}


class LoginSerializer(serializers.Serializer):
    """Login con email O nombre de usuario, mas la contrasena.

    Buenas practicas aplicadas:
    - Un unico campo `identifier` que acepta cualquiera de los dos.
    - Mensaje de error generico: no revela si el usuario existe (anti-enumeracion).
    - Mitigacion de timing: si no hay usuario, igual se computa un hash, para que
      el tiempo de respuesta no delate la existencia de la cuenta.
    """

    identifier = serializers.CharField(trim_whitespace=True)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        identifier = attrs['identifier'].strip().lower()
        password = attrs['password']

        user = Usuario.objects.filter(
            Q(email__iexact=identifier) | Q(username__iexact=identifier)
        ).first()

        # Si no hay usuario, gastamos el mismo tiempo que un check_password real
        # (hashea la contrasena en una instancia descartable) y fallamos igual.
        if user is None:
            Usuario().set_password(password)
            raise AuthenticationFailed('Credenciales invalidas.')

        if not user.is_active or not user.check_password(password):
            raise AuthenticationFailed('Credenciales invalidas.')

        attrs['user'] = user
        return attrs


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()
