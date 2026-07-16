# -*- coding: utf-8 -*-
"""Los iPhones del negocio entran al catalogo e inventario "(no informado)".

Pedido del usuario (2026-07-16): la categoria "iPhones" del catalogo estaba
vacia porque las planillas nunca listaron los equipos (se cotizan a mano).
Aca se crean los 43 modelos del catalogo de equipos (`Dispositivo`, de iPhone
6 a 17 Pro Max) como productos SIN precio, vinculados a su equipo (asi la
Ficha los muestra en "Venta" con sus chips de stock), y con la fila de stock
cantidad=0 sin_dato=True — "(no informado)" — en cada sucursal, sin
movimientos de kardex: el stock real lo cargan contando.

No pisa nada existente (get_or_create).
"""
from django.db import migrations

IPHONES = [
    'iPhone 6', 'iPhone 6 Plus', 'iPhone 6S', 'iPhone 6S Plus',
    'iPhone SE 2016',
    'iPhone 7', 'iPhone 7 Plus', 'iPhone 8', 'iPhone 8 Plus',
    'iPhone X', 'iPhone XR', 'iPhone XS', 'iPhone XS Max',
    'iPhone SE 2020',
    'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
    'iPhone 12 mini', 'iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
    'iPhone 13 mini', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
    'iPhone SE 2022',
    'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
    'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
    'iPhone 16e', 'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro',
    'iPhone 16 Pro Max',
    'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
]


def cargar(apps, schema_editor):
    Producto = apps.get_model('productos', 'Producto')
    CategoriaProducto = apps.get_model('productos', 'CategoriaProducto')
    Dispositivo = apps.get_model('precios_service', 'Dispositivo')
    Sucursal = apps.get_model('inventario', 'Sucursal')
    StockProducto = apps.get_model('inventario', 'StockProducto')

    categoria = CategoriaProducto.objects.filter(
        nombre='iPhones', padre__isnull=True, borrado=False,
    ).first()
    if categoria is None:
        siguiente = max(CategoriaProducto.objects.filter(
            padre__isnull=True, borrado=False,
        ).values_list('orden', flat=True), default=0) + 1
        categoria = CategoriaProducto.objects.create(nombre='iPhones', orden=siguiente)

    sucursales = Sucursal.objects.filter(borrado=False, activa=True)
    dispositivos = {d.nombre: d for d in Dispositivo.objects.filter(borrado=False)}

    for orden, nombre in enumerate(IPHONES):
        producto, _ = Producto.objects.get_or_create(
            categoria=categoria,
            nombre=nombre,
            marca='',
            calidad='',
            nota='',
            borrado=False,
            defaults={'orden': orden},
        )
        dispositivo = dispositivos.get(nombre)
        if dispositivo is not None:
            producto.dispositivos.add(dispositivo)
        for sucursal in sucursales:
            StockProducto.objects.get_or_create(
                producto=producto, sucursal=sucursal, borrado=False,
                defaults={'cantidad': 0, 'sin_dato': True},
            )


def descargar(apps, schema_editor):
    Producto = apps.get_model('productos', 'Producto')
    StockProducto = apps.get_model('inventario', 'StockProducto')
    productos = Producto.objects.filter(
        categoria__nombre='iPhones', categoria__padre__isnull=True,
        nombre__in=IPHONES, borrado=False,
    )
    StockProducto.objects.filter(
        producto__in=productos, sin_dato=True, cantidad=0,
    ).delete()
    productos.filter(stocks__isnull=True, items_venta__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0007_seed_stock_service_no_informado'),
        ('precios_service', '0004_seed_dispositivos_excel'),
    ]

    operations = [
        migrations.RunPython(cargar, descargar),
    ]
