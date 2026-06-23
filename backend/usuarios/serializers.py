from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from .models import Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    """Datos del usuario que devuelve la API (nunca la contrasena)."""

    class Meta:
        model = Usuario
        fields = (
            'id', 'email', 'username',
            'is_active', 'is_staff', 'is_superuser', 'date_joined',
        )
        read_only_fields = fields


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
