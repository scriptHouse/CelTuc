"""El semáforo del calendario mensual: qué hace verde, amarillo o rojo a un día.

La regla que más importa es la del rojo: se esperaba gente y **no fichó nadie**.
En una sucursal eso casi nunca significa que faltó todo el equipo — significa
que el reloj dejó de sincronizar y nadie se enteró. Por eso tiene un color
propio y no se mezcla con «hubo ausencias».

El color viaja siempre acompañado de un ícono y una etiqueta en la interfaz:
rojo y verde son justo el par que no distingue el daltonismo más común, así que
el color no puede ser lo único que lleva el dato.
"""
from datetime import date, datetime, time, timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from empleados.models import Empleado
from inventario.models import Sucursal
from usuarios.models import Usuario

from .models import (
    AsignacionTurno,
    Dispositivo,
    EstadoInconsistencia,
    EstadoMapeo,
    Feriado,
    Fichada,
    JustificacionInconsistencia,
    TipoFeriado,
    TipoInconsistencia,
    TramoTurno,
    Turno,
    hash_evento,
)

# Un lunes, bien lejos de hoy para que nunca caiga en el futuro.
LUNES = date(2026, 8, 17)
MARTES = LUNES + timedelta(days=1)
MIERCOLES = LUNES + timedelta(days=2)


class _BaseCalendario:
    """Escenario compartido: una sucursal, dos empleados y un turno de lunes a viernes."""

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.reloj = Dispositivo.objects.create(
            sucursal=self.sucursal, nombre='Reloj Salta', host='192.168.1.31'
        )

        turno = Turno.objects.create(nombre='Comercio', tolerancia_entrada=10)
        for dia in range(5):  # lunes a viernes
            TramoTurno.objects.create(
                turno=turno, indice_dia=dia,
                hora_entrada=time(9, 0), hora_salida=time(18, 0),
            )

        self.ana = Empleado.objects.create(nombre='Ana', sucursal=self.sucursal)
        self.beto = Empleado.objects.create(nombre='Beto', sucursal=self.sucursal)
        for empleado in (self.ana, self.beto):
            AsignacionTurno.objects.create(
                empleado=empleado, turno=turno, desde=date(2026, 1, 1)
            )

    # --- Utilidades --------------------------------------------------------

    def _fichar(self, empleado, dia, hora, minuto=0):
        momento = timezone.make_aware(datetime.combine(dia, time(hora, minuto)))
        Fichada.objects.create(
            dispositivo=self.reloj, empleado=empleado,
            estado_mapeo=EstadoMapeo.MAPEADA, numero_reloj=empleado.nombre,
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                self.reloj.id, '', empleado.nombre, momento, 'unknown', 'multiple'
            ),
        )

    def _jornada_perfecta(self, empleado, dia):
        self._fichar(empleado, dia, 9, 2)
        self._fichar(empleado, dia, 18, 1)

    def _calendario(self, mes='2026-08', **extra):
        params = {'mes': mes}
        params.update(extra)
        return self.cliente.get(reverse('asistencia:calendario'), params)

    def _dia(self, respuesta, fecha):
        return next(d for d in respuesta.data['dias'] if d['fecha'] == fecha.isoformat())


