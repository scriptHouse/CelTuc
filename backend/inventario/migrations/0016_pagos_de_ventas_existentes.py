# Las ventas que ya existen se cobraron con UN solo medio (`forma_pago`): se
# les crea su fila de pago para que el dato sea uniforme de aca en adelante
# (toda venta tiene al menos un `PagoVenta`). No toca la caja ni el stock:
# los movimientos de arqueo de esas ventas ya estan hechos.
from django.db import migrations


def crear_pagos_faltantes(apps, schema_editor):
    Venta = apps.get_model('inventario', 'Venta')
    PagoVenta = apps.get_model('inventario', 'PagoVenta')

    con_pago = set(PagoVenta.objects.values_list('venta_id', flat=True))
    faltantes = [
        PagoVenta(venta_id=venta.pk, medio=venta.forma_pago, monto=venta.total or 0)
        for venta in Venta.objects.exclude(pk__in=con_pago).only('pk', 'forma_pago', 'total')
        if (venta.total or 0) > 0
    ]
    PagoVenta.objects.bulk_create(faltantes, batch_size=500)


def borrar_pagos(apps, schema_editor):
    """Al revertir se van las filas de pago; `forma_pago` nunca se toco."""
    apps.get_model('inventario', 'PagoVenta').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0015_pagoventa'),
    ]

    operations = [
        migrations.RunPython(crear_pagos_faltantes, borrar_pagos),
    ]
