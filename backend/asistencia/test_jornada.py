"""Tests del motor de jornada: tramos, salidas parciales, turnos y licencias.

El caso central es la salida parcial: alguien se va al médico y vuelve dentro
del mismo turno. Como el reloj real no clasifica entrada/salida, todo esto se
deriva alternando las fichadas del día.
"""
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from empleados.models import Empleado
from inventario.models import Sucursal
from usuarios.models import Usuario

from . import jornada as J
from .models import (
    AsignacionTurno,
    Dispositivo,
    EstadoMapeo,
    Fichada,
    Licencia,
    TipoLicencia,
    TramoTurno,
    Turno,
    hash_evento,
)

FECHA = date(2026, 8, 17)  # un lunes


def f(hora, minuto=0, segundo=0, tipo='unknown'):
    """Una fichada mínima: al motor solo le importan `ocurrida_en` y `tipo`."""
    momento = timezone.make_aware(datetime.combine(FECHA, time(hora, minuto, segundo)))
    return SimpleNamespace(ocurrida_en=momento, tipo=tipo)


def turno_de_prueba(entrada=time(9, 0), salida=time(18, 0), dias=(0,), **kwargs):
    turno = Turno.objects.create(nombre=kwargs.pop('nombre', 'Comercio'), **kwargs)
    for dia in dias:
        TramoTurno.objects.create(
            turno=turno, indice_dia=dia, hora_entrada=entrada, hora_salida=salida
        )
    return turno


class TramosYSalidasParcialesTests(TestCase):
    """El corazón: derivar presencia real alternando fichadas."""

    def test_jornada_simple(self):
        j = J.calcular(FECHA, [f(9), f(18)])
        self.assertEqual(len(j.tramos), 1)
        self.assertEqual(j.minutos_trabajados, 9 * 60)
        self.assertEqual(j.salidas_parciales, [])

    def test_salida_parcial_al_medico(self):
        """09:00 entra · 13:00 sale · 14:30 vuelve · 18:00 se va."""
        j = J.calcular(FECHA, [f(9), f(13), f(14, 30), f(18)])

        self.assertEqual(len(j.tramos), 2)
        self.assertEqual(j.tramos[0].minutos, 4 * 60)      # 09:00-13:00
        self.assertEqual(j.tramos[1].minutos, 3 * 60 + 30)  # 14:30-18:00
        self.assertEqual(j.minutos_trabajados, 7 * 60 + 30)

        self.assertEqual(len(j.salidas_parciales), 1)
        self.assertEqual(j.salidas_parciales[0].minutos, 90)
        self.assertEqual(j.minutos_fuera, 90)

        # La jornada sigue yendo de la primera entrada a la última salida.
        self.assertEqual(timezone.localtime(j.primera).hour, 9)
        self.assertEqual(timezone.localtime(j.ultima).hour, 18)

    def test_dos_salidas_parciales(self):
        j = J.calcular(FECHA, [f(9), f(11), f(11, 30), f(15), f(16), f(19)])
        self.assertEqual(len(j.tramos), 3)
        self.assertEqual(len(j.salidas_parciales), 2)
        self.assertEqual(j.minutos_fuera, 30 + 60)
        self.assertEqual(j.minutos_trabajados, 120 + 210 + 180)

    def test_se_olvido_de_fichar_la_salida(self):
        j = J.calcular(FECHA, [f(9)], turno=turno_de_prueba())
        self.assertEqual(len(j.tramos), 1)
        self.assertTrue(j.tramos[0].abierto)
        self.assertEqual(j.minutos_trabajados, 0)
        self.assertEqual(j.estado, J.EstadoJornada.INCOMPLETA)

    def test_antirebote_colapsa_la_doble_lectura(self):
        """Dos lecturas del mismo rostro en segundos no pueden invertir el día."""
        fichadas = [f(9), f(9, 0, 20), f(18)]
        j = J.calcular(FECHA, fichadas, turno=turno_de_prueba())
        self.assertEqual(j.fichadas, 2)          # la relectura se descartó
        self.assertEqual(len(j.tramos), 1)
        self.assertEqual(j.minutos_trabajados, 9 * 60)
        self.assertEqual(j.estado, J.EstadoJornada.OK)

    def test_sin_antirebote_la_relectura_rompe_la_paridad(self):
        """Prueba de contraste: por eso existe el anti-rebote."""
        tramos = J.armar_tramos([f(9), f(9, 0, 20), f(18)])
        self.assertEqual(len(tramos), 2)
        self.assertTrue(tramos[-1].abierto)

    def test_usa_el_tipo_real_del_reloj_si_lo_manda(self):
        """Si algún día se configura Hora y Asistencia, mandan esos valores."""
        j = J.calcular(FECHA, [
            f(9, tipo='check_in'),
            f(13, tipo='break_out'),
            f(14, tipo='break_in'),
            f(18, tipo='check_out'),
        ])
        self.assertEqual(len(j.tramos), 2)
        self.assertEqual(j.minutos_trabajados, 4 * 60 + 4 * 60)
        self.assertEqual(len(j.salidas_parciales), 1)


