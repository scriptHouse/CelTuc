# -*- coding: utf-8 -*-
"""Las tres sucursales del negocio (nombre + codigo postal)."""
from django.db import migrations

# (nombre, codigo_postal)
SUCURSALES = [
    ("La Salta", "4000"),
    ("YB", "4107"),
    ("Central YB", "4107"),
]


def crear(apps, schema_editor):
    Sucursal = apps.get_model("empleados", "Sucursal")
    for nombre, cp in SUCURSALES:
        Sucursal.objects.update_or_create(
            nombre=nombre,
            borrado=False,
            defaults={"codigo_postal": cp, "activa": True},
        )


def borrar(apps, schema_editor):
    Sucursal = apps.get_model("empleados", "Sucursal")
    Sucursal.objects.filter(nombre__in=[n for n, _ in SUCURSALES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("empleados", "0003_sucursal_empleado_sucursal"),
    ]

    operations = [
        migrations.RunPython(crear, borrar),
    ]
