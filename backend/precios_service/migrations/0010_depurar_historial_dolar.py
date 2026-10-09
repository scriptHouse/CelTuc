"""Depura el historial del dolar: filas duplicadas por una condicion de carrera.

Antes de que `registrar_cambio_dolar` bloqueara la fila de configuracion, dos
peticiones simultaneas (varios workers de gunicorn) podian calcular el mismo
dolar automatico y registrarlo las dos: quedaban dos filas con el mismo valor
y el mismo instante, a veces las dos «vigente ahora». Aca se funden: la
primera absorbe la vigencia de la repetida y la repetida se borra. Ademas se
encadenan las vigencias (cada fila termina donde empieza la siguiente) y
queda UNA sola fila abierta: la ultima.
"""
import datetime

from django.db import migrations

# Dos filas con el mismo valor separadas por menos de esto son la misma
# decision registrada dos veces, no dos cambios reales.
VENTANA_DUPLICADO = datetime.timedelta(seconds=30)


def depurar_historial(apps, schema_editor):
    HistorialDolar = apps.get_model('precios_service', 'HistorialDolar')
    filas = list(HistorialDolar.objects.order_by('vigente_desde', 'id'))
    previa = None
    for fila in filas:
        if (
            previa is not None
            and fila.valor == previa.valor
            and fila.vigente_desde - previa.vigente_desde <= VENTANA_DUPLICADO
        ):
            # Repetida: la anterior se queda con la vigencia de esta.
            previa.vigente_hasta = fila.vigente_hasta
            previa.save(update_fields=['vigente_hasta'])
            fila.delete()
            continue
        if previa is not None and (
            previa.vigente_hasta is None or previa.vigente_hasta != fila.vigente_desde
        ):
            previa.vigente_hasta = fila.vigente_desde
            previa.save(update_fields=['vigente_hasta'])
        if previa is not None and fila.valor_anterior != previa.valor:
            fila.valor_anterior = previa.valor
            fila.save(update_fields=['valor_anterior'])
        previa = fila
    if previa is not None and previa.vigente_hasta is not None:
        previa.vigente_hasta = None
        previa.save(update_fields=['vigente_hasta'])


class Migration(migrations.Migration):

    dependencies = [
        ('precios_service', '0009_dolar_automatico_e_historial'),
    ]

    operations = [
        migrations.RunPython(depurar_historial, migrations.RunPython.noop),
    ]
