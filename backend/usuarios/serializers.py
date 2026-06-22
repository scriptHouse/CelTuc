from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from .models import Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    """Representacion del usuario que devuelve la API (sin la contrasena).

    El usuario puede editar sus datos personales (nombre, apellido, telefono);
    el email, el rol y los flags de permisos son de solo lectura y se gestionan
    desde el panel de administracion.
    """

    nombre_completo = serializers.CharField(read_only=True)

    class Meta:
        model = Usuario
        fields = (
            'id', 'email', 'nombre', 'apellido', 'nombre_completo',
            'documento', 'telefono', 'rol',
            'is_active', 'is_staff', 'is_superuser', 'date_joined',
        )
        read_only_fields = (
            'id', 'email', 'documento', 'rol',
            'is_active', 'is_staff', 'is_superuser', 'date_joined',
        )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        email = attrs['email'].lower()
        user = Usuario.objects.filter(email__iexact=email, is_active=True).first()
        if user is None or not user.check_password(attrs['password']):
            raise AuthenticationFailed('Email o contrasena incorrectos.')
        attrs['user'] = user
        return attrs


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()
