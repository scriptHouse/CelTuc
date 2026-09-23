from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from inventario.models import Sucursal
from usuarios import identidad
from usuarios.gestion import MSG_NO_CAMBIAR_PROPIO_ROL, MSG_NO_PAUSARSE
from usuarios.models import Rol, Usuario

from .models import Empleado


class SucursalSerializer(serializers.ModelSerializer):
    """Alta/edición y listado de sucursales (nombre, código postal y estado).

    Opera sobre la tabla ÚNICA de sucursales (`inventario.Sucursal`), la misma
    que usa el stock; desde acá se editan la identidad y el código postal.
    """

    class Meta:
        model = Sucursal
        fields = ('id', 'nombre', 'codigo_postal', 'activa', 'creado', 'actualizado')
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Falta el nombre de la sucursal (por ejemplo «Solar YB»).')
        # Solo las vivas: la constraint única de la base es parcial (`borrado=False`),
        # así que el nombre de una sucursal eliminada se puede volver a usar.
        qs = Sucursal.objects.filter(nombre__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                f'Ya hay una sucursal que se llama «{value}». Elegí otro nombre para no confundirlas.'
            )
        return value

    def create(self, validated_data):
        # Este endpoint no maneja `orden` (eso es de la vista de inventario):
        # las sucursales nuevas van al final para no colarse en el medio.
        tope = Sucursal.todos.aggregate(m=Max('orden'))['m'] or 0
        validated_data.setdefault('orden', tope + 1)
        return super().create(validated_data)


class SucursalBreveSerializer(serializers.ModelSerializer):
    """Vista mínima de la sucursal, para anidar en el empleado y la sesión."""

    class Meta:
        model = Sucursal
        fields = ('id', 'nombre', 'codigo_postal')


class UsuarioBreveSerializer(serializers.ModelSerializer):
    """Vista mínima de la cuenta de login vinculada a un empleado."""

    rol = serializers.SerializerMethodField()
    en_linea = serializers.BooleanField(read_only=True)
    # Para decir en la tarjeta si entra como administrador (ve todo) o por su rol.
    es_administrador = serializers.BooleanField(read_only=True)

    class Meta:
        model = Usuario
        fields = (
            'id', 'username', 'email', 'is_active', 'rol', 'last_login', 'ultima_actividad', 'en_linea',
            'es_administrador', 'is_staff', 'is_superuser',
        )

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


MSG_FALTA_NOMBRE = 'Falta el nombre de la persona (por ejemplo «Lucas»).'


class EmpleadoWriteSerializer(serializers.ModelSerializer):
    """Alta/edición de los datos del empleado (sin tocar la cuenta de login)."""

    # Opcional: el local al que pertenece. `allow_null` para poder desvincularlo.
    sucursal = serializers.PrimaryKeyRelatedField(
        queryset=Sucursal.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = Empleado
        fields = ('nombre', 'apellido', 'sucursal')
        extra_kwargs = {
            'nombre': {'error_messages': {
                'blank': MSG_FALTA_NOMBRE, 'required': MSG_FALTA_NOMBRE, 'null': MSG_FALTA_NOMBRE,
            }},
        }

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(MSG_FALTA_NOMBRE)
        return value


class AccesoSerializer(serializers.Serializer):
    """Crea o actualiza la cuenta de login de un empleado (su «llave»).

    Siempre genera usuarios REGULARES (is_staff=False, is_superuser=False): así
    quedan diferenciados del admin del sistema, que es el único superusuario.
    Reglas y mensajes de usuario/email/contraseña: `usuarios/identidad.py`.

    Contexto: `empleado` (puede ser uno todavía sin guardar, cuando se crea la
    persona y su acceso en el mismo pedido) y `actor` (quien hace el cambio,
    para no dejarlo cambiarse el rol ni pausarse a sí mismo).
    """

    username = serializers.CharField(error_messages=identidad.ERRORES_USERNAME)
    email = serializers.EmailField(error_messages=identidad.ERRORES_EMAIL)
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
    # Pausar / reactivar la llave sin borrarla. Si no viene: una cuenta nueva
    # nace activa y una existente queda como estaba.
    is_active = serializers.BooleanField(required=False)

    @property
    def empleado(self):
        return self.context['empleado']

    def _cuenta_actual_id(self):
        return self.empleado.usuario_id

    def validate_username(self, value):
        return identidad.validar_username(value, excluir=self._cuenta_actual_id())

    def validate_email(self, value):
        return identidad.validar_email(value, excluir=self._cuenta_actual_id())

    def validate_password(self, value):
        # Vacía = no se cambia (si la cuenta ya existe); si viene, con el mínimo.
        return identidad.validar_password(value) if value else value

    def validate(self, attrs):
        es_nuevo = self._cuenta_actual_id() is None
        # Si el empleado todavía no tiene cuenta, la contraseña es obligatoria.
        if es_nuevo and not attrs.get('password'):
            raise serializers.ValidationError({'password': identidad.MSG_PASSWORD_VACIA})
        # La propia cuenta: ni cambiarse el rol ni pausarse (igual que en Usuarios).
        actor = self.context.get('actor')
        if actor is not None and not es_nuevo and self._cuenta_actual_id() == actor.pk:
            actual = self.empleado.usuario
            if 'rol_id' in attrs:
                nuevo = attrs['rol_id'].pk if attrs['rol_id'] else None
                if nuevo != actual.rol_id:
                    raise serializers.ValidationError({'rol_id': MSG_NO_CAMBIAR_PROPIO_ROL})
            if attrs.get('is_active') is False:
                raise serializers.ValidationError({'is_active': MSG_NO_PAUSARSE})
        return attrs

    @transaction.atomic
    def save(self):
        empleado = self.empleado
        data = self.validated_data
        es_nuevo = empleado.usuario is None
        user = empleado.usuario or Usuario(is_staff=False, is_superuser=False)
        # Si una cuenta ELIMINADA todavía tiene este usuario/email, lo suelta.
        identidad.liberar_identificadores(data['username'], data['email'], excluir=user.pk)
        user.username = data['username']
        user.email = data['email']
        if es_nuevo:
            user.is_active = True
        elif 'is_active' in data:
            user.is_active = data['is_active']
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
