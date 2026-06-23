# Simplifica el Usuario a email + nombre de usuario + contrasena.
# El 0001 ya esta aplicado en produccion (tabla vacia), asi que esta migracion
# transforma el esquema hacia adelante en vez de reescribir el 0001.
import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0001_initial'),
    ]

    operations = [
        migrations.RemoveField(model_name='usuario', name='nombre'),
        migrations.RemoveField(model_name='usuario', name='apellido'),
        migrations.RemoveField(model_name='usuario', name='documento'),
        migrations.RemoveField(model_name='usuario', name='telefono'),
        migrations.RemoveField(model_name='usuario', name='rol'),
        migrations.RemoveField(model_name='usuario', name='updated_at'),
        migrations.AddField(
            model_name='usuario',
            name='username',
            field=models.CharField(
                default='',
                help_text='Entre 3 y 30 caracteres: letras, numeros y . _ -',
                max_length=30,
                unique=True,
                validators=[
                    django.core.validators.MinLengthValidator(3),
                    django.core.validators.RegexValidator(
                        message='El nombre de usuario solo puede tener letras, numeros y los signos . _ -',
                        regex='^[a-zA-Z0-9._-]+$',
                    ),
                ],
                verbose_name='nombre de usuario',
            ),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name='usuario',
            options={
                'ordering': ('username',),
                'verbose_name': 'usuario',
                'verbose_name_plural': 'usuarios',
            },
        ),
    ]
