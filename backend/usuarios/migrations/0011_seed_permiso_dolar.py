"""Agrega el permiso del modulo "Dolar" (gestor de dolar del negocio).

Sigue el patron de 0006/0008/0009/0010. Tambien se concede al rol base
"Empleado" (que lo ve en modo solo lectura; editar sigue siendo de admins).
"""
from django.db import migrations


PERMISO = (
    'ver_dolar',
    'Ver Dolar',
    'Acceso al gestor de dolar (el del negocio y el blue de referencia).',
    10,
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

    dependencies = [
        ('usuarios', '0010_seed_permisos_productos_equipos'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
