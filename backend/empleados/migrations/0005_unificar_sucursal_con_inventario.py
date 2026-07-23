# -*- coding: utf-8 -*-
"""Los empleados pasan a usar la tabla única de sucursales (inventario).

`empleados.Sucursal` era una copia de los mismos locales que ya modelaba
`inventario.Sucursal`. La 0012 de inventario dejó esa tabla con los nombres
definitivos; acá se reapunta el FK de cada empleado según la correspondencia
de nombres y se elimina la tabla duplicada:

    YB         -> Solar YB
    La Salta   -> Salta
    Central YB -> Central YB

Una sucursal vieja que no esté en el mapa (creada a mano desde el panel) se
migra con su mismo nombre, creándola en inventario si no existe.
"""
from django.db import migrations, models
import django.db.models.deletion

MAPA_NOMBRES = {
    'YB': 'Solar YB',
    'La Salta': 'Salta',
    'Central YB': 'Central YB',
}


def mapear(apps, schema_editor):
    SucursalVieja = apps.get_model('empleados', 'Sucursal')
    SucursalInv = apps.get_model('inventario', 'Sucursal')
    Empleado = apps.get_model('empleados', 'Empleado')

    for vieja in SucursalVieja.objects.filter(borrado=False):
        nombre = MAPA_NOMBRES.get(vieja.nombre, vieja.nombre)
        inv = SucursalInv.objects.filter(nombre=nombre, borrado=False).first()
        if inv is None:
            tope = (
                SucursalInv.objects.filter(borrado=False)
                .aggregate(m=models.Max('orden'))['m']
                or 0
            )
            inv = SucursalInv.objects.create(
                nombre=nombre,
                codigo_postal=vieja.codigo_postal,
                orden=tope + 1,
                activa=vieja.activa,
            )
        Empleado.objects.filter(sucursal_id=vieja.pk).update(sucursal_nueva=inv.pk)


class Migration(migrations.Migration):

    dependencies = [
        ('empleados', '0004_seed_sucursales'),
        ('inventario', '0012_unificar_sucursales'),
    ]

    operations = [
        migrations.AddField(
            model_name='empleado',
            name='sucursal_nueva',
            field=models.ForeignKey(
                blank=True,
                help_text='Opcional: local al que pertenece el empleado.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='empleados',
                to='inventario.sucursal',
                verbose_name='sucursal',
            ),
        ),
        migrations.RunPython(mapear, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='empleado',
            name='sucursal',
        ),
        migrations.DeleteModel(
            name='Sucursal',
        ),
        migrations.RenameField(
            model_name='empleado',
            old_name='sucursal_nueva',
            new_name='sucursal',
        ),
    ]
