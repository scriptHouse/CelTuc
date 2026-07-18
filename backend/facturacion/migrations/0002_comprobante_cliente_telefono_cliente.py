# Generated for CelTuc: teléfono del cliente en el comprobante + base de clientes.

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("facturacion", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="comprobante",
            name="cliente_telefono",
            field=models.CharField(
                blank=True, max_length=30, verbose_name="telefono del cliente"
            ),
        ),
        migrations.CreateModel(
            name="Cliente",
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
                (
                    "nombre",
                    models.CharField(max_length=160, verbose_name="nombre / razon social"),
                ),
                (
                    "doc_tipo",
                    models.CharField(
                        choices=[
                            ("CUIT", "CUIT"),
                            ("CUIL", "CUIL"),
                            ("DNI", "DNI"),
                            ("CF", "Consumidor Final"),
                        ],
                        default="CF",
                        max_length=4,
                        verbose_name="tipo de documento",
                    ),
                ),
                (
                    "doc_numero",
                    models.CharField(
                        blank=True, max_length=11, verbose_name="numero de documento"
                    ),
                ),
                (
                    "condicion",
                    models.CharField(
                        choices=[
                            ("responsable_inscripto", "Responsable Inscripto"),
                            ("monotributista", "Monotributista"),
                            ("consumidor_final", "Consumidor Final"),
                            ("exento", "Exento"),
                        ],
                        default="consumidor_final",
                        max_length=30,
                        verbose_name="condicion fiscal",
                    ),
                ),
                (
                    "telefono",
                    models.CharField(blank=True, max_length=30, verbose_name="telefono"),
                ),
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
                "verbose_name": "cliente",
                "verbose_name_plural": "clientes",
                "db_table": "facturacion_clientes",
                "ordering": ("nombre",),
            },
        ),
        migrations.AddConstraint(
            model_name="cliente",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("borrado", False),
                    models.Q(("doc_numero", ""), _negated=True),
                ),
                fields=("doc_numero",),
                name="uq_cliente_doc_vivo",
            ),
        ),
    ]
