"""Deja el catálogo de inconsistencias cargado y visible desde el día uno.

Sin esto, la pantalla de reglas arranca vacía y no hay forma de saber qué se
puede configurar. Los valores son los recomendados del catálogo, y están
elegidos para NO cambiar el comportamiento anterior: llegada tarde y salida
temprana quedan con umbral vacío, o sea siguen usando la tolerancia de cada
turno, tal como venía funcionando.
"""
from django.db import migrations


def sembrar(apps, schema_editor):
    from asistencia.models import CATALOGO_INCONSISTENCIAS

    Regla = apps.get_model('asistencia', 'ReglaInconsistencia')
    existentes = set(
        Regla.objects.filter(turno__isnull=True).values_list('tipo', flat=True)
    )
    Regla.objects.bulk_create([
        Regla(
            tipo=tipo,
            activa=cfg['activa'],
            umbral_minutos=cfg['defecto'],
            severidad=cfg['severidad'],
            requiere_justificacion=cfg['justificar'],
        )
        for tipo, cfg in CATALOGO_INCONSISTENCIAS.items()
        if tipo not in existentes
    ])


def borrar(apps, schema_editor):
    Regla = apps.get_model('asistencia', 'ReglaInconsistencia')
    Regla.objects.filter(turno__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('asistencia', '0006_justificacioninconsistencia_reglainconsistencia'),
    ]

    operations = [migrations.RunPython(sembrar, borrar)]
