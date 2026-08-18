"""Tests de la sucursal esperada: quién trabaja dónde, y qué día.

`Empleado.sucursal` dice a qué local pertenece alguien, pero es un dato fijo.
Lo que se prueba acá es lo otro: gente que rota, y que por lo tanto tiene un
local esperado DISTINTO según el día.

El caso que ordena todo es la superposición a propósito: una regla permanente
(«Nacho está en Yerba Buena») y una excepción de dos días («esta semana cubre
Salta»). Las dos filas conviven y gana la más específica.
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
    AsignacionSucursal,
    AsignacionTurno,
    Dispositivo,
    EstadoMapeo,
    Feriado,
    Fichada,
    TipoFeriado,
    TramoTurno,
    Turno,
    hash_evento,
    sucursal_de,
)

LUNES = date(2026, 8, 17)
MARTES = LUNES + timedelta(days=1)
MIERCOLES = LUNES + timedelta(days=2)


class ResolucionSucursalTests(TestCase):
    """A quién le gana quién cuando varias asignaciones cubren el mismo día."""

    def setUp(self):
        self.yb = Sucursal.objects.get_or_create(nombre='Yerba Buena')[0]
        self.salta = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.central = Sucursal.objects.get_or_create(nombre='Central')[0]
        self.empleado = Empleado.objects.create(nombre='Nacho', sucursal=self.yb)

    def test_sin_asignaciones_vale_la_sucursal_del_empleado(self):
        """Nadie configuró nada: sigue valiendo el dato de siempre."""
        self.assertEqual(sucursal_de(self.empleado.id, LUNES), self.yb)

    def test_una_asignacion_permanente_pisa_la_del_empleado(self):
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta, desde=date(2026, 3, 1)
        )
        self.assertEqual(sucursal_de(self.empleado.id, LUNES), self.salta)

    def test_antes_del_desde_no_aplica(self):
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta, desde=MARTES
        )
        self.assertEqual(sucursal_de(self.empleado.id, LUNES), self.yb)

    def test_semana_partida_por_dias(self):
        """Lunes y martes en Salta, el resto en Yerba Buena."""
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.yb, desde=date(2026, 1, 1)
        )
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta,
            desde=date(2026, 1, 1), dias_semana='0,1',
        )
        self.assertEqual(sucursal_de(self.empleado.id, LUNES), self.salta)
        self.assertEqual(sucursal_de(self.empleado.id, MARTES), self.salta)
        self.assertEqual(sucursal_de(self.empleado.id, MIERCOLES), self.yb)

    def test_una_excepcion_corta_le_gana_a_la_regla_permanente(self):
        """El caso real: esta semana va a cubrir a otro local."""
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.yb, desde=date(2026, 1, 1)
        )
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta,
            desde=LUNES, hasta=MARTES, motivo='Cubre licencia de Mili',
        )
        self.assertEqual(sucursal_de(self.empleado.id, LUNES), self.salta)
        self.assertEqual(sucursal_de(self.empleado.id, MIERCOLES), self.yb)

    def test_la_excepcion_de_un_dia_le_gana_a_la_de_una_semana(self):
        """Más corto = más específico, sin importar el orden de carga."""
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta,
            desde=LUNES, hasta=LUNES + timedelta(days=6),
        )
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.central, desde=MARTES, hasta=MARTES,
        )
        self.assertEqual(sucursal_de(self.empleado.id, LUNES), self.salta)
        self.assertEqual(sucursal_de(self.empleado.id, MARTES), self.central)

    def test_a_igual_periodo_gana_la_que_limita_dias(self):
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.yb, desde=LUNES, hasta=MIERCOLES,
        )
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta,
            desde=LUNES, hasta=MIERCOLES, dias_semana='0',
        )
        self.assertEqual(sucursal_de(self.empleado.id, LUNES), self.salta)
        self.assertEqual(sucursal_de(self.empleado.id, MARTES), self.yb)

    def test_los_siete_dias_es_lo_mismo_que_todos(self):
        fila = AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta,
            desde=date(2026, 1, 1), dias_semana='0,1,2,3,4,5,6',
        )
        self.assertTrue(fila.todos_los_dias)
        self.assertEqual(sucursal_de(self.empleado.id, MIERCOLES), self.salta)

    def test_empleado_sin_sucursal_y_sin_asignaciones(self):
        suelto = Empleado.objects.create(nombre='Sin local')
        self.assertIsNone(sucursal_de(suelto.id, LUNES))


class ResumenConSucursalTests(TestCase):
    """El resumen tiene que decir dónde se lo esperaba y dónde fichó."""

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.yb = Sucursal.objects.get_or_create(nombre='Yerba Buena')[0]
        self.salta = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.reloj_yb = Dispositivo.objects.create(
            sucursal=self.yb, nombre='Reloj YB', host='192.168.1.31'
        )
        self.reloj_salta = Dispositivo.objects.create(
            sucursal=self.salta, nombre='Reloj Salta', host='192.168.2.31'
        )

        self.empleado = Empleado.objects.create(nombre='Nacho', sucursal=self.yb)
        turno = Turno.objects.create(nombre='Comercio')
        for dia in range(5):
            TramoTurno.objects.create(
                turno=turno, indice_dia=dia,
                hora_entrada=time(9, 0), hora_salida=time(18, 0),
            )
        AsignacionTurno.objects.create(
            empleado=self.empleado, turno=turno, desde=date(2026, 1, 1)
        )

    def _fichar(self, dispositivo, hora, fecha=LUNES):
        momento = timezone.make_aware(datetime.combine(fecha, time(hora, 0)))
        return Fichada.objects.create(
            dispositivo=dispositivo, empleado=self.empleado,
            estado_mapeo=EstadoMapeo.MAPEADA, numero_reloj='Nacho',
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                dispositivo.id, '', 'Nacho', momento, 'unknown', 'multiple'
            ),
        )

    def _resumen(self, **extra):
        params = {'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat()}
        params.update(extra)
        return self.cliente.get(reverse('asistencia:resumen'), params)

    def test_informa_la_sucursal_esperada(self):
        self._fichar(self.reloj_yb, 9)
        self._fichar(self.reloj_yb, 18)
        fila = self._resumen().data['resultados'][0]
        self.assertEqual(fila['sucursal_esperada']['nombre'], 'Yerba Buena')
        self.assertEqual(
            [s['nombre'] for s in fila['sucursales_fichadas']], ['Yerba Buena']
        )
        self.assertFalse(fila['fichada_en_otra_sucursal'])

    def test_detecta_que_ficho_en_otro_local(self):
        """Se lo esperaba en Yerba Buena y apareció en Salta."""
        self._fichar(self.reloj_salta, 9)
        self._fichar(self.reloj_salta, 18)
        respuesta = self._resumen()
        fila = respuesta.data['resultados'][0]
        self.assertTrue(fila['fichada_en_otra_sucursal'])
        self.assertEqual(fila['sucursal_esperada']['nombre'], 'Yerba Buena')
        self.assertEqual([s['nombre'] for s in fila['sucursales_fichadas']], ['Salta'])
        self.assertEqual(respuesta.data['resumen']['en_otra_sucursal'], 1)

    def test_con_la_asignacion_cargada_deja_de_ser_una_anomalia(self):
        """Mismo día y mismas fichadas: cargando dónde le tocaba, está todo bien."""
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta, desde=LUNES, hasta=LUNES,
        )
        self._fichar(self.reloj_salta, 9)
        self._fichar(self.reloj_salta, 18)
        fila = self._resumen().data['resultados'][0]
        self.assertFalse(fila['fichada_en_otra_sucursal'])
        self.assertEqual(fila['sucursal_esperada']['nombre'], 'Salta')

    def test_el_feriado_sigue_a_la_sucursal_donde_le_tocaba_estar(self):
        """Un feriado provincial de Salta le aplica a quien ese día está allá,
        aunque su local de siempre sea Yerba Buena."""
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta, desde=LUNES, hasta=LUNES,
        )
        Feriado.objects.create(
            fecha=LUNES, nombre='San Miguel', tipo=TipoFeriado.PROVINCIAL,
            sucursal=self.salta,
        )
        self._fichar(self.reloj_salta, 9)
        fila = self._resumen().data['resultados'][0]
        self.assertEqual(fila['estado'], 'feriado')

    def test_el_feriado_de_otra_sucursal_no_lo_alcanza(self):
        Feriado.objects.create(
            fecha=LUNES, nombre='San Miguel', tipo=TipoFeriado.PROVINCIAL,
            sucursal=self.salta,
        )
        self._fichar(self.reloj_yb, 9)
        self._fichar(self.reloj_yb, 18)
        fila = self._resumen().data['resultados'][0]
        self.assertEqual(fila['estado'], 'ok')

    def test_filtrando_por_sucursal_aparecen_las_ausencias_de_esa_sucursal(self):
        """Sin fichadas no hay reloj por el cual filtrar: la ausencia se tiene
        que decidir por dónde se esperaba a la persona."""
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta, desde=date(2026, 1, 1),
        )
        respuesta = self._resumen(sucursal=self.salta.id)
        self.assertEqual(len(respuesta.data['resultados']), 1)
        self.assertEqual(respuesta.data['resultados'][0]['estado'], 'ausente')

        vacio = self._resumen(sucursal=self.yb.id)
        self.assertEqual(vacio.data['resultados'], [])

    def test_quien_ficho_en_otro_local_no_figura_ausente(self):
        """Se lo esperaba en Salta y ficho en Yerba Buena.

        En la vista de Salta tiene que aparecer la jornada real marcada como
        anomalia, NO una ausencia: la persona trabajo, en otro lado.
        """
        AsignacionSucursal.objects.create(
            empleado=self.empleado, sucursal=self.salta, desde=date(2026, 1, 1),
        )
        self._fichar(self.reloj_yb, 9)
        self._fichar(self.reloj_yb, 18)

        filas = self._resumen(sucursal=self.salta.id).data['resultados']
        self.assertEqual(len(filas), 1)
        self.assertNotEqual(filas[0]['estado'], 'ausente')
        self.assertTrue(filas[0]['fichada_en_otra_sucursal'])

        # Y tambien la ve Yerba Buena, que es donde aparecio esa persona.
        otras = self._resumen(sucursal=self.yb.id).data['resultados']
        self.assertEqual(len(otras), 1)
        self.assertTrue(otras[0]['fichada_en_otra_sucursal'])


class AsignacionSucursalAPITests(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)
        self.salta = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.empleado = Empleado.objects.create(nombre='Nacho')

    def _crear(self, **datos):
        cuerpo = {
            'empleado': self.empleado.id,
            'sucursal': self.salta.id,
            'desde': LUNES.isoformat(),
        }
        cuerpo.update(datos)
        return self.cliente.post(
            reverse('asistencia:asignaciones-sucursal'), cuerpo, format='json'
        )

    def test_alta_con_dias_como_lista(self):
        respuesta = self._crear(dias_semana=[0, 1], motivo='Refuerzo de inicio de semana')
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(respuesta.data['dias_semana'], [0, 1])
        self.assertFalse(respuesta.data['todos_los_dias'])
        self.assertTrue(respuesta.data['vigente'])

    def test_los_siete_dias_se_guardan_como_todos(self):
        respuesta = self._crear(dias_semana=[0, 1, 2, 3, 4, 5, 6])
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(respuesta.data['dias_semana'], [])
        self.assertTrue(respuesta.data['todos_los_dias'])

    def test_dia_invalido(self):
        self.assertEqual(self._crear(dias_semana=[9]).status_code, 400)

    def test_hasta_anterior_a_desde(self):
        respuesta = self._crear(desde=MARTES.isoformat(), hasta=LUNES.isoformat())
        self.assertEqual(respuesta.status_code, 400)

    def test_se_permite_superponer_pero_no_duplicar(self):
        self.assertEqual(self._crear().status_code, 201)
        # Otra que se superpone: es el mecanismo previsto para las excepciones.
        self.assertEqual(self._crear(hasta=MARTES.isoformat()).status_code, 201)
        # La misma exacta dos veces no aporta nada.
        self.assertEqual(self._crear().status_code, 400)

    def test_solo_superadmin(self):
        admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)
        self.assertEqual(
            cliente.get(reverse('asistencia:asignaciones-sucursal')).status_code, 403
        )