class CalendarioMensualTests(_BaseCalendario, TestCase):
    # --- El semáforo -------------------------------------------------------

    def test_todos_presentes_y_sin_novedades_es_verde(self):
        self._jornada_perfecta(self.ana, LUNES)
        self._jornada_perfecta(self.beto, LUNES)

        dia = self._dia(self._calendario(), LUNES)

        self.assertEqual(dia['estado'], 'verde')
        self.assertEqual(dia['presentes'], 2)
        self.assertEqual(dia['ausentes'], 0)
        self.assertEqual(dia['con_novedad'], 0)

    def test_nadie_ficho_es_rojo(self):
        """Se esperaba al equipo y no marcó nadie: el caso más grave."""
        dia = self._dia(self._calendario(), LUNES)

        self.assertEqual(dia['estado'], 'rojo')
        self.assertEqual(dia['esperados'], 2)
        self.assertEqual(dia['presentes'], 0)

    def test_una_ausencia_con_el_resto_presente_es_amarillo(self):
        self._jornada_perfecta(self.ana, LUNES)

        dia = self._dia(self._calendario(), LUNES)

        self.assertEqual(dia['estado'], 'amarillo')
        self.assertEqual(dia['presentes'], 1)
        self.assertEqual(dia['ausentes'], 1)

    def test_una_inconsistencia_pone_el_dia_en_amarillo(self):
        self._fichar(self.ana, LUNES, 9, 45)  # llegó tarde
        self._fichar(self.ana, LUNES, 18)
        self._jornada_perfecta(self.beto, LUNES)

        dia = self._dia(self._calendario(), LUNES)

        self.assertEqual(dia['estado'], 'amarillo')
        self.assertEqual(dia['presentes'], 2)
        self.assertEqual(dia['ausentes'], 0)
        self.assertEqual(dia['con_novedad'], 1)

    def test_una_inconsistencia_justificada_no_ensucia_el_dia(self):
        """Para eso sirve justificar: el día vuelve a estar en orden."""
        self._fichar(self.ana, LUNES, 9, 45)
        self._fichar(self.ana, LUNES, 18)
        self._jornada_perfecta(self.beto, LUNES)
        JustificacionInconsistencia.objects.create(
            empleado=self.ana, fecha=LUNES, tipo=TipoInconsistencia.LLEGADA_TARDE,
            estado=EstadoInconsistencia.JUSTIFICADA, motivo='Corte de calle',
        )

        dia = self._dia(self._calendario(), LUNES)

        self.assertEqual(dia['estado'], 'verde')
        self.assertEqual(dia['con_novedad'], 0)
        self.assertEqual(dia['inconsistencias'], 1, 'la novedad se sigue informando')

    def test_un_domingo_sin_turno_no_es_rojo(self):
        """Nadie esperado y nadie fichó: el día no tiene nada que decir."""
        domingo = LUNES - timedelta(days=1)

        dia = self._dia(self._calendario(), domingo)

        self.assertEqual(dia['estado'], 'sin_actividad')
        self.assertEqual(dia['esperados'], 0)

    def test_los_dias_que_no_pasaron_no_se_juzgan(self):
        hoy = timezone.localtime().date()
        futuro = hoy + timedelta(days=1)

        respuesta = self._calendario(mes=f'{futuro.year:04d}-{futuro.month:02d}')
        dia = self._dia(respuesta, futuro)

        self.assertEqual(dia['estado'], 'futuro')

    def test_el_feriado_se_informa_en_el_dia(self):
        Feriado.objects.create(
            fecha=LUNES, nombre='Día de prueba', tipo=TipoFeriado.NACIONAL
        )

        dia = self._dia(self._calendario(), LUNES)

        self.assertIsNotNone(dia['feriado'])
        self.assertEqual(dia['feriado']['nombre'], 'Día de prueba')
        self.assertNotEqual(
            dia['estado'], 'rojo', 'un feriado sin fichadas no es una alarma'
        )

    # --- La forma de la respuesta -------------------------------------------

    def test_devuelve_el_mes_entero_dia_por_dia(self):
        respuesta = self._calendario()

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(len(respuesta.data['dias']), 31, 'agosto tiene 31 días')
        self.assertEqual(respuesta.data['dias'][0]['fecha'], '2026-08-01')
        self.assertEqual(respuesta.data['dias'][-1]['fecha'], '2026-08-31')

    def test_febrero_no_inventa_dias(self):
        respuesta = self._calendario(mes='2026-02')
        self.assertEqual(len(respuesta.data['dias']), 28)

    def test_sin_mes_devuelve_el_actual(self):
        hoy = timezone.localtime().date()
        respuesta = self.cliente.get(reverse('asistencia:calendario'))
        self.assertEqual(respuesta.data['mes'], f'{hoy.year:04d}-{hoy.month:02d}')

    def test_un_mes_mal_escrito_lo_dice(self):
        respuesta = self._calendario(mes='agosto')
        self.assertEqual(respuesta.status_code, 400)

    def test_marca_el_dia_de_hoy(self):
        hoy = timezone.localtime().date()
        respuesta = self._calendario(mes=f'{hoy.year:04d}-{hoy.month:02d}')
        dia = self._dia(respuesta, hoy)
        self.assertTrue(dia['es_hoy'])

    def test_el_resumen_del_mes_cuenta_los_colores(self):
        self._jornada_perfecta(self.ana, LUNES)
        self._jornada_perfecta(self.beto, LUNES)
        self._jornada_perfecta(self.ana, MARTES)  # Beto falta: amarillo

        resumen = self._calendario().data['resumen']

        self.assertEqual(resumen['perfectos'], 1)
        self.assertEqual(resumen['con_novedades'], 1)
        self.assertGreater(resumen['sin_marcaciones'], 0)

    def test_se_puede_filtrar_por_empleado(self):
        self._jornada_perfecta(self.ana, LUNES)

        dia = self._dia(self._calendario(empleado=self.ana.id), LUNES)

        self.assertEqual(dia['estado'], 'verde', 'la ausencia de Beto no es asunto de Ana')
        self.assertEqual(dia['esperados'], 1)

    def test_se_puede_filtrar_por_sucursal(self):
        otra = Sucursal.objects.get_or_create(nombre='Yerba Buena')[0]
        respuesta = self._calendario(sucursal=otra.id)

        dia = self._dia(respuesta, LUNES)
        self.assertEqual(dia['esperados'], 0, 'nadie trabaja en esa sucursal')

    def test_el_color_del_dia_coincide_con_lo_que_se_ve_al_abrirlo(self):
        """Salen del mismo cálculo: no pueden contradecirse."""
        self._fichar(self.ana, LUNES, 9, 45)
        self._fichar(self.ana, LUNES, 18)
        self._jornada_perfecta(self.beto, LUNES)

        dia = self._dia(self._calendario(), LUNES)
        detalle = self.cliente.get(reverse('asistencia:resumen'), {
            'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat(),
        }).data

        self.assertEqual(dia['estado'], 'amarillo')
        self.assertEqual(dia['presentes'], len(detalle['resultados']))
        self.assertEqual(dia['pendientes'], detalle['resumen']['pendientes'])

    def test_solo_superadmin(self):
        admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)
        self.assertEqual(
            cliente.get(reverse('asistencia:calendario')).status_code, 403
        )


