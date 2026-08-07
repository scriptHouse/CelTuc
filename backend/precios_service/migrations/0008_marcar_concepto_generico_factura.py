# -*- coding: utf-8 -*-
"""Marca los repuestos que en la factura van con concepto generico.

Son las secciones de la planilla "Stock con Service" de la fila 292 para abajo
que viven en este catalogo: los REPUESTOS (bateria, placa, Face ID, camaras,
audio, tapa, modulo de Apple Watch, flex de carga, glass de camara, modulos).

Quedan afuera a proposito las secciones de MANO DE OBRA, que no estan en ese
tramo de la planilla y cuyo nombre si se puede detallar en una factura:
"Cambio de glass de pantalla", "Quitar mensaje pieza desconocida" y
"Reparaciones generales".

Se marca por SECCION y no por fila: el corte real es la seccion. Un item que se
agregue despues NO queda marcado solo; se marca desde el sistema.

Reversible: al revertir se desmarcan las mismas secciones.
"""
from django.db import migrations

SECCIONES = (
    'Baterías',
    'Reparación de placa',
    'Reparación de Face ID',
    'Cámara trasera',
    'Cámara selfie',
    'Audio oído',
    'Tapa trasera',
    'Módulo Apple Watch',
    'Flex de carga',
    'Glass de cámara',
    'Módulos',
)


def marcar(apps, schema_editor):
    ItemService = apps.get_model('precios_service', 'ItemService')
    ItemService.objects.filter(seccion__nombre__in=SECCIONES).update(
        concepto_generico_factura=True,
    )


def desmarcar(apps, schema_editor):
    ItemService = apps.get_model('precios_service', 'ItemService')
    ItemService.objects.filter(seccion__nombre__in=SECCIONES).update(
        concepto_generico_factura=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('precios_service', '0007_itemservice_concepto_generico_factura'),
    ]

    operations = [
        migrations.RunPython(marcar, desmarcar),
    ]
