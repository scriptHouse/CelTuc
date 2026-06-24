"""Agrega el permiso del modulo "Simulador de tarjetas" al catalogo.

Sigue el patron de 0004_seed_roles: cada permiso se siembra por migracion y se
mapea a un modulo del sidebar en el frontend. Tambien se lo concede al rol base
"Empleado" (que arranca viendo todos los modulos; el admin lo ajusta despues).

Es independiente del esquema de la app `simulador`, asi que se puede aplicar
aunque las tablas del simulador todavia no existan.
"""
from django.db import migrations


PERMISO = (
    'ver_simulador',
    'Ver Simulador de tarjetas',
    'Acceso al simulador de cuotas con tarjeta.',
    5,
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
        ('usuarios', '0005_usuario_ultima_actividad'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
