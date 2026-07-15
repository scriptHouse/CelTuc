"""Siembra el permiso de modulo `ver_caja` y se lo concede al rol Empleado."""
from django.db import migrations

PERMISO = (
    'ver_caja',
    'Ver Caja',
    'Acceso al modulo de caja: turnos, movimientos, arqueo y cierres Z.',
    12,
)


def sembrar(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Rol = apps.get_model('usuarios', 'Rol')
    codigo, nombre, descripcion, orden = PERMISO
    permiso, _ = Permiso.objects.update_or_create(
        codigo=codigo,
        defaults={'nombre': nombre, 'descripcion': descripcion, 'orden': orden},
    )
    empleado = Rol.objects.filter(nombre__iexact='Empleado').first()
    if empleado:
        empleado.permisos.add(permiso)


def revertir(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Permiso.objects.filter(codigo=PERMISO[0]).delete()


class Migration(migrations.Migration):
    dependencies = [('usuarios', '0011_seed_permiso_dolar')]
    operations = [migrations.RunPython(sembrar, revertir)]
