"""API del historial de auditoria (solo superadministrador).

Un unico endpoint de lectura con filtros y paginacion por offset. La primera
pagina ademas trae un resumen (conteos del dia / semana) y la lista de
usuarios que aparecen en el historial, para armar los filtros del front.
"""
from datetime import datetime, timedelta

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from usuarios.permissions import EsSuperadministrador

from .models import RegistroAuditoria

# Nombre visible de cada app en el front (fallback: el app_label capitalizado).
MODULOS = {
    'usuarios': 'Usuarios',
    'empleados': 'Empleados',
    'inventario': 'Inventario',
    'productos': 'Productos',
    'facturacion': 'Facturación',
    'caja': 'Caja',
    'cotizaciones': 'Cotizaciones',
    'precios_service': 'Service',
    'comunicados': 'Comunicados',
    'documentos': 'Documentos',
    'comun': 'Preferencias',
}

LIMITE_MAXIMO = 200


class RegistroSerializer(serializers.ModelSerializer):
    usuario = serializers.SerializerMethodField()
    accion_display = serializers.CharField(source='get_accion_display', read_only=True)
    modulo = serializers.SerializerMethodField()

    class Meta:
        model = RegistroAuditoria
        fields = (
            'id', 'creado', 'accion', 'accion_display',
            'usuario', 'usuario_username',
            'app', 'modulo', 'modelo', 'objeto_id', 'objeto',
            'cambios', 'ip',
        )

    def get_usuario(self, obj):
        if obj.usuario is None:
            return None
        try:
            nombre = obj.usuario.empleado.nombre_completo
        except ObjectDoesNotExist:
            nombre = ''
        return {'id': obj.usuario_id, 'username': obj.usuario.username, 'nombre': nombre}

    def get_modulo(self, obj):
        return MODULOS.get(obj.app, obj.app.replace('_', ' ').capitalize())


def _fecha_local(texto):
    """'2026-07-30' -> datetime aware al inicio de ese dia local (o None)."""
    try:
        dia = datetime.strptime(texto, '%Y-%m-%d')
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(dia)


class AuditoriaListView(APIView):
    permission_classes = [EsSuperadministrador]

    def get(self, request):
        params = request.query_params
        qs = RegistroAuditoria.objects.select_related('usuario', 'usuario__empleado')

        usuario = (params.get('usuario') or '').strip()
        if usuario:
            qs = qs.filter(usuario_username__iexact=usuario)
        accion = (params.get('accion') or '').strip()
        if accion in RegistroAuditoria.Accion.values:
            qs = qs.filter(accion=accion)
        app = (params.get('app') or '').strip()
        if app:
            qs = qs.filter(app=app)
        q = (params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(objeto__icontains=q)
                | Q(usuario_username__icontains=q)
                | Q(modelo__icontains=q)
            )
        desde = _fecha_local(params.get('desde'))
        if desde is not None:
            qs = qs.filter(creado__gte=desde)
        hasta = _fecha_local(params.get('hasta'))
        if hasta is not None:
            qs = qs.filter(creado__lt=hasta + timedelta(days=1))

        try:
            limite = min(max(int(params.get('limit', 50)), 1), LIMITE_MAXIMO)
        except (TypeError, ValueError):
            limite = 50
        try:
            offset = max(int(params.get('offset', 0)), 0)
        except (TypeError, ValueError):
            offset = 0

        total = qs.count()
        filas = qs[offset:offset + limite]
        respuesta = {
            'total': total,
            'resultados': RegistroSerializer(filas, many=True).data,
        }
        # El resumen y los filtros disponibles solo hacen falta en la primera
        # pagina: el "cargar mas" no paga esos conteos de nuevo.
        if offset == 0:
            respuesta['resumen'] = self._resumen()
            respuesta['usuarios'] = list(
                RegistroAuditoria.objects.exclude(usuario_username='')
                .values_list('usuario_username', flat=True)
                .distinct()
                .order_by('usuario_username')
            )
        return Response(respuesta)

    @staticmethod
    def _resumen():
        inicio_hoy = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        base = RegistroAuditoria.objects
        return {
            'hoy': base.filter(creado__gte=inicio_hoy).count(),
            'semana': base.filter(creado__gte=inicio_hoy - timedelta(days=6)).count(),
            'usuarios_hoy': (
                base.filter(creado__gte=inicio_hoy)
                .exclude(usuario_username='')
                .values('usuario_username')
                .distinct()
                .count()
            ),
            'total': base.count(),
        }