class ComposicionDelDiaTests(_BaseCalendario, TestCase):
    """La barra del calendario muestra la composición del día: tiene que cerrar.

    Si una misma persona contara a la vez como ausente y como «con novedad» —su
    ausencia genera su propia inconsistencia— la barra pasaría del 100 % y el
    día se dibujaría desbordado.
    """

    def _partes_cierran(self, dia):
        bien = dia['presentes'] - dia['con_novedad']
        return bien >= 0 and bien + dia['con_novedad'] + dia['ausentes'] == dia['esperados']

    def test_con_ausencias_y_novedades_las_partes_suman_el_total(self):
        self._jornada_perfecta(self.ana, LUNES)
        self._fichar(self.beto, LUNES, 9, 50)  # presente pero tarde
        self._fichar(self.beto, LUNES, 18)

        dia = self._dia(self._calendario(), LUNES)

        self.assertTrue(self._partes_cierran(dia), dia)
        self.assertEqual(dia['con_novedad'], 1)

    def test_un_dia_sin_nadie_no_cuenta_dos_veces_a_los_ausentes(self):
        """El caso que rompía la barra: todos ausentes."""
        dia = self._dia(self._calendario(), LUNES)

        self.assertEqual(dia['ausentes'], 2)
        self.assertEqual(dia['con_novedad'], 0, 'la ausencia ya se cuenta como ausencia')
        self.assertTrue(self._partes_cierran(dia), dia)

    def test_todos_los_dias_del_mes_cierran(self):
        self._jornada_perfecta(self.ana, LUNES)
        self._fichar(self.beto, LUNES, 9, 50)
        self._fichar(self.beto, LUNES, 18)
        self._fichar(self.ana, MARTES, 9)  # se olvidó de marcar la salida

        for dia in self._calendario().data['dias']:
            self.assertTrue(self._partes_cierran(dia), f'no cierra: {dia}')
