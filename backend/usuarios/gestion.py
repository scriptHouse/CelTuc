"""Gestión de cuentas de usuario (solo administradores).

Endpoints para crear/listar/editar/eliminar usuarios desde la app, con la opción
de crear su Empleado en el mismo paso. Separado de la autenticación (login/me)
para mantener esos archivos enfocados.
"""
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import identidad
from .models import Rol, Usuario
from .permissions import EsAdministrador


# --- Mensajes de las guardas -------------------------------------------------
# Dicen POR QUÉ no se puede y qué hacer, no solo que no se puede. Los usa
# también la gestión de accesos desde Empleados (empleados/views.py).

MSG_SOLO_SUPER_EDITA = (
    'Esta cuenta es de un administrador. Solo el superadministrador (la cuenta principal '
    'del sistema) puede cambiarla: pedíselo a quien la tenga.'
)
MSG_SOLO_SUPER_ELIMINA = (
    'Esta cuenta es de un administrador. Solo el superadministrador (la cuenta principal '
    'del sistema) puede eliminarla: pedíselo a quien la tenga.'
)
MSG_NO_PAUSARSE = (
    'No podés pausar tu propia cuenta: te quedarías afuera del sistema. '
    'Si de verdad hace falta, pedíselo a otro administrador.'
)
MSG_NO_QUITARSE_ADMIN = (
    'No podés sacarte a vos mismo el permiso de administrador: te quedarías sin poder '
    'manejar el sistema. Pedíselo a otro administrador.'
)
MSG_NO_CAMBIAR_PROPIO_ROL = (
    'No podés cambiarte tu propio rol: podrías quedarte sin acceso por error. '
    'Pedíselo a otro administrador.'
)
MSG_NO_ELIMINARSE = (
    'No podés eliminar tu propia cuenta: te quedarías afuera del sistema. '
    'Pedíselo a otro administrador.'
)
MSG_NO_ELIMINAR_SUPER = (
    'Esta es la cuenta principal del sistema (superadministrador) y no se puede eliminar.'
)


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
        suc = emp.sucursal
        return {
            'id': emp.id,
            'nombre': emp.nombre,
            'apellido': emp.apellido,
            'nombre_completo': emp.nombre_completo,
            'sucursal': {'id': suc.id, 'nombre': suc.nombre} if suc else None,
            'creado': emp.creado,
        }


class _EmpleadoMiniSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=120)
    apellido = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')


