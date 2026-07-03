"""Agrega el permiso del modulo "Precios de service" al catalogo.

Sigue el patron de 0006/0008: cada permiso se siembra por migracion y se mapea
a un modulo del sidebar en el frontend. Tambien se lo concede al rol base
"Empleado" (que arranca viendo todos los modulos; el admin lo ajusta despues).

Es independiente del esquema de la app `precios_service`, asi que se puede
aplicar aunque sus tablas todavia no existan.
"""
from django.db import migrations


PERMISO = (
    'ver_precios_service',
    'Ver Precios de service',
    'Acceso a la lista de precios del service tecnico.',
    7,
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
        ('usuarios', '0008_seed_permiso_cotizaciones'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