class TurnoYPuntualidadTests(TestCase):
    def test_llegada_puntual(self):
        j = J.calcular(FECHA, [f(9), f(18)], turno=turno_de_prueba())
        self.assertEqual(j.estado, J.EstadoJornada.OK)
        self.assertEqual(j.minutos_esperados, 9 * 60)
        self.assertEqual(j.horario_esperado, '09:00-18:00')

    def test_dentro_de_la_tolerancia_no_es_tarde(self):
        j = J.calcular(FECHA, [f(9, 8), f(18)], turno=turno_de_prueba())
        self.assertEqual(j.estado, J.EstadoJornada.OK)
        self.assertEqual(j.llegada_tarde_minutos, 0)

    def test_llego_tarde(self):
        j = J.calcular(FECHA, [f(9, 35), f(18)], turno=turno_de_prueba())
        self.assertEqual(j.estado, J.EstadoJornada.TARDE)
        self.assertEqual(j.llegada_tarde_minutos, 35)

    def test_se_retiro_antes(self):
        j = J.calcular(FECHA, [f(9), f(17)], turno=turno_de_prueba())
        self.assertEqual(j.estado, J.EstadoJornada.SALIDA_TEMPRANA)
        self.assertEqual(j.salida_temprana_minutos, 60)

    def test_jornada_partida_suma_los_dos_tramos(self):
        turno = Turno.objects.create(nombre='Partido')
        TramoTurno.objects.create(turno=turno, indice_dia=0,
                                  hora_entrada=time(9, 0), hora_salida=time(13, 0))
        TramoTurno.objects.create(turno=turno, indice_dia=0,
                                  hora_entrada=time(17, 0), hora_salida=time(21, 0))
        j = J.calcular(FECHA, [f(9), f(13), f(17), f(21)], turno=turno)
        self.assertEqual(j.minutos_esperados, 8 * 60)
        self.assertEqual(j.minutos_trabajados, 8 * 60)
        self.assertEqual(j.horario_esperado, '09:00-13:00 / 17:00-21:00')
        self.assertEqual(j.estado, J.EstadoJornada.OK)

    def test_ausente_cuando_habia_que_trabajar(self):
        j = J.calcular(FECHA, [], turno=turno_de_prueba())
        self.assertEqual(j.estado, J.EstadoJornada.AUSENTE)

    def test_dia_franco_no_es_ausencia(self):
        """El turno no tiene horario ese día de la semana."""
        turno = turno_de_prueba(dias=(5, 6))  # solo sábado y domingo
        j = J.calcular(FECHA, [], turno=turno)  # FECHA es lunes
        self.assertEqual(j.estado, J.EstadoJornada.NO_LABORABLE)

    def test_sin_turno_no_se_juzga(self):
        j = J.calcular(FECHA, [f(9), f(18)])
        self.assertEqual(j.estado, J.EstadoJornada.SIN_TURNO)
        self.assertEqual(j.minutos_trabajados, 9 * 60)


class LicenciaTests(TestCase):
    def setUp(self):
        self.empleado = Empleado.objects.create(nombre='Ana', apellido='Gómez')

    def test_licencia_gana_sobre_la_ausencia(self):
        licencia = Licencia.objects.create(
            empleado=self.empleado, tipo=TipoLicencia.VACACIONES,
            desde=FECHA, hasta=FECHA + timedelta(days=10),
        )
        j = J.calcular(FECHA, [], turno=turno_de_prueba(), licencia=licencia)
        self.assertEqual(j.estado, J.EstadoJornada.LICENCIA)
        self.assertEqual(j.licencia['tipo'], 'vacaciones')
        self.assertEqual(j.licencia['tipo_display'], 'Vacaciones')

    def test_licencia_cubre_el_rango_completo(self):
        licencia = Licencia.objects.create(
            empleado=self.empleado, tipo=TipoLicencia.ENFERMEDAD,
            desde=date(2026, 8, 10), hasta=date(2026, 8, 20),
        )
        self.assertTrue(licencia.cubre(date(2026, 8, 10)))
        self.assertTrue(licencia.cubre(date(2026, 8, 15)))
        self.assertTrue(licencia.cubre(date(2026, 8, 20)))
        self.assertFalse(licencia.cubre(date(2026, 8, 21)))
        self.assertEqual(licencia.dias, 11)


