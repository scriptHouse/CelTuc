# -*- coding: utf-8 -*-
"""Las dos sucursales actuales del negocio."""
from django.db import migrations

SUCURSALES = [
    ('Solar', 1),
    ('Centro', 2),
]


def crear(apps, schema_editor):
    Sucursal = apps.get_model('inventario', 'Sucursal')
    for nombre, orden in SUCURSALES:
        Sucursal.objects.update_or_create(
            nombre=nombre, borrado=False, defaults={'orden': orden, 'activa': True},
        )


def borrar(apps, schema_editor):
    Sucursal = apps.get_model('inventario', 'Sucursal')
    Sucursal.objects.filter(nombre__in=[n for n, _ in SUCURSALES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(crear, borrar),
    ]
