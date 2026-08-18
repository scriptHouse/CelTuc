"""Tests de turnos rotativos, feriados y licencias por horas.

Las tres cosas que antes no se podían expresar:

- un patrón que NO se repite por semana (2x2, 4x2, semana A / semana B);
- un feriado, que sin esto aparecía como ausencia de todo el equipo;
- una licencia de medio día, que antes obligaba a cargar el día entero.
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
    Feriado,
    Fichada,
    Licencia,
    TipoFeriado,
    TipoLicencia,
    TramoTurno,
    Turno,
    feriado_de,
    hash_evento,
)

LUNES = date(2026, 8, 17)


def f(fecha, hora, minuto=0):
    momento = timezone.make_aware(datetime.combine(fecha, time(hora, minuto)))
    return SimpleNamespace(ocurrida_en=momento, tipo='unknown')


class TurnoRotativoTests(TestCase):
    """Un 2x2: dos días de trabajo, dos de franco, corriendo por el calendario."""

    def setUp(self):
        self.turno = Turno.objects.create(
            nombre='2x2', tipo_ciclo=Turno.ROTATIVO,
            dias_ciclo=4, fecha_inicio_ciclo=LUNES,
        )
        for indice in (0, 1):
            TramoTurno.objects.create(
                turno=self.turno, indice_dia=indice,
                hora_entrada=time(8, 0), hora_salida=time(20, 0),
            )

    def test_el_indice_avanza_con_el_calendario(self):
        esperado = [0, 1, 2, 3, 0, 1, 2, 3]
        real = [self.turno.indice_de(LUNES + timedelta(days=n)) for n in range(8)]
        self.assertEqual(real, esperado)

    def test_trabaja_dos_y_descansa_dos(self):
        trabaja = [
            bool(self.turno.tramos_de(LUNES + timedelta(days=n))) for n in range(8)
        ]
        self.assertEqual(trabaja, [True, True, False, False, True, True, False, False])

    def test_el_franco_NO_cae_siempre_el_mismo_dia_de_semana(self):
        """Esto es lo que un turno semanal no podía expresar."""
        dias_libres = [
            (LUNES + timedelta(days=n)).weekday()
            for n in range(28)
            if not self.turno.tramos_de(LUNES + timedelta(days=n))
        ]
        # Si el patrón fuera semanal, siempre serían los mismos dos weekdays.
        self.assertGreater(len(set(dias_libres)), 2)

    def test_desfase_pone_a_dos_personas_en_fases_opuestas(self):
        """Mismo turno, uno entra cuando el otro descansa."""
        for n in range(8):
            dia = LUNES + timedelta(days=n)
            uno = bool(self.turno.tramos_de(dia, desfase=0))
            otro = bool(self.turno.tramos_de(dia, desfase=2))
            self.assertNotEqual(uno, otro, f'ambos coinciden el día {dia}')

    def test_fechas_anteriores_al_inicio_del_ciclo(self):
        """El módulo de Python no se rompe con negativos."""
        indices = [self.turno.indice_de(LUNES - timedelta(days=n)) for n in (1, 2, 3, 4)]
        self.assertEqual(indices, [3, 2, 1, 0])

    def test_semana_a_semana_b(self):
        """Ciclo de 14 días: una semana a la mañana, la siguiente a la tarde."""
        turno = Turno.objects.create(
            nombre='A/B', tipo_ciclo=Turno.ROTATIVO,
            dias_ciclo=14, fecha_inicio_ciclo=LUNES,
        )
        for indice in range(5):  # semana A, mañana
            TramoTurno.objects.create(turno=turno, indice_dia=indice,
                                      hora_entrada=time(6, 0), hora_salida=time(14, 0))
        for indice in range(7, 12):  # semana B, tarde
            TramoTurno.objects.create(turno=turno, indice_dia=indice,
                                      hora_entrada=time(14, 0), hora_salida=time(22, 0))

        primera = turno.tramos_de(LUNES)
        segunda = turno.tramos_de(LUNES + timedelta(days=7))
        self.assertEqual(primera[0].hora_entrada, time(6, 0))
        self.assertEqual(segunda[0].hora_entrada, time(14, 0))
        # Y a las dos semanas vuelve a empezar.
        self.assertEqual(turno.tramos_de(LUNES + timedelta(days=14))[0].hora_entrada, time(6, 0))

    def test_la_jornada_se_calcula_contra_el_dia_del_ciclo(self):
        j = J.calcular(LUNES, [f(LUNES, 8), f(LUNES, 20)], turno=self.turno)
        self.assertEqual(j.estado, J.EstadoJornada.OK)
        self.assertEqual(j.minutos_esperados, 12 * 60)

        franco = LUNES + timedelta(days=2)
        j2 = J.calcular(franco, [], turno=self.turno)
        self.assertEqual(j2.estado, J.EstadoJornada.NO_LABORABLE)

    def test_turno_semanal_sigue_funcionando_igual(self):
        """El tipo por defecto no cambió de comportamiento."""
        semanal = Turno.objects.create(nombre='Semanal')
        TramoTurno.objects.create(turno=semanal, indice_dia=0,
                                  hora_entrada=time(9, 0), hora_salida=time(18, 0))
        self.assertFalse(semanal.es_rotativo)
        self.assertTrue(semanal.tramos_de(LUNES))                       # lunes
        self.assertFalse(semanal.tramos_de(LUNES + timedelta(days=1)))  # martes


class FeriadoTests(TestCase):
    def setUp(self):
        self.turno = Turno.objects.create(nombre='Comercio')
        for indice in range(5):
            TramoTurno.objects.create(turno=self.turno, indice_dia=indice,
                                      hora_entrada=time(9, 0), hora_salida=time(18, 0))
        self.feriado = Feriado.objects.create(
            fecha=LUNES, nombre='Día de prueba', tipo=TipoFeriado.NACIONAL
        )

    def test_feriado_no_es_ausencia(self):
        j = J.calcular(LUNES, [], turno=self.turno, feriado=self.feriado)
        self.assertEqual(j.estado, J.EstadoJornada.FERIADO)
        self.assertEqual(j.minutos_esperados, 0)
        self.assertEqual(j.feriado['nombre'], 'Día de prueba')
        self.assertFalse(j.trabajo_en_feriado)

    def test_si_trabajan_en_feriado_queda_registrado(self):
        j = J.calcular(LUNES, [f(LUNES, 9), f(LUNES, 18)],
                       turno=self.turno, feriado=self.feriado)
        self.assertEqual(j.estado, J.EstadoJornada.FERIADO)
        self.assertEqual(j.minutos_trabajados, 9 * 60)
        self.assertTrue(j.trabajo_en_feriado)
        # No se espera nada, así que no puede llegar tarde.
        self.assertEqual(j.llegada_tarde_minutos, 0)

    def test_feriado_provincial_le_gana_al_general(self):
        salta = Sucursal.objects.get_or_create(nombre='Salta')[0]
        propio = Feriado.objects.create(
            fecha=LUNES, nombre='Fiesta provincial', tipo=TipoFeriado.PROVINCIAL,
            sucursal=salta,
        )
        self.assertEqual(feriado_de(LUNES, salta.id), propio)
        # Una sucursal sin feriado propio ve el nacional.
        otra = Sucursal.objects.get_or_create(nombre='Central YB')[0]
        self.assertEqual(feriado_de(LUNES, otra.id), self.feriado)

    def test_feriado_solo_provincial_no_afecta_a_las_demas(self):
        Feriado.objects.all().delete()  # el delete del queryset ya es fisico
        salta = Sucursal.objects.get_or_create(nombre='Salta')[0]
        Feriado.objects.create(
            fecha=LUNES, nombre='Solo Salta', tipo=TipoFeriado.PROVINCIAL, sucursal=salta
        )
        self.assertIsNotNone(feriado_de(LUNES, salta.id))
        self.assertIsNone(feriado_de(LUNES, 99999))


class LicenciaPorHorasTests(TestCase):
    def setUp(self):
        self.empleado = Empleado.objects.create(nombre='Ana', apellido='Gómez')
        self.turno = Turno.objects.create(nombre='Comercio')
        for indice in range(5):
            TramoTurno.objects.create(turno=self.turno, indice_dia=indice,
                                      hora_entrada=time(9, 0), hora_salida=time(18, 0))

    def _licencia(self, desde_h, hasta_h, tipo=TipoLicencia.ESPECIAL):
        return Licencia.objects.create(
            empleado=self.empleado, tipo=tipo, desde=LUNES, hasta=LUNES,
            jornada_completa=False, hora_desde=time(desde_h, 0), hora_hasta=time(hasta_h, 0),
        )

    def test_media_jornada_reduce_lo_esperado(self):
        """Turno 09-18 con licencia 09-13: se espera solo 13-18."""
        j = J.calcular(LUNES, [f(LUNES, 13), f(LUNES, 18)],
                       turno=self.turno, licencia=self._licencia(9, 13))
        self.assertEqual(j.minutos_esperados, 5 * 60)
        self.assertEqual(j.estado, J.EstadoJornada.OK)
        self.assertEqual(j.llegada_tarde_minutos, 0)  # 13:00 es su hora

    def test_sin_licencia_ese_mismo_horario_seria_tarde(self):
        """Contraprueba: la licencia es la que evita el 'llegó tarde'."""
        j = J.calcular(LUNES, [f(LUNES, 13), f(LUNES, 18)], turno=self.turno)
        self.assertEqual(j.estado, J.EstadoJornada.TARDE)
        self.assertEqual(j.llegada_tarde_minutos, 4 * 60)

    def test_licencia_a_la_tarde_adelanta_la_salida_esperada(self):
        j = J.calcular(LUNES, [f(LUNES, 9), f(LUNES, 14)],
                       turno=self.turno, licencia=self._licencia(14, 18))
        self.assertEqual(j.minutos_esperados, 5 * 60)
        self.assertEqual(j.estado, J.EstadoJornada.OK)
        self.assertEqual(j.salida_temprana_minutos, 0)

    def test_licencia_al_medio_parte_el_horario_esperado(self):
        """Turno médico de 12 a 14: se espera 09-12 y 14-18."""
        j = J.calcular(
            LUNES,
            [f(LUNES, 9), f(LUNES, 12), f(LUNES, 14), f(LUNES, 18)],
            turno=self.turno, licencia=self._licencia(12, 14),
        )
        self.assertEqual(j.minutos_esperados, 3 * 60 + 4 * 60)
        self.assertEqual(len(j.salidas_parciales), 1)
        self.assertEqual(j.estado, J.EstadoJornada.OK)

    def test_si_no_viene_igual_esta_ausente(self):
        """La licencia era de medio día: el otro medio se sigue esperando."""
        j = J.calcular(LUNES, [], turno=self.turno, licencia=self._licencia(9, 13))
        self.assertEqual(j.estado, J.EstadoJornada.AUSENTE)
        self.assertEqual(j.minutos_esperados, 5 * 60)

    def test_licencia_que_cubre_todo_el_horario_es_licencia(self):
        j = J.calcular(LUNES, [], turno=self.turno, licencia=self._licencia(8, 19))
        self.assertEqual(j.estado, J.EstadoJornada.LICENCIA)
        self.assertEqual(j.minutos_esperados, 0)

    def test_licencia_de_dia_completo_sigue_igual(self):
        licencia = Licencia.objects.create(
            empleado=self.empleado, tipo=TipoLicencia.VACACIONES,
            desde=LUNES, hasta=LUNES,
        )
        self.assertFalse(licencia.es_parcial)
        j = J.calcular(LUNES, [], turno=self.turno, licencia=licencia)
        self.assertEqual(j.estado, J.EstadoJornada.LICENCIA)


class RestarFranjaTests(TestCase):
    """Aritmética de intervalos: es lo que hace posible la licencia por horas."""

    def _dt(self, hora):
        return timezone.make_aware(datetime.combine(LUNES, time(hora, 0)))

    def test_saca_del_principio(self):
        r = J.restar_franja([(self._dt(9), self._dt(18))], self._dt(9), self._dt(13))
        self.assertEqual(r, [(self._dt(13), self._dt(18))])

    def test_saca_del_final(self):
        r = J.restar_franja([(self._dt(9), self._dt(18))], self._dt(14), self._dt(18))
        self.assertEqual(r, [(self._dt(9), self._dt(14))])

    def test_parte_al_medio(self):
        r = J.restar_franja([(self._dt(9), self._dt(18))], self._dt(12), self._dt(14))
        self.assertEqual(r, [(self._dt(9), self._dt(12)), (self._dt(14), self._dt(18))])

    def test_franja_que_no_toca_no_cambia_nada(self):
        original = [(self._dt(9), self._dt(18))]
        self.assertEqual(J.restar_franja(original, self._dt(20), self._dt(22)), original)

    def test_franja_que_cubre_todo_deja_vacio(self):
        self.assertEqual(
            J.restar_franja([(self._dt(9), self._dt(18))], self._dt(8), self._dt(20)), []
        )


class CalendarioAPITests(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)
        self.empleado = Empleado.objects.create(nombre='Nacho', apellido='Pérez')

    def test_sembrar_feriados_fijos(self):
        respuesta = self.cliente.post(
            reverse('asistencia:feriados-sembrar'), {'anio': 2026}, format='json'
        )
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data['creados'], 9)
        self.assertTrue(Feriado.objects.filter(fecha=date(2026, 5, 25)).exists())
        self.assertTrue(Feriado.objects.filter(fecha=date(2026, 12, 25)).exists())

        # Correrlo dos veces no duplica.
        segunda = self.cliente.post(
            reverse('asistencia:feriados-sembrar'), {'anio': 2026}, format='json'
        )
        self.assertEqual(segunda.data['creados'], 0)
        self.assertEqual(segunda.data['omitidos'], 9)
        self.assertEqual(Feriado.objects.count(), 9)

    def test_no_se_repite_un_feriado_el_mismo_dia(self):
        Feriado.objects.create(fecha=LUNES, nombre='Uno')
        respuesta = self.cliente.post(reverse('asistencia:feriados'), {
            'fecha': LUNES.isoformat(), 'nombre': 'Otro', 'tipo': 'nacional',
        }, format='json')
        self.assertEqual(respuesta.status_code, 400)

    def test_crear_turno_rotativo(self):
        respuesta = self.cliente.post(reverse('asistencia:turnos'), {
            'nombre': 'Guardia 2x2',
            'tipo_ciclo': 'rotativo',
            'dias_ciclo': 4,
            'fecha_inicio_ciclo': LUNES.isoformat(),
            'tramos': [
                {'indice_dia': 0, 'hora_entrada': '08:00', 'hora_salida': '20:00'},
                {'indice_dia': 1, 'hora_entrada': '08:00', 'hora_salida': '20:00'},
            ],
        }, format='json')
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data['dias_ciclo'], 4)

    def test_rotativo_sin_fecha_de_inicio_se_rechaza(self):
        respuesta = self.cliente.post(reverse('asistencia:turnos'), {
            'nombre': 'Mal', 'tipo_ciclo': 'rotativo', 'dias_ciclo': 4,
            'tramos': [{'indice_dia': 0, 'hora_entrada': '08:00', 'hora_salida': '20:00'}],
        }, format='json')
        self.assertEqual(respuesta.status_code, 400)

    def test_tramo_fuera_del_ciclo_se_rechaza(self):
        respuesta = self.cliente.post(reverse('asistencia:turnos'), {
            'nombre': 'Mal2', 'tipo_ciclo': 'rotativo', 'dias_ciclo': 4,
            'fecha_inicio_ciclo': LUNES.isoformat(),
            'tramos': [{'indice_dia': 9, 'hora_entrada': '08:00', 'hora_salida': '20:00'}],
        }, format='json')
        self.assertEqual(respuesta.status_code, 400)

    def test_licencia_por_horas_sin_horas_se_rechaza(self):
        respuesta = self.cliente.post(reverse('asistencia:licencias'), {
            'empleado': self.empleado.id, 'tipo': 'especial',
            'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat(),
            'jornada_completa': False,
        }, format='json')
        self.assertEqual(respuesta.status_code, 400)

    def test_licencia_por_horas_valida(self):
        respuesta = self.cliente.post(reverse('asistencia:licencias'), {
            'empleado': self.empleado.id, 'tipo': 'especial',
            'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat(),
            'jornada_completa': False, 'hora_desde': '09:00', 'hora_hasta': '13:00',
        }, format='json')
        self.assertEqual(respuesta.status_code, 201)
        self.assertFalse(respuesta.data['jornada_completa'])


class ResumenConCalendarioTests(TestCase):
    """El endpoint completo, con feriado y turno rotativo en la base."""

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=self.sucursal, nombre='Reloj', host='192.168.1.31'
        )
        self.empleado = Empleado.objects.create(
            nombre='Nacho', apellido='Pérez', sucursal=self.sucursal
        )
        turno = Turno.objects.create(nombre='Comercio')
        for indice in range(7):
            TramoTurno.objects.create(turno=turno, indice_dia=indice,
                                      hora_entrada=time(9, 0), hora_salida=time(18, 0))
        AsignacionTurno.objects.create(
            empleado=self.empleado, turno=turno, desde=date(2026, 1, 1)
        )

    def _fichar(self, hora):
        momento = timezone.make_aware(datetime.combine(LUNES, time(hora, 0)))
        return Fichada.objects.create(
            dispositivo=self.dispositivo, empleado=self.empleado,
            estado_mapeo=EstadoMapeo.MAPEADA, numero_reloj='Nacho',
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                self.dispositivo.id, '', 'Nacho', momento, 'unknown', 'multiple'
            ) + str(hora),
        )

    def _resumen(self):
        return self.cliente.get(reverse('asistencia:resumen'), {
            'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat(),
        })

    def test_sin_feriado_el_dia_sin_fichar_es_ausencia(self):
        fila = self._resumen().data['resultados'][0]
        self.assertEqual(fila['estado'], 'ausente')

    def test_con_feriado_no_aparece_la_ausencia(self):
        """Antes esto llenaba el resumen de ausencias falsas."""
        Feriado.objects.create(fecha=LUNES, nombre='Feriado nacional')
        self.assertEqual(self._resumen().data['resultados'], [])

    def test_trabajar_en_feriado_si_aparece(self):
        Feriado.objects.create(fecha=LUNES, nombre='Feriado nacional')
        self._fichar(9)
        self._fichar(18)
        fila = self._resumen().data['resultados'][0]
        self.assertEqual(fila['estado'], 'feriado')
        self.assertTrue(fila['trabajo_en_feriado'])
        self.assertEqual(fila['minutos_trabajados'], 9 * 60)
        self.assertEqual(fila['feriado']['nombre'], 'Feriado nacional')


class PanelEstadoRelojTests(TestCase):
    """El panel distingue «no se sabe todavia» de «el reloj esta caido»."""

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)
        sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=sucursal, nombre='Reloj', host='192.168.1.31'
        )
        from .models import Agente
        self.agente = Agente(dispositivo=self.dispositivo, nombre='notebook-01')
        self.agente.asignar_token()
        self.agente.save()

    def _panel(self):
        return self.cliente.get(reverse('asistencia:panel')).data['dispositivos'][0]

    def _heartbeat(self, alcanzable):
        from .models import Agente
        Agente.todos.filter(pk=self.agente.pk).update(
            ultimo_heartbeat=timezone.now(), reloj_alcanzable=alcanzable
        )

    def test_sin_reporte_todavia_no_es_sin_conexion(self):
        """Regresion: el primer heartbeat llega ANTES de consultar el reloj.

        Convertir ese `None` en False pintaba «Reloj sin conexion» en rojo
        durante los primeros segundos de cada arranque.
        """
        self._heartbeat(None)
        self.assertIsNone(self._panel()['reloj_en_linea'])

    def test_reloj_alcanzable_es_en_linea(self):
        self._heartbeat(True)
        self.assertIs(self._panel()['reloj_en_linea'], True)

    def test_reloj_inalcanzable_es_sin_conexion(self):
        self._heartbeat(False)
        self.assertIs(self._panel()['reloj_en_linea'], False)
