from django.core.validators import MinLengthValidator
from rest_framework import serializers

from usuarios.models import Usuario, username_validator

from .models import Empleado


class UsuarioBreveSerializer(serializers.ModelSerializer):
    """Vista mínima de la cuenta de login vinculada a un empleado."""

    class Meta:
        model = Usuario
        fields = ('id', 'username', 'email', 'is_active')


class EmpleadoSerializer(serializers.ModelSerializer):
    """Representación de lectura del empleado, con su cuenta (o null)."""

    usuario = UsuarioBreveSerializer(read_only=True)
    nombre_completo = serializers.CharField(read_only=True)
    puede_loguear = serializers.BooleanField(read_only=True)

    class Meta:
        model = Empleado
        fields = (
            'id', 'nombre', 'apellido', 'nombre_completo',
            'usuario', 'puede_loguear', 'creado',
        )


class EmpleadoWriteSerializer(serializers.ModelSerializer):
    """Alta/edición de los datos del empleado (sin tocar la cuenta de login)."""

    class Meta:
        model = Empleado
        fields = ('nombre', 'apellido')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value


class AccesoSerializer(serializers.Serializer):
    """Crea o actualiza la cuenta de login de un empleado.

    Siempre genera usuarios REGULARES (is_staff=False, is_superuser=False): así
    quedan diferenciados del admin del sistema, que es el único superusuario.
    """

    username = serializers.CharField(
        max_length=30, validators=[MinLengthValidator(3), username_validator],
    )
    email = serializers.EmailField()
    # Obligatoria al crear el acceso; opcional al editar (solo cambia si se manda).
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        style={'input_type': 'password'},
    )

    @property
    def empleado(self):
        return self.context['empleado']

    def _otras_cuentas(self):
        """Usuarios distintos del ya vinculado a este empleado (para unicidad)."""
        qs = Usuario.objects.all()
        actual = self.empleado.usuario
        return qs.exclude(pk=actual.pk) if actual else qs

    def validate_username(self, value):
        value = value.strip().lower()
        if self._otras_cuentas().filter(username__iexact=value).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya está en uso.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if self._otras_cuentas().filter(email__iexact=value).exists():
            raise serializers.ValidationError('Ese email ya está en uso.')
        return value

    def validate(self, attrs):
        # Si el empleado todavía no tiene cuenta, la contraseña es obligatoria.
        if self.empleado.usuario is None and not attrs.get('password'):
            raise serializers.ValidationError(
                {'password': 'La contraseña es obligatoria para crear el acceso.'}
            )
        return attrs

    def save(self):
        empleado = self.empleado
        data = self.validated_data
        user = empleado.usuario or Usuario(is_staff=False, is_superuser=False)
        user.username = data['username']
        user.email = data['email']
        user.is_active = True
        if data.get('password'):
            user.set_password(data['password'])
        user.save()
        if empleado.usuario_id != user.id:
            empleado.usuario = user
            empleado.save(update_fields=['usuario'])
        return user
