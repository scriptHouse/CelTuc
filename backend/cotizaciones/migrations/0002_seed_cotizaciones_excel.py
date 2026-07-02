"""Importa la seccion de celulares de la hoja "Cotizaciones" del Excel.

Carga los 28 modelos de iPhone con sus rangos de toma (MIN-MAX en USD por
capacidad) y los tres tipos de service con sus precios por modelo (cambio de
bateria, de modulo y de tapa). Los "-" de la hoja no generan fila.

Todo queda 100 % editable despues desde el panel "Configurar" de Cotizaciones
(o el admin de Django).

Idempotente: cada modelo se identifica por (marca, nombre) y cada tipo por
nombre. Si ya existe, se le reemplazan los precios con los del Excel; si no,
se crea. Asi se puede correr sin duplicar datos ya cargados a mano.
"""
from decimal import Decimal

from django.db import migrations


TIPOS_SERVICIO = ['Cambio de batería', 'Cambio de módulo', 'Cambio de tapa']

# (nombre, [(capacidad_gb, precio_min, precio_max)], bateria, modulo, tapa)
# Precios en USD, tal cual la hoja. None = "-" (sin precio para ese service).
MODELOS = [
    ('11',         [(128, 130, 150)],                     45,  100, 55),
    ('11 Pro',     [(256, 180, 200)],                     55,  150, 60),
    ('11 Pro Max', [(256, 200, 220)],                     55,  150, 60),
    ('12 mini',    [(128, 120, 140)],                     60,  150, 60),
    ('12',         [(128, 150, 170)],                     60,  180, 60),
    ('12 Pro',     [(128, 200, 220), (256, 220, 240)],    60,  180, 65),
    ('12 Pro Max', [(128, 220, 240), (256, 240, 260)],    65,  200, 65),
    ('13 mini',    [(128, 170, 190), (256, 190, 210)],    65,  180, 65),
    ('13',         [(128, 240, 260), (256, 260, 280)],    65,  200, 65),
    ('13 Pro',     [(128, 310, 330), (256, 330, 350)],    70,  250, 85),
    ('13 Pro Max', [(128, 350, 370), (256, 370, 390)],    70,  300, 85),
    ('14',         [(128, 260, 280), (256, 280, 300)],    70,  250, 80),
    ('14 Plus',    [(128, 270, 290), (256, 290, 310)],    70,  250, 80),
    ('14 Pro',     [(128, 360, 380), (256, 380, 400)],    70,  340, 85),
    ('14 Pro Max', [(128, 400, 420), (256, 420, 460)],    75,  380, 85),
    ('15',         [(128, 370, 390), (256, 390, 410)],    85,  270, 85),
    ('15 Plus',    [(128, 380, 400), (256, 400, 420)],    85,  300, 85),
    ('15 Pro',     [(128, 460, 480), (256, 480, 500)],    90,  350, 85),
    ('15 Pro Max', [(256, 580, 600)],                     90,  400, 85),
    ('16e',        [(128, 370, 390), (256, 390, 410)],    90,  300, 85),
    ('16',         [(128, 510, 530), (256, 530, 550)],    100, 350, 100),
    ('16 Plus',    [(128, 530, 550), (256, 550, 570)],    100, 400, 100),
    ('16 Pro',     [(128, 620, 640), (256, 640, 660)],    100, 450, 100),
    ('16 Pro Max', [(256, 780, 800)],                     100, 450, 100),
    ('17',         [(256, 680, 700)],                     None, 450, None),
    ('17 Air',     [(256, 700, 720)],                     None, 450, None),
    ('17 Pro',     [(256, 1000, 1050)],                   None, 600, None),
    ('17 Pro Max', [(256, 1100, 1150)],                   None, 650, None),
]


def sembrar(apps, schema_editor):
    ModeloEquipo = apps.get_model('cotizaciones', 'ModeloEquipo')
    CotizacionEquipo = apps.get_model('cotizaciones', 'CotizacionEquipo')
    TipoServicio = apps.get_model('cotizaciones', 'TipoServicio')
    PrecioServicio = apps.get_model('cotizaciones', 'PrecioServicio')

    tipos = {}
    for orden, nombre in enumerate(TIPOS_SERVICIO):
        tipo, _ = TipoServicio.objects.update_or_create(
            nombre=nombre,
            defaults={'orden': orden, 'activo': True, 'borrado': False},
        )
        tipos[nombre] = tipo

    for orden, (nombre, capacidades, bateria, modulo, tapa) in enumerate(MODELOS):
        modelo = ModeloEquipo.objects.filter(marca='iPhone', nombre=nombre).first()
        if modelo is None:
            modelo = ModeloEquipo.objects.create(
                marca='iPhone', nombre=nombre, orden=orden, activo=True,
            )
        else:
            modelo.orden = orden
            modelo.activo = True
            modelo.save()

        # Reemplaza los precios con los de la hoja (borrado fisico de los viejos).
        CotizacionEquipo.objects.filter(modelo=modelo).delete()
        CotizacionEquipo.objects.bulk_create([
            CotizacionEquipo(
                modelo=modelo,
                capacidad_gb=gb,
                precio_min=Decimal(precio_min),
                precio_max=Decimal(precio_max),
            )
            for gb, precio_min, precio_max in capacidades
        ])

        PrecioServicio.objects.filter(modelo=modelo).delete()
        precios_service = zip(TIPOS_SERVICIO, (bateria, modulo, tapa))
        PrecioServicio.objects.bulk_create([
            PrecioServicio(modelo=modelo, tipo=tipos[tipo], precio=Decimal(precio))
            for tipo, precio in precios_service
            if precio is not None
        ])


def revertir(apps, schema_editor):
    ModeloEquipo = apps.get_model('cotizaciones', 'ModeloEquipo')
    TipoServicio = apps.get_model('cotizaciones', 'TipoServicio')
    # Borrado fisico (el on_delete=CASCADE arrastra cotizaciones y precios).
    ModeloEquipo.objects.filter(
        marca='iPhone', nombre__in=[m[0] for m in MODELOS],
    ).delete()
    TipoServicio.objects.filter(nombre__in=TIPOS_SERVICIO).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('cotizaciones', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