class ResumenAPITests(TestCase):
    """El endpoint completo, con datos reales en la base."""

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=sucursal, nombre='Reloj Salta', host='192.168.1.31'
        )
        self.empleado = Empleado.objects.create(nombre='Nacho', apellido='Pérez')
        self.turno = turno_de_prueba(dias=(0, 1, 2, 3, 4))
        AsignacionTurno.objects.create(
            empleado=self.empleado, turno=self.turno, desde=date(2026, 1, 1)
        )

    def _fichar(self, hora, minuto=0):
        momento = timezone.make_aware(datetime.combine(FECHA, time(hora, minuto)))
        return Fichada.objects.create(
            dispositivo=self.dispositivo,
            empleado=self.empleado,
            estado_mapeo=EstadoMapeo.MAPEADA,
            numero_reloj='Nacho',
            ocurrida_en=momento,
            tipo='unknown',
            metodo='multiple',
            hash_evento=hash_evento(self.dispositivo.id, '', 'Nacho', momento, 'unknown', 'multiple')
            + str(hora) + str(minuto),
        )

    def _resumen(self):
        return self.cliente.get(
            reverse('asistencia:resumen'),
            {'desde': FECHA.isoformat(), 'hasta': FECHA.isoformat()},
        )

    def test_resumen_muestra_la_salida_parcial(self):
        for hora, minuto in ((9, 0), (13, 0), (14, 30), (18, 0)):
            self._fichar(hora, minuto)

        respuesta = self._resumen()
        self.assertEqual(respuesta.status_code, 200)
        fila = respuesta.data['resultados'][0]

        self.assertEqual(fila['empleado']['nombre'], 'Nacho Pérez')
        self.assertEqual(fila['turno'], 'Comercio')
        self.assertEqual(fila['estado'], 'ok')
        self.assertEqual(len(fila['tramos']), 2)
        self.assertEqual(len(fila['salidas_parciales']), 1)
        self.assertEqual(fila['salidas_parciales'][0]['minutos'], 90)
        self.assertEqual(fila['minutos_trabajados'], 450)
        self.assertEqual(fila['minutos_esperados'], 540)
        self.assertEqual(respuesta.data['resumen']['con_salida_parcial'], 1)

    def test_resumen_genera_la_ausencia_sin_fichadas(self):
        """Nadie fichó: la fila igual aparece, porque tenía turno."""
        respuesta = self._resumen()
        fila = respuesta.data['resultados'][0]
        self.assertEqual(fila['estado'], 'ausente')
        self.assertEqual(fila['fichadas'], 0)
        self.assertEqual(respuesta.data['resumen']['por_estado'], {'ausente': 1})

    def test_resumen_marca_licencia_en_vez_de_ausencia(self):
        Licencia.objects.create(
            empleado=self.empleado, tipo=TipoLicencia.VACACIONES,
            desde=FECHA - timedelta(days=2), hasta=FECHA + timedelta(days=2),
        )
        fila = self._resumen().data['resultados'][0]
        self.assertEqual(fila['estado'], 'licencia')
        self.assertEqual(fila['licencia']['tipo_display'], 'Vacaciones')

    def test_solo_superadmin(self):
        admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)
        for nombre in ('asistencia:resumen', 'asistencia:turnos', 'asistencia:licencias',
                       'asistencia:asignaciones'):
            self.assertEqual(cliente.get(reverse(nombre)).status_code, 403, nombre)


class TurnosYLicenciasAPITests(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)
        self.empleado = Empleado.objects.create(nombre='Agus', apellido='López')

    def test_crear_turno_con_su_semana(self):
        respuesta = self.cliente.post(reverse('asistencia:turnos'), {
            'nombre': 'Comercio 9 a 18',
            'tramos': [
                {'indice_dia': d, 'hora_entrada': '09:00', 'hora_salida': '18:00'}
                for d in range(5)
            ],
        }, format='json')
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(len(respuesta.data['tramos']), 5)
        self.assertEqual(respuesta.data['minutos_semanales'], 5 * 9 * 60)

    def test_editar_turno_reemplaza_los_horarios(self):
        turno = turno_de_prueba(dias=(0, 1, 2, 3, 4))
        respuesta = self.cliente.patch(
            reverse('asistencia:turno', args=[turno.id]),
            {'tramos': [{'indice_dia': 5, 'hora_entrada': '10:00', 'hora_salida': '14:00'}]},
            format='json',
        )
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(turno.tramos.count(), 1)
        self.assertEqual(turno.tramos.first().indice_dia, 5)

    def test_no_se_puede_solapar_dos_turnos(self):
        turno_a = turno_de_prueba(nombre='A')
        turno_b = turno_de_prueba(nombre='B')
        AsignacionTurno.objects.create(
            empleado=self.empleado, turno=turno_a, desde=date(2026, 1, 1)
        )
        respuesta = self.cliente.post(reverse('asistencia:asignaciones'), {
            'empleado': self.empleado.id, 'turno': turno_b.id, 'desde': '2026-06-01',
        }, format='json')
        self.assertEqual(respuesta.status_code, 400)

    def test_licencias_no_se_superponen(self):
        Licencia.objects.create(
            empleado=self.empleado, tipo=TipoLicencia.VACACIONES,
            desde=date(2026, 8, 1), hasta=date(2026, 8, 15),
        )
        respuesta = self.cliente.post(reverse('asistencia:licencias'), {
            'empleado': self.empleado.id, 'tipo': 'enfermedad',
            'desde': '2026-08-10', 'hasta': '2026-08-20',
        }, format='json')
        self.assertEqual(respuesta.status_code, 400)

    def test_licencia_con_hasta_anterior_a_desde(self):
        respuesta = self.cliente.post(reverse('asistencia:licencias'), {
            'empleado': self.empleado.id, 'tipo': 'otro',
            'desde': '2026-08-20', 'hasta': '2026-08-10',
        }, format='json')
        self.assertEqual(respuesta.status_code, 400)
