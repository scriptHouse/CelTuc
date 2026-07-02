"""Agrega el permiso del modulo "Cotizaciones" al catalogo.

Sigue el patron de 0006_seed_permiso_simulador: cada permiso se siembra por
migracion y se mapea a un modulo del sidebar en el frontend. Tambien se lo
concede al rol base "Empleado" (que arranca viendo todos los modulos; el admin
lo ajusta despues).

Es independiente del esquema de la app `cotizaciones`, asi que se puede aplicar
aunque las tablas de cotizaciones todavia no existan.
"""
from django.db import migrations


PERMISO = (
    'ver_cotizaciones',
    'Ver Cotizaciones',
    'Acceso a las cotizaciones de equipos usados y precios de service.',
    6,
)


def sembrar(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Rol = apps.get_model('usuarios', 'Rol')

    codigo, nombre, descripcion, orden = PERMISO
    permiso, _ = Permiso.objects.update_or_create(
        codigo=codigo,
        defaults={'nombre': nombre, 'descripcion': descripcion, 'orden': orden},
    )

    empleado = Rol.objects.filter(nombre__iexact='Empleado').first()
    if empleado:
        empleado.permisos.add(permiso)


def revertir(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Permiso.objects.filter(codigo=PERMISO[0]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0007_permiso_actualizado_permiso_actualizado_por_and_more'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