class UsuarioCreateSerializer(serializers.Serializer):
    """Crea una cuenta y, opcionalmente, su Empleado en el mismo request.

    Nunca crea superusuarios: como mucho, una cuenta `is_staff` (administradora).
    El único superusuario es el admin original. Las reglas y los mensajes de
    usuario/email/contraseña viven en `usuarios/identidad.py`.
    """

    username = serializers.CharField(error_messages=identidad.ERRORES_USERNAME)
    email = serializers.EmailField(error_messages=identidad.ERRORES_EMAIL)
    password = serializers.CharField(write_only=True, error_messages=identidad.ERRORES_PASSWORD)
    is_staff = serializers.BooleanField(default=False)
    # Rol que define a que modulos entra la cuenta (opcional: sin rol = sin acceso).
    rol = serializers.PrimaryKeyRelatedField(
        queryset=Rol.objects.all(), required=False, allow_null=True,
    )
    empleado = _EmpleadoMiniSerializer(required=False, allow_null=True)

    def validate_username(self, value):
        return identidad.validar_username(value)

    def validate_email(self, value):
        return identidad.validar_email(value)

    def validate_password(self, value):
        return identidad.validar_password(value)

    @transaction.atomic
    def create(self, validated_data):
        empleado_data = validated_data.pop('empleado', None)
        # Si una cuenta ELIMINADA todavía tiene este usuario/email, lo suelta.
        identidad.liberar_identificadores(validated_data['username'], validated_data['email'])
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
    username = serializers.CharField(required=False, error_messages=identidad.ERRORES_USERNAME)
    email = serializers.EmailField(required=False, error_messages=identidad.ERRORES_EMAIL)
    is_active = serializers.BooleanField(required=False)
    is_staff = serializers.BooleanField(required=False)
    rol = serializers.PrimaryKeyRelatedField(
        queryset=Rol.objects.all(), required=False, allow_null=True,
    )
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate_username(self, value):
        return identidad.validar_username(value, excluir=self.instance.pk)

    def validate_email(self, value):
        return identidad.validar_email(value, excluir=self.instance.pk)

    def validate_password(self, value):
        # Vacía = no se cambia; si viene, tiene que cumplir el mínimo.
        return identidad.validar_password(value) if value else value

    @transaction.atomic
    def update(self, instance, validated_data):
        identidad.liberar_identificadores(
            validated_data.get('username'), validated_data.get('email'), excluir=instance.pk,
        )
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
        usuarios = Usuario.objects.select_related('empleado', 'empleado__sucursal', 'rol').order_by('username')
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
                {'detail': MSG_SOLO_SUPER_EDITA},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Evitar que el admin se deje afuera a sí mismo.
        if user.pk == request.user.pk:
            if request.data.get('is_active') is False:
                return Response(
                    {'detail': MSG_NO_PAUSARSE},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if request.data.get('is_staff') is False:
                return Response(
                    {'detail': MSG_NO_QUITARSE_ADMIN},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Mismo espíritu que lo anterior: cambiarse el propio rol puede dejarlo
            # sin administración (si le viene del rol) o sin módulos, por accidente.
            if 'rol' in request.data:
                return Response(
                    {'detail': MSG_NO_CAMBIAR_PROPIO_ROL},
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
                {'detail': MSG_NO_ELIMINARSE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_superuser:
            return Response(
                {'detail': MSG_NO_ELIMINAR_SUPER},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Jerarquia: solo un superadministrador puede eliminar a un administrador.
        if user.es_administrador and not request.user.is_superuser:
            return Response(
                {'detail': MSG_SOLO_SUPER_ELIMINA},
                status=status.HTTP_403_FORBIDDEN,
            )
        # El Empleado vinculado (si hay) sobrevive sin login (Empleado.usuario = SET_NULL).
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DisponibilidadView(APIView):
    """¿Está libre este usuario / email? Para avisar MIENTRAS se escribe.

    `GET /api/usuarios/disponibilidad/?username=lgomez&email=l@x.com&excluir=4`
    (`excluir`: la cuenta que se está editando). Con `nombre`/`apellido` además
    propone usuarios libres (`sugerencias`), para no tener que inventarlos.
    Solo administradores: dice qué cuenta tiene cada dato.
    """

    permission_classes = [EsAdministrador]

    def get(self, request):
        params = request.query_params
        excluir = params.get('excluir')
        excluir = int(excluir) if excluir and excluir.isdigit() else None
        resultado = {}

        if 'username' in params:
            valor = identidad.normalizar(params['username'])
            problema = identidad.problema_username(valor)
            usuario = None if problema else identidad.cuenta_que_usa('username', valor, excluir)
            sugerencias = []
            if usuario is not None:
                sugerencias = identidad.sugerir_usernames(base=valor, excluir=excluir)
                problema = identidad.mensaje_username_en_uso(valor, usuario, sugerencias)
            resultado['username'] = {
                'valor': valor,
                'ok': problema is None,
                'mensaje': problema,
                'usado_por': identidad.resumen_cuenta(usuario) if usuario else None,
                'sugerencias': sugerencias,
            }

        if 'email' in params:
            valor = identidad.normalizar(params['email'])
            problema = identidad.problema_email(valor)
            usuario = None if problema else identidad.cuenta_que_usa('email', valor, excluir)
            if usuario is not None:
                problema = identidad.mensaje_email_en_uso(usuario)
            resultado['email'] = {
                'valor': valor,
                'ok': problema is None,
                'mensaje': problema,
                'usado_por': identidad.resumen_cuenta(usuario) if usuario else None,
            }

        if 'nombre' in params or 'apellido' in params:
            resultado['sugerencias'] = identidad.sugerir_usernames(
                nombre=params.get('nombre', ''), apellido=params.get('apellido', ''), excluir=excluir,
            )

        return Response(resultado)
