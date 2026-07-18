# Generated for CelTuc: sucursal simple (nombre + codigo postal + estado) y
# vinculo opcional del empleado con su sucursal.

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("empleados", "0002_empleado_actualizado_empleado_actualizado_por_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Sucursal",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "creado",
                    models.DateTimeField(
                        default=django.utils.timezone.now,
                        editable=False,
                        verbose_name="fecha de alta",
                    ),
                ),
                (
                    "actualizado",
                    models.DateTimeField(
                        default=django.utils.timezone.now,
                        editable=False,
                        verbose_name="ultima edicion",
                    ),
                ),
                (
                    "borrado",
                    models.BooleanField(
                        db_index=True, default=False, verbose_name="borrado"
                    ),
                ),
                (
                    "fecha_borrado",
                    models.DateTimeField(
                        blank=True, null=True, verbose_name="fecha de borrado"
                    ),
                ),
                ("nombre", models.CharField(max_length=120, verbose_name="nombre")),
                (
                    "codigo_postal",
                    models.CharField(
                        blank=True, max_length=10, verbose_name="codigo postal"
                    ),
                ),
                ("activa", models.BooleanField(default=True, verbose_name="activa")),
                (
                    "actualizado_por",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="ultima edicion por",
                    ),
                ),
                (
                    "borrado_por",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="borrado por",
                    ),
                ),
                (
                    "creado_por",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="creado por",
                    ),
                ),
            ],
            options={
                "verbose_name": "sucursal",
                "verbose_name_plural": "sucursales",
                "db_table": "empleados_sucursales",
                "ordering": ("nombre",),
            },
        ),
        migrations.AddField(
            model_name="empleado",
            name="sucursal",
            field=models.ForeignKey(
                blank=True,
                help_text="Opcional: local al que pertenece el empleado.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="empleados",
                to="empleados.sucursal",
                verbose_name="sucursal",
            ),
        ),
        migrations.AddConstraint(
            model_name="sucursal",
            constraint=models.UniqueConstraint(
                condition=models.Q(("borrado", False)),
                fields=("nombre",),
                name="uq_empleado_sucursal_viva",
            ),
        ),
    ]
