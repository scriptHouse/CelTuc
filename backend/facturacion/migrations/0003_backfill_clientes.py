# -*- coding: utf-8 -*-
"""Siembra la base de clientes con las facturas ya emitidas.

Toma los comprobantes existentes que tengan número de documento (los Consumidor
Final sin documento no se pueden identificar y no tenían teléfono cargado) y crea
un cliente por documento, con los datos del comprobante más reciente. Es
idempotente: no duplica documentos ya cargados.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Comprobante = apps.get_model("facturacion", "Comprobante")
    Cliente = apps.get_model("facturacion", "Cliente")

    vistos = set(
        Cliente.objects.exclude(doc_numero="").values_list("doc_numero", flat=True)
    )
    comprobantes = (
        Comprobante.objects.filter(borrado=False)
        .exclude(cliente_doc_numero="")
        .order_by("-fecha", "-numero", "-id")
    )
    nuevos = []
    for c in comprobantes:
        doc = (c.cliente_doc_numero or "").strip()
        if not doc or doc in vistos:
            continue
        vistos.add(doc)
        nuevos.append(
            Cliente(
                nombre=c.cliente_nombre,
                doc_tipo=c.cliente_doc_tipo,
                doc_numero=doc,
                condicion=c.cliente_condicion,
                telefono=(getattr(c, "cliente_telefono", "") or ""),
            )
        )
    if nuevos:
        Cliente.objects.bulk_create(nuevos)


class Migration(migrations.Migration):

    dependencies = [
        ("facturacion", "0002_comprobante_cliente_telefono_cliente"),
    ]

    operations = [
        # Reversa no-op: al revertir no borramos clientes (podrían tener datos
        # nuevos cargados desde que se sembraron).
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
