"""Siembra la caja 'Principal' y la fila de configuracion con sus defaults.

Asi el modulo funciona de entrada: hay una caja lista para abrir el primer
turno sin pasar por Configurar.
"""
from django.db import migrations


def sembrar(apps, schema_editor):
    Caja = apps.get_model('caja', 'Caja')
    ConfiguracionCaja = apps.get_model('caja', 'ConfiguracionCaja')
    if not Caja.objects.exists():
        Caja.objects.create(nombre='Principal', orden=1, activa=True)
    if not ConfiguracionCaja.objects.exists():
        ConfiguracionCaja.objects.create(pk=1)


def revertir(apps, schema_editor):
    Caja = apps.get_model('caja', 'Caja')
    Caja.objects.filter(nombre='Principal', sesiones__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [('caja', '0001_initial')]
    operations = [migrations.RunPython(sembrar, revertir)]
