from django.core.validators import MinLengthValidator
from rest_framework import serializers

from usuarios.models import Rol, Usuario, username_validator

from .models import Empleado, Sucursal


class SucursalSerializer(serializers.ModelSerializer):
    """Alta/edición y listado de sucursales (nombre, código postal y estado)."""

    class Meta:
        model = Sucursal
        fields = ('id', 'nombre', 'codigo_postal', 'activa', 'creado', 'actualizado')
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        # `todos` incluye los borrados lógicos: el nombre sigue "ocupado" mientras
        # exista la fila, así no chocamos con la constraint única al validar.
        qs = Sucursal.todos.filter(nombre__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Ya existe una sucursal con ese nombre.')
        return value


class SucursalBreveSerializer(serializers.ModelSerializer):
    """Vista mínima de la sucursal, para anidar en el empleado y la sesión."""

    class Meta:
        model = Sucursal
        fields = ('id', 'nombre', 'codigo_postal')


class UsuarioBreveSerializer(serializers.ModelSerializer):
    """Vista mínima de la cuenta de login vinculada a un empleado."""

    rol = serializers.SerializerMethodField()
    en_linea = serializers.BooleanField(read_only=True)

    class Meta:
        model = Usuario
        fields = ('id', 'username', 'email', 'is_active', 'rol', 'last_login', 'ultima_actividad', 'en_linea')

    def get_rol(self, obj):
        if not obj.rol_id:
            return None
        return {'id': obj.rol_id, 'nombre': obj.rol.nombre, 'es_admin': obj.rol.es_admin}


class EmpleadoSerializer(serializers.ModelSerializer):
    """Representación de lectura del empleado, con su cuenta (o null)."""

    usuario = UsuarioBreveSerializer(read_only=True)
    sucursal = SucursalBreveSerializer(read_only=True)
    nombre_completo = serializers.CharField(read_only=True)
    puede_loguear = serializers.BooleanField(read_only=True)

    class Meta:
        model = Empleado
        fields = (
            'id', 'nombre', 'apellido', 'nombre_completo',
            'usuario', 'sucursal', 'puede_loguear', 'creado',
        )


class EmpleadoWriteSerializer(serializers.ModelSerializer):
    """Alta/edición de los datos del empleado (sin tocar la cuenta de login)."""

    # Opcional: el local al que pertenece. `allow_null` para poder desvincularlo.
    sucursal = serializers.PrimaryKeyRelatedField(
        queryset=Sucursal.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = Empleado
        fields = ('nombre', 'apellido', 'sucursal')

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
    # Rol que define a que modulos entra el empleado. Opcional: si no se manda al
    # crear el acceso, se asigna el rol "Empleado" por defecto.
    rol_id = serializers.PrimaryKeyRelatedField(
        queryset=Rol.objects.all(), required=False, allow_null=True,
    )

    @property
    def empleado(self):
        return self.context['empleado']

    def _otras_cuentas(self):
        """Usuarios distintos del ya vinculado a este empleado (para unicidad)."""
        # `todos` incluye cuentas borradas logicamente, para no chocar con la
        # constraint unica de username/email al validar.
        qs = Usuario.todos.all()
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
        es_nuevo = empleado.usuario is None
        user = empleado.usuario or Usuario(is_staff=False, is_superuser=False)
        user.username = data['username']
        user.email = data['email']
        user.is_active = True
        # Asignacion de rol: si viene `rol_id` se respeta (incluido null para
        # quitarlo); si es una cuenta nueva sin rol explicito, va el "Empleado".
        if 'rol_id' in data:
            user.rol = data['rol_id']
        elif es_nuevo:
            user.rol = Rol.objects.filter(nombre__iexact='Empleado').first()
        if data.get('password'):
            user.set_password(data['password'])
        user.save()
        if empleado.usuario_id != user.id:
            empleado.usuario = user
            empleado.save(update_fields=['usuario'])
        return user
