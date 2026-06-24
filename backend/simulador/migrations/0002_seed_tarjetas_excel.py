"""Importa las tarjetas y sus planes de cuotas desde la hoja "SIMULADOR TARJETAS".

Carga los datos tal cual estan en el Excel del negocio, usando los campos que ya
tiene el modelo (`Tarjeta` + `PlanCuota`). Todo queda 100 % editable despues desde
el panel "Configurar" del simulador (o el admin).

Mapeo de la hoja -> tarjetas:

EQUIPOS (iPhone, Samsung, Apple). La hoja tiene una sola columna de recargo:
  - "NARANJA, VISA y MASTERCARD BANCARIZADA":
      1=11 % · 2=20 % · 3=25 % · 6=35 % · 9=48 % · 12=60 %
      Z=25 % (3 cuotas) · 3 Sucredito=30 % (3 cuotas) · Prepaga=10 % (1 pago)

ACCESORIOS (accesorios y service tecnico). La hoja separa dos columnas:
  - "NO BANCARIZADA (Cabal, American, Visa, Master)"  -> columna NO BANCARIZADA:
      1=0 % · 2=0 % · 3=0 % · 6=15 % · 9=25 % · 12=35 %
      Z=0 % (3 cuotas) · 3 Sucredito=0 % (3 cuotas) · Prepaga=0 % (1 pago)
  - "NARANJA, VISA y MASTERCARD BANCARIZADA"          -> columna INTERES + IMPUESTOS:
      1=4,30 % · 2=18,80 % · 3=30,90 % · 6=45,70 % · 9=60,10 % · 12=60,10 %
    (En la hoja, la columna "INTERES" sin impuestos es 4,30 / 14,50 / 26,60 /
     41,40 / 55,80 / 55,80 %; se usa la de "INTERES + IMPUESTOS" porque es el
     costo final que paga el cliente. Editalo si preferis el otro valor.)

Idempotente: cada tarjeta se identifica por (nombre, categoria). Si ya existe, se
le reemplaza la tabla de planes con la del Excel; si no, se crea. Asi se puede
correr sin duplicar las tarjetas que ya hayas cargado a mano.
"""
from decimal import Decimal

from django.db import migrations


# (orden, etiqueta, cuotas, recargo %). El recargo se guarda como porcentaje
# (35 = 35 %), igual que espera el simulador: total = monto * (1 + interes / 100).
def _plan(orden, etiqueta, cuotas, interes):
    return {
        'orden': orden,
        'etiqueta': etiqueta,
        'cuotas': cuotas,
        'interes': Decimal(interes),
    }


TARJETAS = [
    {
        'nombre': 'NARANJA, VISA y MASTERCARD BANCARIZADA',
        'categoria': 'equipos',
        'descripcion': 'iPhone, Samsung y productos Apple. Tasas de la hoja SIMULADOR TARJETAS.',
        'planes': [
            _plan(0, '1 pago', 1, '11'),
            _plan(1, '2 cuotas', 2, '20'),
            _plan(2, '3 cuotas', 3, '25'),
            _plan(3, '6 cuotas', 6, '35'),
            _plan(4, '9 cuotas', 9, '48'),
            _plan(5, '12 cuotas', 12, '60'),
            _plan(6, 'Z', 3, '25'),
            _plan(7, '3 Sucredito', 3, '30'),
            _plan(8, 'Prepaga', 1, '10'),
        ],
    },
    {
        'nombre': 'NO BANCARIZADA (Cabal, American, Visa, Master)',
        'categoria': 'accesorios',
        'descripcion': 'Accesorios y service tecnico. Columna NO BANCARIZADA de la hoja.',
        'planes': [
            _plan(0, '1 pago', 1, '0'),
            _plan(1, '2 cuotas', 2, '0'),
            _plan(2, '3 cuotas', 3, '0'),
            _plan(3, '6 cuotas', 6, '15'),
            _plan(4, '9 cuotas', 9, '25'),
            _plan(5, '12 cuotas', 12, '35'),
            _plan(6, 'Z', 3, '0'),
            _plan(7, '3 Sucredito', 3, '0'),
            _plan(8, 'Prepaga', 1, '0'),
        ],
    },
    {
        'nombre': 'NARANJA, VISA y MASTERCARD BANCARIZADA',
        'categoria': 'accesorios',
        'descripcion': 'Accesorios y service tecnico. Columna INTERES + IMPUESTOS de la hoja.',
        'planes': [
            _plan(0, '1 pago', 1, '4.30'),
            _plan(1, '2 cuotas', 2, '18.80'),
            _plan(2, '3 cuotas', 3, '30.90'),
            _plan(3, '6 cuotas', 6, '45.70'),
            _plan(4, '9 cuotas', 9, '60.10'),
            _plan(5, '12 cuotas', 12, '60.10'),
        ],
    },
]


def sembrar(apps, schema_editor):
    Tarjeta = apps.get_model('simulador', 'Tarjeta')
    PlanCuota = apps.get_model('simulador', 'PlanCuota')

    for orden_tarjeta, data in enumerate(TARJETAS):
        # Buscar por (nombre, categoria) para no duplicar tarjetas ya cargadas.
        tarjeta = (
            Tarjeta.objects.filter(nombre=data['nombre'], categoria=data['categoria']).first()
        )
        if tarjeta is None:
            tarjeta = Tarjeta.objects.create(
                nombre=data['nombre'],
                categoria=data['categoria'],
                descripcion=data['descripcion'],
                orden=orden_tarjeta,
                activa=True,
            )
        else:
            tarjeta.descripcion = data['descripcion']
            tarjeta.orden = orden_tarjeta
            tarjeta.activa = True
            tarjeta.save()

        # Reemplazar la tabla de planes con la del Excel (borrado fisico de los viejos).
        tarjeta.planes.all().delete()
        PlanCuota.objects.bulk_create([
            PlanCuota(
                tarjeta=tarjeta,
                etiqueta=plan['etiqueta'],
                cuotas=plan['cuotas'],
                interes=plan['interes'],
                orden=plan['orden'],
                activo=True,
            )
            for plan in data['planes']
        ])


def revertir(apps, schema_editor):
    Tarjeta = apps.get_model('simulador', 'Tarjeta')
    for data in TARJETAS:
        # Borrado fisico (el on_delete=CASCADE elimina tambien sus planes).
        Tarjeta.objects.filter(nombre=data['nombre'], categoria=data['categoria']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('simulador', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
