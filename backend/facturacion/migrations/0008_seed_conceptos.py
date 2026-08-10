# -*- coding: utf-8 -*-
"""Siembra el banco de conceptos y se trae el texto que estaba configurado.

Antes habia UN solo texto, guardado como preferencia global
(`facturacion.concepto_generico`). Ahora hay un banco de textos elegibles, asi
que:

- Se crea el concepto de fabrica y queda como PREDETERMINADO.
- Si alguien habia personalizado el texto y es distinto al de fabrica, se suma
  como un segundo concepto activo (y ese pasa a ser el predeterminado, que es lo
  que venia usandose): no se pierde lo que ya habian escrito.
- La preferencia vieja se borra: ya no la lee nadie.

Idempotente: si el banco ya tiene filas, no toca nada.
"""
from django.db import migrations

CLAVE_VIEJA = 'facturacion.concepto_generico'
TEXTO_FABRICA = 'Accesorios y repuestos para telefonía celular'


def sembrar(apps, schema_editor):
    ConceptoFactura = apps.get_model('facturacion', 'ConceptoFactura')
    if ConceptoFactura.objects.exists():
        return

    Preferencia = apps.get_model('comun', 'Preferencia')
    pref = Preferencia.objects.filter(clave=CLAVE_VIEJA).first()
    personalizado = (pref.valor if pref else '').strip()[:200]

    # El de fabrica siempre existe; si habia uno propio, ese manda.
    ConceptoFactura.objects.create(
        texto=TEXTO_FABRICA,
        predeterminado=not personalizado or personalizado == TEXTO_FABRICA,
        orden=0,
        activo=True,
    )
    if personalizado and personalizado != TEXTO_FABRICA:
        ConceptoFactura.objects.create(
            texto=personalizado, predeterminado=True, orden=1, activo=True,
        )
    Preferencia.objects.filter(clave=CLAVE_VIEJA).delete()


def revertir(apps, schema_editor):
    apps.get_model('facturacion', 'ConceptoFactura').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('facturacion', '0007_conceptofactura'),
        ('comun', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
