from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from inventario.models import Sucursal
from usuarios.permissions import EsAdministrador, LecturaConPermisoEscrituraAdmin

from .models import Empleado
from .serializers import (
    AccesoSerializer,
    EmpleadoSerializer,
    EmpleadoWriteSerializer,
    SucursalSerializer,
)

# --- Guardas del acceso (la «llave» para entrar) --------------------------------
# Dicen por qué no se puede y qué hacer. Mismo criterio que la gestión de
# cuentas (usuarios/gestion.py): la jerarquía de admins y nadie se deja afuera
# a sí mismo.

MSG_SOLO_SUPER_ACCESO = (
    'Esta persona entra como administrador. Solo el superadministrador (la cuenta principal '
    'del sistema) puede cambiar o quitar su acceso: pedíselo a quien la tenga.'
)
MSG_SOLO_SUPER_BORRA = (
    'Esta persona entra como administrador. Solo el superadministrador (la cuenta principal '
    'del sistema) puede sacarla del equipo: pedíselo a quien la tenga.'
)
MSG_NO_QUITARSE_ACCESO = (
    'No podés quitarte tu propio acceso: te quedarías afuera del sistema. '
    'Pedíselo a otro administrador.'
)
MSG_NO_BORRARSE = (
    'No podés sacarte a vos mismo del equipo: se borraría tu cuenta y te quedarías afuera '
    'del sistema. Pedíselo a otro administrador.'
)


def _chequear_gestion_acceso(actor, empleado, quitar=False):
    """Levanta el error que corresponda si `actor` no puede tocar este acceso."""
    usuario = empleado.usuario
    if usuario is None:
        return
    propia = usuario.pk == actor.pk
    if usuario.es_administrador and not actor.is_superuser and not propia:
        raise PermissionDenied(MSG_SOLO_SUPER_ACCESO)
    if quitar and propia:
        raise ValidationError({'detail': MSG_NO_QUITARSE_ACCESO})


def _quitar_acceso(empleado):
    """Borra la cuenta del empleado (queda en el equipo, sin poder entrar)."""
    usuario = empleado.usuario
    if usuario is None:
        return
    empleado.usuario = None
    empleado.save(update_fields=['usuario'])
    usuario.delete()


def _acceso_pedido(request):
    """¿El pedido trae `acceso`? -> (viene, datos): dict = dar/editar, None = quitar."""
    if not hasattr(request.data, 'get') or 'acceso' not in request.data:
        return False, None
    datos = request.data.get('acceso')
    if datos is not None and not isinstance(datos, dict):
        raise ValidationError({'acceso': 'Los datos del acceso tienen que venir como objeto.'})
    return True, datos


def _validar_juntos(write, acceso):
    """Valida la persona y su acceso de una vez: se informan TODOS los errores."""
    errores = {}
    if not write.is_valid():
        errores.update(write.errors)
    if acceso is not None and not acceso.is_valid():
        errores['acceso'] = acceso.errors
    if errores:
        raise ValidationError(errores)


class SucursalListCreateView(generics.ListCreateAPIView):
    # Leer: quien tenga el permiso del módulo Empleados. Escribir: solo admin.
    queryset = Sucursal.objects.all()
    serializer_class = SucursalSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'


class SucursalDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Sucursal.objects.all()
    serializer_class = SucursalSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'

    def perform_destroy(self, instance):
        # El borrado es lógico (no dispara el SET_NULL de la FK), así que
        # desvinculamos a mano a los empleados que tenían esta sucursal.
        Empleado.todos.filter(sucursal=instance).update(sucursal=None)
        instance.delete()


class EmpleadoListCreateView(generics.ListCreateAPIView):
    # Leer: quien tenga el permiso del modulo Empleados. Escribir: solo admin.
    queryset = Empleado.objects.select_related('usuario', 'usuario__rol', 'sucursal').all()
    serializer_class = EmpleadoSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'

    def create(self, request, *args, **kwargs):
        # Con `acceso` en el mismo pedido se crean la persona Y su llave juntas:
        # si la llave tiene un problema (p. ej. el email ya lo usa otro), no se
        # guarda nada. Antes eran dos pedidos, y al reintentar quedaba el
        # empleado repetido.
        write = EmpleadoWriteSerializer(data=request.data)
        viene, datos = _acceso_pedido(request)
        acceso = None
        if viene and datos is not None:
            acceso = AccesoSerializer(data=datos, context={'empleado': Empleado(), 'actor': request.user})
        _validar_juntos(write, acceso)
        with transaction.atomic():
            empleado = write.save()
            if acceso is not None:
                acceso.context['empleado'] = empleado
                acceso.save()
        empleado = self.get_queryset().get(pk=empleado.pk)
        return Response(EmpleadoSerializer(empleado).data, status=201)


class EmpleadoDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Empleado.objects.select_related('usuario', 'usuario__rol', 'sucursal').all()
    serializer_class = EmpleadoSerializer
    permission_classes = [LecturaConPermisoEscrituraAdmin]
    permiso_requerido = 'ver_empleados'

    def update(self, request, *args, **kwargs):
        # `acceso`: objeto = dar o editar la llave, null = quitarla, ausente = no se toca.
        empleado = self.get_object()
        write = EmpleadoWriteSerializer(
            empleado, data=request.data, partial=kwargs.get('partial', False),
        )
        viene, datos = _acceso_pedido(request)
        acceso = None
        if viene:
            _chequear_gestion_acceso(request.user, empleado, quitar=datos is None)
            if datos is not None:
                acceso = AccesoSerializer(data=datos, context={'empleado': empleado, 'actor': request.user})
        _validar_juntos(write, acceso)
        with transaction.atomic():
            write.save()
            if viene:
                if acceso is not None:
                    acceso.save()
                else:
                    _quitar_acceso(empleado)
        empleado = self.get_queryset().get(pk=empleado.pk)
        return Response(EmpleadoSerializer(empleado).data)

    def perform_destroy(self, instance):
        # Borrar el empleado también elimina su cuenta de login (si la tenía).
        usuario = instance.usuario
        if usuario is not None and usuario.pk == self.request.user.pk:
            raise ValidationError({'detail': MSG_NO_BORRARSE})
        # Jerarquia: un admin comun no puede eliminar a un empleado con cuenta admin.
        if usuario is not None and usuario.es_administrador and not self.request.user.is_superuser:
            raise PermissionDenied(MSG_SOLO_SUPER_BORRA)
        instance.delete()
        if usuario is not None:
            usuario.delete()


class EmpleadoAccesoView(APIView):
    """Gestiona la cuenta de login del empleado: PUT crea/actualiza, DELETE quita."""

    permission_classes = [EsAdministrador]

    def put(self, request, pk):
        empleado = get_object_or_404(Empleado, pk=pk)
        _chequear_gestion_acceso(request.user, empleado)
        serializer = AccesoSerializer(data=request.data, context={'empleado': empleado, 'actor': request.user})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        empleado.refresh_from_db()
        return Response(EmpleadoSerializer(empleado).data)

    def delete(self, request, pk):
        empleado = get_object_or_404(Empleado, pk=pk)
        _chequear_gestion_acceso(request.user, empleado, quitar=True)
        _quitar_acceso(empleado)
        empleado.refresh_from_db()
        return Response(EmpleadoSerializer(empleado).data)
