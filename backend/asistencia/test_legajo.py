"""Tests del legajo: toda la asistencia de una persona, al zoom que se pida.

La idea que se prueba acá es que el mismo período se pueda mirar de tres
formas sin pedir cosas distintas: el agregado por mes (vista anual), una línea
por día (para pintar el calendario) y el detalle completo (solo si el período
es corto, porque un año de detalle no lo mira nadie y pesa de más).
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
    EstadoMapeo,
    Fichada,
    Licencia,
    TipoLicencia,
    TramoTurno,
    Turno,
    hash_evento,
)

LUNES = date(2026, 8, 17)


class LegajoTests(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=self.sucursal, nombre='Reloj Salta', host='192.168.1.31'
        )
        self.empleado = Empleado.objects.create(
            nombre='Nacho', apellido='Pérez', sucursal=self.sucursal
        )
        self.otro = Empleado.objects.create(nombre='Mili', sucursal=self.sucursal)

        self.turno = Turno.objects.create(nombre='Comercio', tolerancia_entrada=10)
        for dia in range(5):
            TramoTurno.objects.create(
                turno=self.turno, indice_dia=dia,
                hora_entrada=time(9, 0), hora_salida=time(18, 0),
            )
        for empleado in (self.empleado, self.otro):
            AsignacionTurno.objects.create(
                empleado=empleado, turno=self.turno, desde=date(2026, 1, 1)
            )

    def _fichar(self, fecha, hora, minuto=0, empleado=None):
        empleado = empleado or self.empleado
        momento = timezone.make_aware(datetime.combine(fecha, time(hora, minuto)))
        return Fichada.objects.create(
            dispositivo=self.dispositivo, empleado=empleado,
            estado_mapeo=EstadoMapeo.MAPEADA, numero_reloj=empleado.nombre,
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                self.dispositivo.id, '', empleado.nombre, momento, 'unknown', 'multiple'
            ),
        )

    def _legajo(self, empleado=None, **params):
        return self.cliente.get(
            reverse('asistencia:legajo-empleado', args=[(empleado or self.empleado).id]),
            params,
        )

    # --- Lo básico ---------------------------------------------------------

    def test_trae_la_identidad_y_el_turno_vigente(self):
        respuesta = self._legajo(desde=LUNES.isoformat(), hasta=LUNES.isoformat())
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data['empleado']['nombre'], 'Nacho Pérez')
        self.assertEqual(respuesta.data['empleado']['sucursal'], 'Salta')
        self.assertEqual(respuesta.data['empleado']['turno_vigente'], 'Comercio')

    def test_los_totales_del_periodo(self):
        self._fichar(LUNES, 9)
        self._fichar(LUNES, 18)
        martes = LUNES + timedelta(days=1)
        self._fichar(martes, 9, 40)
        self._fichar(martes, 18)

        datos = self._legajo(desde=LUNES.isoformat(), hasta=martes.isoformat()).data
        resumen = datos['resumen']
        self.assertEqual(resumen['dias_trabajados'], 2)
        self.assertEqual(resumen['minutos_trabajados'], 540 + 500)
        self.assertEqual(resumen['minutos_esperados'], 1080)
        self.assertEqual(resumen['saldo_minutos'], -40)
        self.assertEqual(resumen['dias_tarde'], 1)
        self.assertEqual(resumen['minutos_tarde'], 40)

    def test_no_se_mezcla_con_otros_empleados(self):
        self._fichar(LUNES, 9)
        self._fichar(LUNES, 18)
        self._fichar(LUNES, 10, empleado=self.otro)

        datos = self._legajo(desde=LUNES.isoformat(), hasta=LUNES.isoformat()).data
        self.assertEqual(len(datos['dias']), 1)
        self.assertEqual(datos['resumen']['minutos_trabajados'], 540)

    def test_una_ausencia_aparece_aunque_no_haya_fichadas(self):
        datos = self._legajo(desde=LUNES.isoformat(), hasta=LUNES.isoformat()).data
        self.assertEqual(datos['dias'][0]['estado'], 'ausente')
        self.assertEqual(datos['resumen']['ausencias'], 1)

    # --- Los tres niveles de zoom -----------------------------------------

    def test_periodo_corto_trae_el_detalle_completo(self):
        self._fichar(LUNES, 9)
        self._fichar(LUNES, 13)
        self._fichar(LUNES, 14)
        self._fichar(LUNES, 18)

        datos = self._legajo(desde=LUNES.isoformat(), hasta=LUNES.isoformat()).data
        self.assertTrue(datos['con_detalle'])
        self.assertEqual(len(datos['jornadas']), 1)
        self.assertEqual(len(datos['jornadas'][0]['tramos']), 2)
        self.assertEqual(len(datos['jornadas'][0]['salidas_parciales']), 1)

    def test_un_anio_entero_trae_el_agregado_pero_no_el_detalle(self):
        """365 jornadas con tramos no las mira nadie: se manda lo compacto."""
        self._fichar(LUNES, 9)
        self._fichar(LUNES, 18)

        datos = self._legajo(
            desde=date(2026, 1, 1).isoformat(), hasta=date(2026, 12, 31).isoformat()
        ).data
        self.assertFalse(datos['con_detalle'])
        self.assertEqual(datos['jornadas'], [])
        # Lo compacto sí: es lo que pinta el calendario del año.
        self.assertGreater(len(datos['dias']), 200)

    def test_el_agregado_mensual(self):
        self._fichar(LUNES, 9)
        self._fichar(LUNES, 18)
        julio = date(2026, 7, 20)  # otro lunes
        self._fichar(julio, 9)
        self._fichar(julio, 17)

        datos = self._legajo(
            desde=date(2026, 7, 1).isoformat(), hasta=date(2026, 8, 31).isoformat()
        ).data
        meses = {m['mes']: m for m in datos['por_mes']}
        self.assertIn('2026-07', meses)
        self.assertIn('2026-08', meses)
        self.assertEqual(meses['2026-08']['etiqueta'], 'Agosto 2026')
        self.assertEqual(meses['2026-07']['etiqueta_corta'], 'Jul')
        self.assertEqual(meses['2026-08']['minutos_trabajados'], 540)
        self.assertEqual(meses['2026-07']['minutos_trabajados'], 480)

    def test_los_dias_vienen_del_mas_viejo_al_mas_nuevo(self):
        """El calendario y los gráficos leen en ese orden."""
        datos = self._legajo(
            desde=(LUNES - timedelta(days=5)).isoformat(), hasta=LUNES.isoformat()
        ).data
        fechas = [d['fecha'] for d in datos['dias']]
        self.assertEqual(fechas, sorted(fechas))

    # --- Lo que cuelga del período ----------------------------------------

    def test_trae_las_inconsistencias_de_esa_persona(self):
        self._fichar(LUNES, 9, 40)
        self._fichar(LUNES, 18)
        datos = self._legajo(desde=LUNES.isoformat(), hasta=LUNES.isoformat()).data
        self.assertEqual(len(datos['inconsistencias']), 1)
        self.assertEqual(datos['inconsistencias'][0]['tipo'], 'llegada_tarde')
        self.assertEqual(datos['inconsistencias'][0]['fecha'], LUNES.isoformat())
        self.assertEqual(datos['resumen']['pendientes'], 1)

    def test_las_inconsistencias_llegan_aun_sin_detalle(self):
        """En la vista anual el detalle no viaja, pero esto sí tiene que estar."""
        self._fichar(LUNES, 9, 40)
        self._fichar(LUNES, 18)
        datos = self._legajo(
            desde=date(2026, 1, 1).isoformat(), hasta=date(2026, 12, 31).isoformat()
        ).data
        self.assertFalse(datos['con_detalle'])
        self.assertTrue(any(i['tipo'] == 'llegada_tarde' for i in datos['inconsistencias']))

    def test_trae_las_licencias_del_periodo(self):
        Licencia.objects.create(
            empleado=self.empleado, tipo=TipoLicencia.VACACIONES,
            desde=LUNES, hasta=LUNES + timedelta(days=6),
        )
        datos = self._legajo(
            desde=LUNES.isoformat(), hasta=(LUNES + timedelta(days=6)).isoformat()
        ).data
        self.assertEqual(len(datos['licencias']), 1)
        self.assertEqual(datos['licencias'][0]['tipo_display'], 'Vacaciones')
        self.assertEqual(datos['resumen']['dias_licencia'], 7)

    def test_una_licencia_de_otro_empleado_no_aparece(self):
        Licencia.objects.create(
            empleado=self.otro, tipo=TipoLicencia.VACACIONES, desde=LUNES, hasta=LUNES
        )
        datos = self._legajo(desde=LUNES.isoformat(), hasta=LUNES.isoformat()).data
        self.assertEqual(datos['licencias'], [])

    # --- Bordes ------------------------------------------------------------

    def test_el_periodo_se_recorta_a_un_anio(self):
        datos = self._legajo(
            desde=date(2020, 1, 1).isoformat(), hasta=date(2026, 12, 31).isoformat()
        ).data
        self.assertEqual(datos['hasta'], '2026-12-31')
        self.assertEqual(datos['desde'], '2025-12-30')  # 366 días atrás

    def test_un_empleado_inexistente_da_404(self):
        respuesta = self.cliente.get(reverse('asistencia:legajo-empleado', args=[99999]))
        self.assertEqual(respuesta.status_code, 404)

    def test_solo_superadmin(self):
        admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)
        respuesta = cliente.get(
            reverse('asistencia:legajo-empleado', args=[self.empleado.id])
        )
        self.assertEqual(respuesta.status_code, 403)
