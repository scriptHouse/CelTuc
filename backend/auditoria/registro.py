"""Como se escribe la auditoria: allowlist de modelos + señales de Django.

Solo se registran acciones hechas POR UNA CUENTA a traves de una peticion (si
no hay usuario autenticado — migraciones, comandos, seeds — no se escribe
nada). La escritura esta envuelta en try/except: la auditoria JAMAS puede
romper la operacion que esta observando.
"""
import datetime
import logging

from django.apps import apps as django_apps
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save
from django.utils import timezone

from . import contexto

logger = logging.getLogger(__name__)

# Campos de infraestructura que no cuentan como "cambio" (serian puro ruido).
CAMPOS_IGNORADOS = {
    'id', 'creado', 'actualizado', 'creado_por', 'actualizado_por',
    'borrado', 'fecha_borrado', 'borrado_por',
    'last_login', 'ultima_actividad',
}

# Campos secretos: se registra QUE cambiaron, nunca su valor.
CAMPOS_ENMASCARADOS = {'password', 'certificado', 'clave_privada', 'token_hash', 'token_prefijo'}

MASCARA = '••••••••'

# Modelos vigilados. `omitir` descarta instancias puntuales: el movimiento que
# genera una venta ya esta contado en la venta misma, no hace falta duplicarlo.
AUDITADOS = {
    'usuarios.Usuario': {},
    'usuarios.Rol': {},
    'empleados.Empleado': {},
    'inventario.Sucursal': {},
    'inventario.Venta': {},
    'inventario.MovimientoStock': {
        'omitir': lambda instancia: instancia.tipo == 'venta',
    },
    'productos.Producto': {},
    'productos.CategoriaProducto': {},
    'productos.ConfiguracionProductos': {},
    'precios_service.ConfiguracionService': {},
    'precios_service.Dispositivo': {},
    'precios_service.ItemService': {},
    'precios_service.PrecioItemService': {},
    'cotizaciones.ModeloEquipo': {},
    'cotizaciones.CotizacionEquipo': {},
    'cotizaciones.PrecioServicio': {},
    'facturacion.Emisor': {},
    'facturacion.LimiteMensual': {},
    'facturacion.Comprobante': {},
    'facturacion.Cliente': {},
    'caja.Caja': {},
    'caja.SesionCaja': {},
    'caja.CierreCaja': {},
    'caja.MovimientoCaja': {
        'omitir': lambda instancia: instancia.venta_id is not None,
    },
    'comunicados.Comunicado': {},
    'documentos.DocumentoGenerado': {},
    'comun.Preferencia': {},
    # Asistencia: se audita la configuracion (relojes, agentes, asignaciones),
    # NUNCA las fichadas (las escriben los agentes, sin usuario y en volumen).
    'asistencia.Dispositivo': {},
    'asistencia.Agente': {},
    'asistencia.MapeoEmpleado': {},
    'asistencia.Turno': {},
    'asistencia.AsignacionTurno': {},
    'asistencia.Licencia': {},
    'asistencia.Feriado': {},
}


# --- Serializacion de valores ------------------------------------------------

def _legible(campo, instancia):
    """Valor de un campo listo para mostrar (choices y FKs en texto)."""
    valor = getattr(instancia, campo.attname, None)  # attname: en FKs es el id
    if valor is None or valor == '':
        return None
    if campo.choices:
        return getattr(instancia, f'get_{campo.name}_display')()
    if campo.is_relation:
        # `_base_manager` no filtra el borrado logico: el texto sale igual.
        relacionado = campo.related_model._base_manager.filter(pk=valor).first()
        return str(relacionado) if relacionado is not None else f'#{valor}'
    if isinstance(valor, bool) or isinstance(valor, (int, float)):
        return valor
    if isinstance(valor, (dict, list)):
        return valor
    if isinstance(valor, datetime.datetime):
        return timezone.localtime(valor).strftime('%d/%m/%Y %H:%M')
    if isinstance(valor, datetime.date):
        return valor.strftime('%d/%m/%Y')
    return str(valor)


def _diff(antes, despues):
    """Los campos que cambiaron entre dos versiones, con su antes y despues."""
    cambios = {}
    for campo in despues._meta.concrete_fields:
        if campo.name in CAMPOS_IGNORADOS:
            continue
        if getattr(antes, campo.attname, None) == getattr(despues, campo.attname, None):
            continue
        etiqueta = str(campo.verbose_name)
        if campo.name in CAMPOS_ENMASCARADOS:
            cambios[etiqueta] = {'antes': MASCARA, 'despues': MASCARA}
        else:
            cambios[etiqueta] = {
                'antes': _legible(campo, antes),
                'despues': _legible(campo, despues),
            }
    return cambios


def _ip_de(request):
    if request is None:
        return None
    reenviada = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if reenviada:
        return reenviada.split(',')[0].strip() or None
    return request.META.get('REMOTE_ADDR') or None


# --- Escritura ---------------------------------------------------------------

def _escribir(accion, usuario, request=None, instancia=None, cambios=None,
              app='', modelo=''):
    """Crea un registro. Nunca lanza: la auditoria no rompe la operacion real."""
    from .models import RegistroAuditoria
    try:
        meta = instancia._meta if instancia is not None else None
        return RegistroAuditoria.objects.create(
            usuario=usuario if getattr(usuario, 'pk', None) else None,
            usuario_username=getattr(usuario, 'username', '') or '',
            accion=accion,
            app=(meta.app_label if meta else app) or '',
            modelo=(str(meta.verbose_name) if meta else modelo) or '',
            objeto_id=str(instancia.pk) if instancia is not None and instancia.pk is not None else '',
            objeto=str(instancia)[:300] if instancia is not None else '',
            cambios=cambios or {},
            ip=_ip_de(request),
        )
    except Exception:
        logger.exception('No se pudo escribir el registro de auditoria.')
        return None


