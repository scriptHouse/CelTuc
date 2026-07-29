# Los pagos creados antes de que existiera `PagoVenta.facturacion` quedaron con
# el default ('sin_factura'): cada uno hereda la facturacion de SU venta, que es
# como se cobraron (una sola facturacion por venta hasta ahora). Sin esto, una
# venta vieja facturada con el RI figuraria como sin factura en su cobro.
from django.db import migrations


def heredar_facturacion_de_la_venta(apps, schema_editor):
    PagoVenta = apps.get_model('inventario', 'PagoVenta')
    Venta = apps.get_model('inventario', 'Venta')

    for facturacion in Venta.objects.values_list('facturacion', flat=True).distinct():
        if not facturacion:
            continue
        PagoVenta.objects.filter(venta__facturacion=facturacion).update(facturacion=facturacion)


def revertir(apps, schema_editor):
    """Nada que revertir: el campo se va con la migracion de esquema."""


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0017_pagoventa_facturacion'),
    ]

    operations = [
        migrations.RunPython(heredar_facturacion_de_la_venta, revertir),
    ]
