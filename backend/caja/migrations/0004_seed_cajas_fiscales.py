# Siembra las dos cajas fiscales pedidas por Isaias (jul-2026): la plata
# facturada con el Responsable Inscripto va a su propia caja y el resto
# (Factura C de monotributo o sin factura) a la general. Tambien prende
# multi-caja para que las dos pestanias aparezcan en /caja.
#
# La caja "Principal" sembrada en 0002 se convierte en la general (mismo id:
# sus turnos y cierres historicos siguen colgando de ella; los Z viejos ya
# guardan el nombre al momento del cierre, asi que el renombre no los toca).
from django.db import migrations

NOMBRE_RI = 'Facturación RI'
NOMBRE_GENERAL = 'Monotributo y sin factura'


def _asegurar_caja(Caja, *, canal, nombre, orden, preferida=None):
    """Deja exactamente una caja viva con ese canal, reusando la preferida."""
    vivas = Caja.objects.filter(borrado=False)
    if vivas.filter(canal=canal).exists():
        return
    caja = preferida or vivas.filter(nombre__iexact=nombre).first()
    if caja is not None:
        caja.canal = canal
        caja.nombre = nombre
        caja.orden = orden
        caja.save(update_fields=['canal', 'nombre', 'orden'])
    else:
        Caja.objects.create(nombre=nombre, canal=canal, orden=orden, activa=True)


def crear_cajas_fiscales(apps, schema_editor):
    Caja = apps.get_model('caja', 'Caja')
    ConfiguracionCaja = apps.get_model('caja', 'ConfiguracionCaja')

    principal = Caja.objects.filter(borrado=False, canal='', nombre='Principal').first()
    _asegurar_caja(Caja, canal='general', nombre=NOMBRE_GENERAL, orden=1, preferida=principal)
    _asegurar_caja(Caja, canal='factura_ri', nombre=NOMBRE_RI, orden=0)

    config, _ = ConfiguracionCaja.objects.get_or_create(pk=1)
    if not config.multi_caja:
        config.multi_caja = True
        config.save(update_fields=['multi_caja'])


def revertir(apps, schema_editor):
    """No se borran cajas al revertir: pueden tener turnos y cierres reales."""


class Migration(migrations.Migration):

    dependencies = [
        ('caja', '0003_caja_canal_caja_uq_canal_caja_viva'),
    ]

    operations = [
        migrations.RunPython(crear_cajas_fiscales, revertir),
    ]
