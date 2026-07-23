# -*- coding: utf-8 -*-
"""Unificación de sucursales: esta tabla pasa a ser LA lista de locales.

Antes había dos tablas de sucursales: esta (stock: "Solar" y "Centro") y la de
empleados ("YB", "La Salta" y "Central YB"). Son los mismos locales físicos, así
que acá se renombran las filas de stock a su nombre definitivo, se les carga el
código postal y se agrega la que faltaba:

    Solar  -> Solar YB    (Yerba Buena, CP 4107)
    Centro -> Salta       (Capital, CP 4000)
    (nueva)   Central YB  (Yerba Buena, CP 4107; todavía sin stock)

La migración 0005 de empleados reapunta a los empleados hacia estas filas y
elimina la tabla duplicada.
"""
from django.db import migrations

# (nombre viejo, nombre definitivo, codigo postal, orden si hay que crearla)
RENOMBRES = [
    ('Solar', 'Solar YB', '4107', 1),
    ('Centro', 'Salta', '4000', 2),
]


def unificar(apps, schema_editor):
    Sucursal = apps.get_model('inventario', 'Sucursal')
    for viejo, nuevo, cp, orden in RENOMBRES:
        fila = Sucursal.objects.filter(nombre=viejo, borrado=False).first()
        if fila is not None:
            fila.nombre = nuevo
            fila.codigo_postal = cp
            fila.save(update_fields=['nombre', 'codigo_postal'])
        elif not Sucursal.objects.filter(nombre=nuevo, borrado=False).exists():
            Sucursal.objects.create(nombre=nuevo, codigo_postal=cp, orden=orden, activa=True)
        else:
            # Ya estaba renombrada (re-ejecución): solo asegurar el CP.
            Sucursal.objects.filter(nombre=nuevo, borrado=False, codigo_postal='').update(
                codigo_postal=cp,
            )
    if not Sucursal.objects.filter(nombre='Central YB', borrado=False).exists():
        Sucursal.objects.create(nombre='Central YB', codigo_postal='4107', orden=3, activa=True)


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0011_sucursal_codigo_postal'),
    ]

    operations = [
        migrations.RunPython(unificar, migrations.RunPython.noop),
    ]
