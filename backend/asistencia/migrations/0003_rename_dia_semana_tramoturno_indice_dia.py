"""El indice del tramo deja de ser "dia de semana".

En un turno rotativo el patron no se repite por semana sino cada N dias, asi
que el campo pasa a ser la posicion dentro del patron: en un turno semanal
sigue siendo 0=lunes..6=domingo, y en uno rotativo es el dia del ciclo.

Va como RenameField (y no add+remove) para conservar los horarios ya cargados.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('asistencia', '0002_alter_mapeoempleado_options_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='tramoturno',
            old_name='dia_semana',
            new_name='indice_dia',
        ),
    ]
