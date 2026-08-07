# -*- coding: utf-8 -*-
"""Marca los productos que en la factura van con concepto generico.

Son los de la planilla "Stock con Service" de la fila 292 para abajo que viven
en este catalogo: parlantes, consolas y los equipos Xiaomi, Samsung y Apple.
Los repuestos del taller (baterias, modulos, camaras, ...) estan en
`precios_service` y se marcan en la migracion equivalente de esa app.

Se marca por CATEGORIA y no por nombre a proposito: la planilla se actualiza
seguido (modelos nuevos, renombres) y el corte real es la seccion, no la fila.
Un producto que se agregue despues a estas categorias NO queda marcado solo;
se marca desde el sistema, uno por uno.

Reversible: al revertir se desmarcan las mismas categorias.
"""
from django.db import migrations

CATEGORIAS = ('Parlantes', 'Consolas', 'Xiaomi', 'Samsung', 'Productos Apple')


def marcar(apps, schema_editor):
    Producto = apps.get_model('productos', 'Producto')
    Producto.objects.filter(categoria__nombre__in=CATEGORIAS).update(
        concepto_generico_factura=True,
    )


def desmarcar(apps, schema_editor):
    Producto = apps.get_model('productos', 'Producto')
    Producto.objects.filter(categoria__nombre__in=CATEGORIAS).update(
        concepto_generico_factura=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('productos', '0004_producto_concepto_generico_factura'),
    ]

    operations = [
        migrations.RunPython(marcar, desmarcar),
    ]
