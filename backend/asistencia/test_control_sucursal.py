"""Apagar el control de asistencia de una sucursal.

Hay dos motivos por los que una sucursal puede no controlarse, y se arreglan
distinto: **no tiene reloj** (se deduce del equipamiento; se resuelve
instalándolo) o **alguien la apagó a mano** (esta tabla; se resuelve volviendo a
prender el interruptor). Un depósito donde el horario no importa, un local que
recién abre, una sucursal en obra.

Lo que se apaga es el JUICIO, no el registro: las fichadas se siguen guardando y
se pueden consultar. Eso es lo que más se cuida acá, porque lo contrario —dejar
de guardar— sería perder datos que no se recuperan.
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
    ControlSucursal,
    Dispositivo,
    EstadoMapeo,
    Fichada,
    TramoTurno,
    Turno,
    hash_evento,
    sucursales_controladas,
    sucursales_sin_control,
)

LUNES = date(2026, 8, 17)


class ControlPorSucursalTests(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.local = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.deposito = Sucursal.objects.get_or_create(nombre='Yerba Buena')[0]

        self.reloj_local = Dispositivo.objects.create(
            sucursal=self.local, nombre='Reloj Salta', host='192.168.1.31'
        )
        self.reloj_deposito = Dispositivo.objects.create(
            sucursal=self.deposito, nombre='Reloj Depósito', host='192.168.2.31'
        )

        turno = Turno.objects.create(nombre='Comercio')
        for dia in range(5):
            TramoTurno.objects.create(
                turno=turno, indice_dia=dia,
                hora_entrada=time(9, 0), hora_salida=time(18, 0),
            )
        self.ana = Empleado.objects.create(nombre='Ana', sucursal=self.local)
        self.beto = Empleado.objects.create(nombre='Beto', sucursal=self.deposito)
        for empleado in (self.ana, self.beto):
            AsignacionTurno.objects.create(
                empleado=empleado, turno=turno, desde=date(2026, 1, 1)
            )

    def _apagar(self, sucursal, motivo='El horario acá no se controla'):
        return self.cliente.patch(
            reverse('asistencia:control-sucursal', args=[sucursal.id]),
            {'controla': False, 'motivo': motivo}, format='json',
        )

    def _resumen(self):
        return self.cliente.get(reverse('asistencia:resumen'), {
            'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat(),
        })

    def _fichar(self, empleado, dispositivo, hora):
        momento = timezone.make_aware(datetime.combine(LUNES, time(hora, 0)))
        Fichada.objects.create(
            dispositivo=dispositivo, empleado=empleado,
            estado_mapeo=EstadoMapeo.MAPEADA, numero_reloj=empleado.nombre,
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                dispositivo.id, '', empleado.nombre, momento, 'unknown', 'multiple'
            ),
        )

    # --- El comportamiento por defecto --------------------------------------

    def test_sin_configurar_todo_se_controla(self):
        """Agregar esta tabla no puede haber cambiado lo que ya venía andando."""
        self.assertEqual(sucursales_sin_control(), set())
        self.assertEqual(sucursales_controladas(), {self.local.id, self.deposito.id})

    def test_una_ausencia_se_reporta_como_siempre(self):
        filas = self._resumen().data['resultados']
        nombres = {f['nombre'] for f in filas}
        self.assertIn('Ana', nombres)
        self.assertIn('Beto', nombres)

    # --- Apagar el control ---------------------------------------------------

    def test_apagarlo_saca_a_esa_sucursal_del_resumen(self):
        self._apagar(self.deposito)

        nombres = {f['nombre'] for f in self._resumen().data['resultados']}

        self.assertIn('Ana', nombres, 'la otra sucursal se sigue controlando')
        self.assertNotIn('Beto', nombres)

    def test_las_fichadas_se_siguen_registrando(self):
        """Se apaga el juicio, no el registro. Perder fichadas no se deshace."""
        self._apagar(self.deposito)
        self._fichar(self.beto, self.reloj_deposito, 9)
        self._fichar(self.beto, self.reloj_deposito, 18)

        listado = self.cliente.get(reverse('asistencia:fichadas'), {
            'sucursal': self.deposito.id,
        }).data

        self.assertEqual(listado['total'], 2)

    def test_un_dia_de_una_sucursal_apagada_se_muestra_pero_no_se_juzga(self):
        self._apagar(self.deposito)
        self._fichar(self.beto, self.reloj_deposito, 10, )  # llegaría tarde

        fila = next(
            f for f in self._resumen().data['resultados'] if f['nombre'] == 'Beto'
        )

        self.assertEqual(fila['estado'], 'sin_reloj')
        self.assertEqual(fila['inconsistencias'], [])
        self.assertEqual(fila['llegada_tarde_minutos'], 0)

    def test_volver_a_prenderlo_lo_devuelve_al_control(self):
        self._apagar(self.deposito)
        self.cliente.patch(
            reverse('asistencia:control-sucursal', args=[self.deposito.id]),
            {'controla': True}, format='json',
        )

        nombres = {f['nombre'] for f in self._resumen().data['resultados']}
        self.assertIn('Beto', nombres)

    # --- Lo que le contesta a quien apretó el interruptor -------------------

    def test_al_apagar_aclara_que_las_fichadas_se_siguen_guardando(self):
        datos = self._apagar(self.deposito).data

        self.assertFalse(datos['controla'])
        self.assertIn('se siguen registrando', datos['detalle'])

    def test_al_prender_una_sucursal_sin_reloj_avisa_que_falta_el_reloj(self):
        """Prender el interruptor no alcanza si no hay con qué fichar."""
        sin_reloj = Sucursal.objects.get_or_create(nombre='Central')[0]

        datos = self.cliente.patch(
            reverse('asistencia:control-sucursal', args=[sin_reloj.id]),
            {'controla': True}, format='json',
        ).data

        self.assertTrue(datos['controla'])
        self.assertFalse(datos['tiene_reloj'])
        self.assertIn('reloj', datos['detalle'])

    def test_guarda_el_motivo(self):
        self._apagar(self.deposito, motivo='Depósito sin horario fijo')

        control = ControlSucursal.objects.get(sucursal=self.deposito)
        self.assertEqual(control.motivo, 'Depósito sin horario fijo')

    # --- El listado ----------------------------------------------------------

    def test_lista_todas_las_sucursales_aunque_no_esten_configuradas(self):
        """Esconder las que no tienen fila haría parecer que el interruptor no existe."""
        filas = self.cliente.get(reverse('asistencia:control-sucursales')).data

        self.assertEqual(len(filas), Sucursal.objects.count())
        self.assertTrue(all(f['controla'] for f in filas))

    def test_el_listado_dice_si_la_sucursal_tiene_reloj(self):
        sin_reloj = Sucursal.objects.get_or_create(nombre='Central')[0]
        filas = {f['sucursal']: f for f in self.cliente.get(
            reverse('asistencia:control-sucursales')
        ).data}

        self.assertTrue(filas[self.local.id]['tiene_reloj'])
        self.assertEqual(filas[self.local.id]['relojes'], ['Reloj Salta'])
        self.assertFalse(filas[sin_reloj.id]['tiene_reloj'])

    def test_el_catalogo_separa_los_dos_motivos(self):
        """No tener reloj y estar apagada se arreglan distinto: no se mezclan."""
        Sucursal.objects.get_or_create(nombre='Central')  # sin reloj
        self._apagar(self.deposito)

        catalogo = self.cliente.get(reverse('asistencia:inconsistencias-catalogo')).data

        sin_reloj = {s['nombre'] for s in catalogo['sucursales_sin_reloj']}
        sin_control = {s['nombre'] for s in catalogo['sucursales_sin_control']}

        self.assertIn('Central', sin_reloj)
        self.assertIn('Yerba Buena', sin_control)
        self.assertNotIn('Yerba Buena', sin_reloj, 'tiene reloj: el motivo es otro')

    # --- Bordes --------------------------------------------------------------

    def test_el_calendario_tambien_deja_de_juzgar_esa_sucursal(self):
        self._apagar(self.deposito)

        respuesta = self.cliente.get(reverse('asistencia:calendario'), {'mes': '2026-08'})
        dia = next(
            d for d in respuesta.data['dias'] if d['fecha'] == LUNES.isoformat()
        )

        self.assertEqual(dia['esperados'], 1, 'solo se espera a Ana')

    def test_una_sucursal_inexistente_da_404(self):
        respuesta = self.cliente.patch(
            reverse('asistencia:control-sucursal', args=[99999]),
            {'controla': False}, format='json',
        )
        self.assertEqual(respuesta.status_code, 404)

    def test_solo_superadmin(self):
        admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)

        self.assertEqual(
            cliente.get(reverse('asistencia:control-sucursales')).status_code, 403
        )
        self.assertEqual(
            cliente.patch(
                reverse('asistencia:control-sucursal', args=[self.local.id]),
                {'controla': False}, format='json',
            ).status_code,
            403,
        )
        self.assertEqual(ControlSucursal.objects.count(), 0)


class FichadasPorSucursalTests(TestCase):
    """Ver las marcaciones de una sucursal sola.

    El backend ya sabia filtrar por reloj; por sucursal es lo que se pide en la
    practica ("mostrame lo de Salta"), porque una sucursal puede tener mas de un
    reloj y nadie se acuerda de cual es cual.
    """

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.salta = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.yb = Sucursal.objects.get_or_create(nombre='Yerba Buena')[0]
        self.sin_reloj = Sucursal.objects.get_or_create(nombre='Central')[0]

        self.reloj_salta = Dispositivo.objects.create(
            sucursal=self.salta, nombre='Reloj Salta', host='192.168.1.31'
        )
        self.reloj_yb = Dispositivo.objects.create(
            sucursal=self.yb, nombre='Reloj YB', host='192.168.2.31'
        )
        self._fichar(self.reloj_salta, 9)
        self._fichar(self.reloj_salta, 18)
        self._fichar(self.reloj_yb, 10)

    def _fichar(self, dispositivo, hora):
        momento = timezone.make_aware(datetime.combine(LUNES, time(hora, 0)))
        Fichada.objects.create(
            dispositivo=dispositivo, numero_reloj=str(hora),
            estado_mapeo=EstadoMapeo.SIN_MAPEAR,
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                dispositivo.id, '', str(hora), momento, 'unknown', 'multiple'
            ),
        )

    def _listar(self, **params):
        return self.cliente.get(reverse('asistencia:fichadas'), params).data

    def test_sin_filtro_vienen_todas(self):
        self.assertEqual(self._listar()['total'], 3)

    def test_filtra_por_sucursal(self):
        self.assertEqual(self._listar(sucursal=self.salta.id)['total'], 2)
        self.assertEqual(self._listar(sucursal=self.yb.id)['total'], 1)

    def test_una_sucursal_sin_fichadas_da_vacio_no_error(self):
        datos = self._listar(sucursal=self.sin_reloj.id)
        self.assertEqual(datos['total'], 0)
        self.assertEqual(datos['resultados'], [])

    def test_ofrece_solo_las_sucursales_que_pueden_tener_fichadas(self):
        """Una sucursal sin reloj en el desplegable es un filtro que siempre da cero."""
        nombres = [s['nombre'] for s in self._listar()['sucursales']]

        self.assertEqual(nombres, ['Salta', 'Yerba Buena'], 'ordenadas por nombre')
        self.assertNotIn('Central', nombres)

    def test_cada_reloj_dice_de_que_sucursal_es(self):
        """La UI acota los relojes a la sucursal elegida: necesita el id, no el nombre."""
        relojes = {r['nombre']: r for r in self._listar()['dispositivos']}

        self.assertEqual(relojes['Reloj Salta']['sucursal_id'], self.salta.id)
        self.assertEqual(relojes['Reloj Salta']['sucursal'], 'Salta')

    def test_el_filtro_de_sucursal_convive_con_el_de_reloj(self):
        datos = self._listar(sucursal=self.salta.id, dispositivo=self.reloj_yb.id)
        self.assertEqual(datos['total'], 0, 'reloj de otra sucursal: no hay nada en comun')

    def test_una_sucursal_inexistente_no_rompe(self):
        self.assertEqual(self._listar(sucursal=99999)['total'], 0)

    def test_sucursal_basura_se_ignora(self):
        self.assertEqual(self._listar(sucursal='hola')['total'], 3)
