"""Agrega los permisos de los modulos "Productos" y "Ficha de equipo".

Sigue el patron de 0006/0008/0009. Tambien se conceden al rol base "Empleado".
"""
from django.db import migrations


PERMISOS = [
    ('ver_productos', 'Ver Productos', 'Acceso al catalogo central de productos y precios.', 8),
    ('ver_equipos', 'Ver Ficha de equipo', 'Acceso a la ficha 360 de cada equipo (venta, toma y service).', 9),
]


def sembrar(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Rol = apps.get_model('usuarios', 'Rol')

    empleado = Rol.objects.filter(nombre__iexact='Empleado').first()
    for codigo, nombre, descripcion, orden in PERMISOS:
        permiso, _ = Permiso.objects.update_or_create(
            codigo=codigo,
            defaults={'nombre': nombre, 'descripcion': descripcion, 'orden': orden},
        )
        if empleado:
            empleado.permisos.add(permiso)


def revertir(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Permiso.objects.filter(codigo__in=[p[0] for p in PERMISOS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0009_seed_permiso_precios_service'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
