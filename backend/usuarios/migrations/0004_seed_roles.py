"""Siembra el catalogo de permisos y los roles base, y migra las cuentas.

- Permisos: uno por cada modulo del sidebar.
- Roles del sistema: "Administrador" (acceso total) y "Empleado" (arranca con
  acceso a todos los modulos; el admin lo ajusta despues).
- Cuentas existentes: el staff (no superusuario) pasa a "Administrador"; el resto
  de las cuentas, a "Empleado". El superusuario no necesita rol (ya puede todo).
"""
from django.db import migrations


PERMISOS = [
    ('ver_panel', 'Ver Panel', 'Acceso al tablero principal.', 1),
    ('ver_inventario', 'Ver Inventario', 'Acceso al modulo de inventario.', 2),
    ('ver_facturacion', 'Ver Facturacion', 'Acceso al modulo de facturacion.', 3),
    ('ver_empleados', 'Ver Empleados', 'Acceso al modulo de empleados.', 4),
]


def sembrar(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Rol = apps.get_model('usuarios', 'Rol')
    Usuario = apps.get_model('usuarios', 'Usuario')

    permisos = {}
    for codigo, nombre, descripcion, orden in PERMISOS:
        permiso, _ = Permiso.objects.update_or_create(
            codigo=codigo,
            defaults={'nombre': nombre, 'descripcion': descripcion, 'orden': orden},
        )
        permisos[codigo] = permiso

    admin_rol, _ = Rol.objects.update_or_create(
        nombre='Administrador',
        defaults={
            'descripcion': 'Acceso total: gestiona roles, empleados y usuarios.',
            'es_admin': True,
            'es_sistema': True,
        },
    )

    empleado_rol, _ = Rol.objects.update_or_create(
        nombre='Empleado',
        defaults={
            'descripcion': 'Acceso a los modulos que defina el administrador.',
            'es_admin': False,
            'es_sistema': True,
        },
    )
    # Por defecto el rol Empleado ve todos los modulos (igual que antes de los
    # roles); el administrador puede restringirlo desde el panel.
    empleado_rol.permisos.set(permisos.values())

    # Migracion de las cuentas existentes al esquema de roles.
    for usuario in Usuario.objects.all():
        if usuario.is_superuser:
            continue  # el dueño ya puede todo sin rol
        if usuario.rol_id:
            continue  # respeta un rol ya asignado
        usuario.rol = admin_rol if usuario.is_staff else empleado_rol
        usuario.save(update_fields=['rol'])


def revertir(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Rol = apps.get_model('usuarios', 'Rol')
    Usuario = apps.get_model('usuarios', 'Usuario')

    Usuario.objects.update(rol=None)
    Rol.objects.filter(nombre__in=['Administrador', 'Empleado']).delete()
    Permiso.objects.filter(codigo__in=[p[0] for p in PERMISOS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0003_permiso_rol_usuario_rol'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
