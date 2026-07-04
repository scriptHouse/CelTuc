"""Vincula cada ModeloEquipo con su Dispositivo del catalogo unico de equipos.

El puente se arma por nombre: "iPhone" + "13 Pro" -> Dispositivo "iPhone 13 Pro".
No cambia nada del comportamiento de Cotizaciones; solo agrega la referencia
que usa la Ficha de equipo para cruzar toma + service + venta.

Idempotente: solo completa los que esten sin vincular y tengan match exacto
(case-insensitive). Los que no matcheen quedan en NULL, sin romper nada.
"""
from django.db import migrations


def vincular(apps, schema_editor):
    ModeloEquipo = apps.get_model('cotizaciones', 'ModeloEquipo')
    Dispositivo = apps.get_model('precios_service', 'Dispositivo')

    for modelo in ModeloEquipo.objects.filter(dispositivo__isnull=True):
        nombre_completo = f'{modelo.marca} {modelo.nombre}'.strip()
        dispositivo = Dispositivo.objects.filter(
            nombre__iexact=nombre_completo, borrado=False,
        ).first()
        if dispositivo is not None:
            modelo.dispositivo = dispositivo
            modelo.save(update_fields=['dispositivo'])


def revertir(apps, schema_editor):
    ModeloEquipo = apps.get_model('cotizaciones', 'ModeloEquipo')
    ModeloEquipo.objects.update(dispositivo=None)


class Migration(migrations.Migration):

    dependencies = [
        ('cotizaciones', '0003_modeloequipo_dispositivo'),
        ('precios_service', '0004_seed_dispositivos_excel'),
    ]

    operations = [
        migrations.RunPython(vincular, revertir),
    ]
