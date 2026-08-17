"""Tests de Asistencia.

Cubren los criterios de aceptación del backend (spec §47 y §51): idempotencia
real en PostgreSQL/SQLite, autenticación por token de agente, config remota,
mapeo retroactivo y acceso exclusivo del superadministrador.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from empleados.models import Empleado
from inventario.models import Sucursal
from usuarios.models import Usuario

from .models import Agente, Dispositivo, EstadoMapeo, Fichada, MapeoEmpleado


def _evento(uid='uid-1', numero='145', origen='118', momento=None, tipo='check_in'):
    momento = momento or (timezone.now() - timedelta(hours=1))
    return {
        'uid': uid,
        'source_event_id': origen,
        'employee_number': numero,
        'employee_name': 'EMPLEADO',
        'occurred_at': momento.isoformat(),
        'event_type': tipo,
        'verification_method': 'face',
        'raw': {'serialNo': origen},
    }


class BaseAsistenciaTest(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        # `0002_seed_sucursales` ya siembra las sucursales reales.
        self.sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=self.sucursal, nombre='Reloj Salta', host='192.168.1.50'
        )
        self.agente = Agente(dispositivo=self.dispositivo, nombre='salta-notebook-01')
        self.token = self.agente.asignar_token()
        self.agente.save()

        self.cliente_agente = APIClient()
        self.cliente_agente.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

        self.cliente_super = APIClient()
        self.cliente_super.force_authenticate(self.superadmin)


class AutenticacionAgenteTests(BaseAsistenciaTest):
    def test_sin_token_rechaza(self):
        respuesta = APIClient().post(reverse('asistencia:agente-heartbeat'), {}, format='json')
        self.assertIn(respuesta.status_code, (401, 403))

    def test_token_invalido_rechaza(self):
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION='Bearer asist_' + 'f' * 40)
        respuesta = cliente.post(reverse('asistencia:agente-heartbeat'), {}, format='json')
        self.assertEqual(respuesta.status_code, 401)

    def test_agente_desactivado_rechaza(self):
        self.agente.activo = False
        self.agente.save()
        respuesta = self.cliente_agente.post(reverse('asistencia:agente-heartbeat'), {}, format='json')
        self.assertEqual(respuesta.status_code, 401)

    def test_jwt_de_usuario_no_sirve_para_api_de_agentes(self):
        respuesta = self.cliente_super.post(reverse('asistencia:agente-heartbeat'), {}, format='json')
        self.assertEqual(respuesta.status_code, 403)


class EventosBulkTests(BaseAsistenciaTest):
    def _mandar(self, eventos):
        return self.cliente_agente.post(
            reverse('asistencia:agente-eventos-bulk'),
            {'agent_version': '1.0.0', 'events': eventos},
            format='json',
        )

    def test_mismo_lote_dos_veces_no_duplica(self):
        """Spec §47: reenviar el lote completo deja UNA sola fichada por evento."""
        lote = [_evento('uid-1', origen='118'), _evento('uid-2', numero='23', origen='119')]
        primera = self._mandar(lote)
        self.assertEqual(primera.status_code, 200)
        self.assertEqual(primera.data['accepted'], 2)

        segunda = self._mandar(lote)
        self.assertEqual(segunda.data['accepted'], 0)
        self.assertEqual(segunda.data['duplicates'], 2)
        self.assertEqual(Fichada.objects.count(), 2)
        estados = {r['uid']: r['status'] for r in segunda.data['results']}
        self.assertEqual(estados, {'uid-1': 'duplicate', 'uid-2': 'duplicate'})

    def test_duplicado_dentro_del_mismo_lote(self):
        respuesta = self._mandar([_evento('uid-1'), _evento('uid-1b')])
        self.assertEqual(respuesta.data['accepted'], 1)
        self.assertEqual(respuesta.data['duplicates'], 1)
        self.assertEqual(Fichada.objects.count(), 1)

    def test_fecha_invalida_se_rechaza_sin_frenar_el_lote(self):
        malo = _evento('uid-malo')
        malo['occurred_at'] = 'no-es-fecha'
        respuesta = self._mandar([malo, _evento('uid-bueno', origen='200')])
        self.assertEqual(respuesta.data['accepted'], 1)
        self.assertEqual(respuesta.data['rejected'], 1)
        rechazado = next(r for r in respuesta.data['results'] if r['status'] == 'rejected')
        self.assertEqual(rechazado['uid'], 'uid-malo')
        self.assertTrue(rechazado['error'])

    def test_tipo_desconocido_degrada_sin_rechazar(self):
        raro = _evento('uid-raro', origen='300')
        raro['event_type'] = 'algoRaro'
        respuesta = self._mandar([raro])
        self.assertEqual(respuesta.data['accepted'], 1)
        self.assertEqual(Fichada.objects.get().tipo, 'unknown')

    def test_numero_desconocido_queda_sin_mapear(self):
        """Spec §17: nunca descartar una fichada de un número no mapeado."""
        self._mandar([_evento('uid-1', numero='999', origen='400')])
        fichada = Fichada.objects.get()
        self.assertIsNone(fichada.empleado)
        self.assertEqual(fichada.estado_mapeo, EstadoMapeo.SIN_MAPEAR)

    def test_numero_mapeado_asigna_empleado(self):
        empleado = Empleado.objects.create(nombre='Juan', apellido='Pérez')
        MapeoEmpleado.objects.create(
            dispositivo=self.dispositivo, numero_reloj='145', empleado=empleado
        )
        self._mandar([_evento('uid-1', numero='145', origen='500')])
        fichada = Fichada.objects.get()
        self.assertEqual(fichada.empleado, empleado)
        self.assertEqual(fichada.estado_mapeo, EstadoMapeo.MAPEADA)

    def test_mapeo_global_aplica_y_el_especifico_le_gana(self):
        global_ = Empleado.objects.create(nombre='Global')
        especifico = Empleado.objects.create(nombre='Especifico')
        MapeoEmpleado.objects.create(dispositivo=None, numero_reloj='7', empleado=global_)
        self._mandar([_evento('uid-1', numero='7', origen='600')])
        self.assertEqual(Fichada.objects.get().empleado, global_)

        MapeoEmpleado.objects.create(
            dispositivo=self.dispositivo, numero_reloj='7', empleado=especifico
        )
        self._mandar([_evento('uid-2', numero='7', origen='601')])
        self.assertEqual(Fichada.objects.get(origen_id='601').empleado, especifico)


class HeartbeatTests(BaseAsistenciaTest):
    def test_actualiza_estado_y_devuelve_config(self):
        respuesta = self.cliente_agente.post(
            reverse('asistencia:agente-heartbeat'),
            {
                'agent_version': '1.0.0',
                'hostname': 'NOTEBOOK-SALTA',
                'device_reachable': True,
                'pending_events': 3,
                'device_info': {'model': 'DS-K1A340WX', 'serial_number': 'SER123', 'firmware': 'V1.2.7'},
            },
            format='json',
        )
        self.assertEqual(respuesta.status_code, 200)
        self.assertTrue(respuesta.data['ok'])

        config = respuesta.data['config']
        self.assertEqual(config['device']['host'], '192.168.1.50')
        self.assertEqual(config['backend']['sync_seconds'], 10)
        self.assertGreater(config['version'], 0)

        self.agente.refresh_from_db()
        self.assertEqual(self.agente.hostname, 'NOTEBOOK-SALTA')
        self.assertEqual(self.agente.eventos_pendientes, 3)
        self.assertTrue(self.agente.en_linea)
        self.dispositivo.refresh_from_db()
        self.assertEqual(self.dispositivo.numero_serie, 'SER123')

    def test_heartbeat_no_cambia_la_version_de_config(self):
        version_antes = self.agente.config_remota()['version']
        self.cliente_agente.post(reverse('asistencia:agente-heartbeat'), {}, format='json')
        self.agente.refresh_from_db()
        self.assertEqual(self.agente.config_remota()['version'], version_antes)

    def test_editar_dispositivo_cambia_la_version_de_config(self):
        version_antes = self.agente.config_remota()['version']
        # La API de gestión guarda con save(), que refresca `actualizado`. Acá
        # se simula con un timestamp estrictamente posterior para no depender
        # del reloj del test (la versión se calcula en segundos enteros).
        Dispositivo.todos.filter(pk=self.dispositivo.pk).update(
            poll_seconds=45, actualizado=timezone.now() + timedelta(seconds=2)
        )
        self.agente.refresh_from_db()
        self.agente.dispositivo.refresh_from_db()
        config = self.agente.config_remota()
        self.assertGreater(config['version'], version_antes)
        self.assertEqual(config['device']['poll_seconds'], 45)


class GestionSoloSuperadminTests(BaseAsistenciaTest):
    def test_admin_comun_no_entra(self):
        cliente = APIClient()
        cliente.force_authenticate(self.admin)
        for nombre in ('asistencia:panel', 'asistencia:fichadas', 'asistencia:dispositivos',
                       'asistencia:agentes', 'asistencia:mapeos'):
            respuesta = cliente.get(reverse(nombre))
            self.assertEqual(respuesta.status_code, 403, nombre)

    def test_superadmin_entra(self):
        for nombre in ('asistencia:panel', 'asistencia:fichadas', 'asistencia:dispositivos',
                       'asistencia:agentes', 'asistencia:mapeos', 'asistencia:resumen',
                       'asistencia:numeros-sin-mapear'):
            respuesta = self.cliente_super.get(reverse(nombre))
            self.assertEqual(respuesta.status_code, 200, nombre)

    def test_crear_agente_devuelve_token_una_vez(self):
        respuesta = self.cliente_super.post(
            reverse('asistencia:agentes'),
            {'dispositivo': self.dispositivo.id, 'nombre': 'salta-notebook-02'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, 201)
        token = respuesta.data['token']
        self.assertTrue(token.startswith('asist_'))
        # El listado nunca vuelve a mostrar el token, solo el prefijo.
        listado = self.cliente_super.get(reverse('asistencia:agentes'))
        self.assertNotIn('token', listado.data[0])

        # Y el token recién creado autentica.
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(
            cliente.get(reverse('asistencia:agente-config')).status_code, 200
        )

    def test_regenerar_token_invalida_el_anterior(self):
        respuesta = self.cliente_super.post(
            reverse('asistencia:agente-regenerar-token', args=[self.agente.id])
        )
        self.assertEqual(respuesta.status_code, 200)
        nuevo = respuesta.data['token']
        self.assertNotEqual(nuevo, self.token)

        viejo = self.cliente_agente.get(reverse('asistencia:agente-config'))
        self.assertEqual(viejo.status_code, 401)
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f'Bearer {nuevo}')
        self.assertEqual(cliente.get(reverse('asistencia:agente-config')).status_code, 200)


class MapeoRetroactivoTests(BaseAsistenciaTest):
    def test_crear_mapeo_asigna_fichadas_viejas(self):
        self.cliente_agente.post(
            reverse('asistencia:agente-eventos-bulk'),
            {'events': [_evento('uid-1', numero='77', origen='700'),
                        _evento('uid-2', numero='77', origen='701')]},
            format='json',
        )
        self.assertEqual(
            Fichada.objects.filter(estado_mapeo=EstadoMapeo.SIN_MAPEAR).count(), 2
        )

        empleado = Empleado.objects.create(nombre='Nueva', apellido='Alta')
        respuesta = self.cliente_super.post(
            reverse('asistencia:mapeos'),
            {'dispositivo': self.dispositivo.id, 'numero_reloj': '77', 'empleado': empleado.id},
            format='json',
        )
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data['fichadas_actualizadas'], 2)
        self.assertEqual(
            Fichada.objects.filter(empleado=empleado, estado_mapeo=EstadoMapeo.MAPEADA).count(), 2
        )

    def test_numero_repetido_en_el_mismo_alcance_no_se_puede(self):
        empleado = Empleado.objects.create(nombre='Uno')
        MapeoEmpleado.objects.create(
            dispositivo=self.dispositivo, numero_reloj='5', empleado=empleado
        )
        respuesta = self.cliente_super.post(
            reverse('asistencia:mapeos'),
            {'dispositivo': self.dispositivo.id, 'numero_reloj': '5', 'empleado': empleado.id},
            format='json',
        )
        self.assertEqual(respuesta.status_code, 400)


class PanelYListadosTests(BaseAsistenciaTest):
    def test_panel_muestra_estado(self):
        self.cliente_agente.post(
            reverse('asistencia:agente-heartbeat'),
            {'device_reachable': True, 'pending_events': 0},
            format='json',
        )
        self.cliente_agente.post(
            reverse('asistencia:agente-eventos-bulk'),
            {'events': [_evento('uid-1', origen='800', momento=timezone.now())]},
            format='json',
        )
        panel = self.cliente_super.get(reverse('asistencia:panel'))
        self.assertEqual(panel.status_code, 200)
        equipo = panel.data['dispositivos'][0]
        self.assertTrue(equipo['en_linea'])
        self.assertTrue(equipo['reloj_en_linea'])
        self.assertEqual(equipo['fichadas_hoy'], 1)
        self.assertEqual(panel.data['totales']['agentes_en_linea'], 1)

    def test_fichadas_filtra_por_mapeo(self):
        self.cliente_agente.post(
            reverse('asistencia:agente-eventos-bulk'),
            {'events': [_evento('uid-1', origen='900')]},
            format='json',
        )
        respuesta = self.cliente_super.get(
            reverse('asistencia:fichadas'), {'mapeo': 'sin_mapear'}
        )
        self.assertEqual(respuesta.data['total'], 1)
        self.assertIn('resumen', respuesta.data)
        vacia = self.cliente_super.get(reverse('asistencia:fichadas'), {'mapeo': 'mapeada'})
        self.assertEqual(vacia.data['total'], 0)

    def test_resumen_diario(self):
        hoy = timezone.now().replace(hour=8, minute=0, second=0, microsecond=0)
        self.cliente_agente.post(
            reverse('asistencia:agente-eventos-bulk'),
            {
                'events': [
                    _evento('uid-1', origen='1000', momento=hoy, tipo='check_in'),
                    _evento('uid-2', origen='1001', momento=hoy + timedelta(hours=9), tipo='check_out'),
                ]
            },
            format='json',
        )
        respuesta = self.cliente_super.get(reverse('asistencia:resumen'))
        self.assertEqual(respuesta.status_code, 200)
        fila = respuesta.data['resultados'][0]
        self.assertEqual(fila['fichadas'], 2)
        # El reloj mando check_in/check_out reales: se emparejan en un tramo.
        self.assertEqual(fila['minutos_trabajados'], 9 * 60)
        self.assertEqual(len(fila['tramos']), 1)
        self.assertEqual(fila['salidas_parciales'], [])