def registrar_ingreso(usuario, request=None):
    """Registro explicito de un inicio de sesion (lo llama la vista de login)."""
    _escribir(
        'ingreso', usuario, request,
        app='usuarios', modelo='sesion',
    )


# --- Señales -----------------------------------------------------------------

def _config(sender):
    return AUDITADOS.get(f'{sender._meta.app_label}.{sender.__name__}', {})


def _pre_save(sender, instance, **kwargs):
    """Guarda una foto del estado previo para poder calcular el diff."""
    if contexto.usuario_actual() is None or instance.pk is None:
        return
    try:
        # `_base_manager` es un manager plano: tambien encuentra filas con
        # borrado logico (necesario para registrar una restauracion).
        instance._auditoria_antes = sender._base_manager.filter(pk=instance.pk).first()
    except Exception:
        instance._auditoria_antes = None


def _post_save(sender, instance, created, **kwargs):
    try:
        _procesar_guardado(sender, instance, created)
    except Exception:
        logger.exception('Fallo el registro de auditoria de un guardado.')


def _procesar_guardado(sender, instance, created):
    ctx = contexto.actual()
    usuario = contexto.usuario_actual()
    if ctx is None or usuario is None:
        return
    omitir = _config(sender).get('omitir')
    if omitir is not None and omitir(instance):
        return
    clave = (sender._meta.label, instance.pk)
    if created:
        ctx.creados.add(clave)
        _escribir('crear', usuario, ctx.request, instancia=instance)
        return
    if clave in ctx.creados:
        return  # retoque posterior a la creacion, en esta misma peticion
    antes = getattr(instance, '_auditoria_antes', None)
    if antes is None:
        return
    # El borrado y la restauracion logicos (ModeloBase) viajan como un save().
    if getattr(antes, 'borrado', False) != getattr(instance, 'borrado', False):
        accion = 'eliminar' if instance.borrado else 'restaurar'
        _escribir(accion, usuario, ctx.request, instancia=instance)
        return
    cambios = _diff(antes, instance)
    if not cambios:
        return
    _escribir('editar', usuario, ctx.request, instancia=instance, cambios=cambios)


def _post_delete(sender, instance, **kwargs):
    """Borrado fisico (raro en este proyecto: casi todo es borrado logico)."""
    try:
        ctx = contexto.actual()
        usuario = contexto.usuario_actual()
        if ctx is None or usuario is None:
            return
        omitir = _config(sender).get('omitir')
        if omitir is not None and omitir(instance):
            return
        _escribir('eliminar', usuario, ctx.request, instancia=instance)
    except Exception:
        logger.exception('Fallo el registro de auditoria de un borrado.')


def _nombres_permisos(rol):
    return sorted(rol.permisos.values_list('nombre', flat=True))


def _m2m_permisos(sender, instance, action, reverse, **kwargs):
    """Cambios en los permisos de un rol (M2M): un solo registro por peticion.

    Un `.set()` dispara varios remove/add: se captura el "antes" en la primera
    señal `pre_*` y se actualiza el mismo registro con el "despues" final.
    """
    if reverse:
        return
    try:
        ctx = contexto.actual()
        usuario = contexto.usuario_actual()
        if ctx is None or usuario is None:
            return
        clave = (instance._meta.label, instance.pk)
        if clave in ctx.creados:
            return  # el alta del rol ya quedo registrada con su foto
        if action in ('pre_add', 'pre_remove', 'pre_clear'):
            if clave not in ctx.m2m_antes:
                ctx.m2m_antes[clave] = _nombres_permisos(instance)
            return
        if action not in ('post_add', 'post_remove', 'post_clear'):
            return
        antes = ctx.m2m_antes.get(clave, [])
        despues = _nombres_permisos(instance)
        registro_id = ctx.registros_m2m.get(clave)
        if registro_id is None and antes == despues:
            return
        cambios = {'permisos': {'antes': antes, 'despues': despues}}
        if registro_id is not None:
            from .models import RegistroAuditoria
            RegistroAuditoria.objects.filter(pk=registro_id).update(cambios=cambios)
            return
        registro = _escribir('editar', usuario, ctx.request, instancia=instance, cambios=cambios)
        if registro is not None:
            ctx.registros_m2m[clave] = registro.pk
    except Exception:
        logger.exception('Fallo el registro de auditoria de un cambio de permisos.')


def conectar():
    """Conecta las señales sobre cada modelo vigilado (lo llama apps.ready)."""
    for etiqueta in AUDITADOS:
        modelo = django_apps.get_model(etiqueta)
        pre_save.connect(_pre_save, sender=modelo, dispatch_uid=f'auditoria_{etiqueta}_pre')
        post_save.connect(_post_save, sender=modelo, dispatch_uid=f'auditoria_{etiqueta}_post')
        post_delete.connect(_post_delete, sender=modelo, dispatch_uid=f'auditoria_{etiqueta}_del')
    rol = django_apps.get_model('usuarios', 'Rol')
    m2m_changed.connect(
        _m2m_permisos, sender=rol.permisos.through, dispatch_uid='auditoria_rol_permisos',
    )
