"""El dolar automatico (sigue al blue con una regla) y el historial del dolar."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import RegistroAuditoria
from productos.models import ConfiguracionProductos

from .models import (
    ConfiguracionService,
    CotizacionDolarBlue,
    HistorialDolar,
    aplicar_dolar_automatico,
    calcular_dolar_automatico,
    describir_regla,
    registrar_cambio_dolar,
)


def _respuesta_blue(compra=1500, venta=1540):
    respuesta = Mock()
    respuesta.raise_for_status.return_value = None
    respuesta.json.return_value = {
        'compra': compra, 'venta': venta, 'fechaActualizacion': '2026-10-05T12:00:00.000Z',
    }
    return respuesta


def _limpiar_cache():
    cache.delete('dolar_blue')
    cache.delete('dolar_auto_revisado')


def _historial():
    """Las filas creadas durante el test (la migracion deja una fila 'inicial')."""
    return HistorialDolar.objects.exclude(origen='inicial')


class CalculoDolarTests(TestCase):
    """La regla: referencia del blue + ajuste ($ o %) + redondeo."""

    def setUp(self):
        self.config = ConfiguracionService.obtener()

    def _regla(self, **campos):
        for campo, valor in campos.items():
            setattr(self.config, campo, valor)
        return self.config

    def test_monto_fijo_sobre_la_venta(self):
        config = self._regla(dolar_ajuste_tipo='monto', dolar_ajuste_valor=Decimal('25'))
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1555), Decimal('1580.00'))

    def test_porcentaje_sobre_la_venta(self):
        config = self._regla(dolar_ajuste_tipo='porcentaje', dolar_ajuste_valor=Decimal('2'))
        # 1555 * 1.02 = 1586.1 -> redondeo $1 -> 1586
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1555), Decimal('1586.00'))

    def test_ajuste_negativo_resta(self):
        config = self._regla(dolar_ajuste_tipo='monto', dolar_ajuste_valor=Decimal('-10'))
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1555), Decimal('1545.00'))

    def test_referencia_compra_y_promedio(self):
        config = self._regla(dolar_referencia='compra', dolar_ajuste_valor=Decimal('0'))
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1540), Decimal('1500.00'))
        config = self._regla(dolar_referencia='promedio')
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1540), Decimal('1520.00'))

    def test_redondeo_al_multiplo_mas_cercano(self):
        config = self._regla(dolar_ajuste_valor=Decimal('23'), dolar_redondeo=Decimal('5'))
        # 1555 + 23 = 1578 -> a $5 -> 1580
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1555), Decimal('1580.00'))
        config = self._regla(dolar_ajuste_valor=Decimal('21'), dolar_redondeo=Decimal('10'))
        # 1576 -> a $10 -> 1580
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1555), Decimal('1580.00'))

    def test_sin_redondeo_conserva_centavos(self):
        config = self._regla(
            dolar_ajuste_tipo='porcentaje', dolar_ajuste_valor=Decimal('2'), dolar_redondeo=Decimal('0'),
        )
        self.assertEqual(calcular_dolar_automatico(config, 1500, 1555), Decimal('1586.10'))

    def test_sin_cotizacion_no_calcula(self):
        config = self._regla(dolar_referencia='venta')
        self.assertIsNone(calcular_dolar_automatico(config, 1500, None))
        self.assertIsNone(calcular_dolar_automatico(config, None, None))

    def test_descripcion_de_la_regla(self):
        self.assertEqual(
            describir_regla(referencia='venta', ajuste_tipo='monto', ajuste_valor=Decimal('25'), redondeo=Decimal('1')),
            'blue venta + $25',
        )
        self.assertEqual(
            describir_regla(referencia='compra', ajuste_tipo='porcentaje', ajuste_valor=Decimal('-2.5'), redondeo=Decimal('10')),
            'blue compra − 2,50 %, redondeado a $10',
        )
        self.assertEqual(
            describir_regla(referencia='promedio', ajuste_tipo='monto', ajuste_valor=Decimal('0'), redondeo=Decimal('0')),
            'promedio del blue tal cual',
        )


class HistorialDolarTests(TestCase):
    """Cada cambio del dolar deja una fila con su vigencia; el mismo valor no repite."""

    def setUp(self):
        self.config = ConfiguracionService.obtener()

    def test_registrar_cierra_la_vigente_y_abre_la_nueva(self):
        primera = registrar_cambio_dolar(self.config, 1600, origen='manual')
        self.assertIsNotNone(primera)
        self.assertEqual(primera.valor_anterior, Decimal('1550'))
        self.assertIsNone(primera.vigente_hasta)
        self.assertEqual(ConfiguracionService.obtener().dolar, Decimal('1600'))

        segunda = registrar_cambio_dolar(self.config, 1620, origen='manual')
        primera.refresh_from_db()
        self.assertIsNotNone(primera.vigente_hasta)
        self.assertEqual(primera.vigente_hasta, segunda.vigente_desde)
        self.assertTrue(segunda.vigente)
        self.assertEqual(HistorialDolar.objects.filter(vigente_hasta__isnull=True).count(), 1)

    def test_el_mismo_valor_no_genera_fila(self):
        self.assertIsNone(registrar_cambio_dolar(self.config, Decimal('1550.00'), origen='manual'))
        self.assertEqual(_historial().count(), 0)

    def test_aplicar_automatico_solo_en_ese_modo(self):
        blue = {'compra': 1500, 'venta': 1555, 'fecha': None}
        self.assertIsNone(aplicar_dolar_automatico(self.config, blue))
        self.config.dolar_modo = 'automatico'
        self.config.dolar_ajuste_valor = Decimal('25')
        fila = aplicar_dolar_automatico(self.config, blue)
        self.assertEqual(fila.valor, Decimal('1580'))
        self.assertEqual(fila.origen, 'automatico')
        self.assertEqual(fila.blue_venta, Decimal('1555'))
        self.assertEqual(fila.regla_descripcion, 'blue venta + $25')
        self.assertIsNone(fila.usuario)
        self.assertIsNotNone(ConfiguracionService.obtener().dolar_calculado_en)

    def test_cambio_minimo_frena_oscilaciones_chicas(self):
        self.config.dolar_modo = 'automatico'
        self.config.dolar_cambio_minimo = Decimal('10')
        self.config.dolar_ajuste_valor = Decimal('0')
        # 1555 vs 1550: cambia 5, menos que el minimo -> no se toca.
        self.assertIsNone(aplicar_dolar_automatico(self.config, {'compra': 1500, 'venta': 1555}))
        self.assertEqual(ConfiguracionService.obtener().dolar, Decimal('1550'))
        # 1565: cambia 15 -> si.
        fila = aplicar_dolar_automatico(self.config, {'compra': 1500, 'venta': 1565})
        self.assertEqual(fila.valor, Decimal('1565'))


class DolarAutomaticoApiTests(TestCase):
    """El gestor: fijar a mano, activar la regla, y que el blue lo recalcule."""

    CONFIG = '/api/precios-service/configuracion/'
    BLUE = '/api/precios-service/dolar-blue/'
    HISTORIAL = '/api/precios-service/dolar/historial/'

    def setUp(self):
        _limpiar_cache()
        from usuarios.models import Usuario
        self.admin = Usuario.objects.create_superuser(
            email='dolar@celtuc.test', username='dolar', password='x',
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.admin)

    def tearDown(self):
        _limpiar_cache()

    def test_fijar_a_mano_queda_en_el_historial_con_usuario(self):
        r = self.cliente.patch(self.CONFIG, {'dolar': 1600, 'dolar_nota': 'subio el blue'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['dolar'], Decimal('1600'))
        fila = _historial().get()
        self.assertEqual(fila.origen, 'manual')
        self.assertEqual(fila.usuario_username, 'dolar')
        self.assertEqual(fila.nota, 'subio el blue')
        # Y la auditoria lo registra como edicion de la cuenta, como siempre.
        self.assertTrue(
            RegistroAuditoria.objects.filter(accion='editar', modelo='configuracion de service').exists()
        )

    @patch('precios_service.dolar.requests.get')
    def test_activar_automatico_calcula_al_instante(self, mock_get):
        mock_get.return_value = _respuesta_blue(compra=1500, venta=1555)
        r = self.cliente.patch(self.CONFIG, {
            'dolar_modo': 'automatico', 'dolar_ajuste_tipo': 'monto', 'dolar_ajuste_valor': 25,
            'dolar_redondeo': 5,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['dolar'], Decimal('1580'))
        self.assertEqual(r.data['dolar_modo'], 'automatico')
        self.assertEqual(r.data['dolar_regla'], 'blue venta + $25, redondeado a $5')
        fila = _historial().get()
        self.assertEqual(fila.origen, 'automatico')
        self.assertEqual(fila.blue_venta, Decimal('1555'))

    @patch('precios_service.dolar.requests.get')
    def test_en_automatico_no_se_acepta_un_dolar_suelto(self, mock_get):
        mock_get.return_value = _respuesta_blue()
        self.cliente.patch(self.CONFIG, {'dolar_modo': 'automatico'}, format='json')
        r = self.cliente.patch(self.CONFIG, {'dolar': 1700}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('automático', str(r.data['dolar']))
        # Pasar a manual CON el valor, en la misma peticion, si vale.
        r = self.cliente.patch(self.CONFIG, {'dolar_modo': 'manual', 'dolar': 1700}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['dolar'], Decimal('1700'))
        self.assertEqual(HistorialDolar.objects.filter(vigente_hasta__isnull=True).get().origen, 'manual')

    @patch('precios_service.dolar.requests.get')
    def test_consultar_el_blue_recalcula_en_automatico(self, mock_get):
        mock_get.return_value = _respuesta_blue(compra=1500, venta=1555)
        self.cliente.patch(self.CONFIG, {'dolar_modo': 'automatico', 'dolar_ajuste_valor': 25}, format='json')
        self.assertEqual(ConfiguracionService.obtener().dolar, Decimal('1580'))
        # El blue sube: la proxima consulta (cache vencida) mueve el dolar.
        _limpiar_cache()
        mock_get.return_value = _respuesta_blue(compra=1520, venta=1575)
        r = self.cliente.get(self.BLUE)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(ConfiguracionService.obtener().dolar, Decimal('1600'))
        self.assertEqual(_historial().count(), 2)
        # Un recalculo automatico NO queda en la auditoria como accion de la cuenta.
        self.assertFalse(
            RegistroAuditoria.objects.filter(
                accion='editar', modelo='configuracion de service', cambios__has_key='dolar service',
            ).exists()
        )

    @patch('precios_service.dolar.requests.get')
    def test_listar_productos_mantiene_el_dolar_al_dia(self, mock_get):
        mock_get.return_value = _respuesta_blue(compra=1500, venta=1555)
        self.cliente.patch(self.CONFIG, {'dolar_modo': 'automatico', 'dolar_ajuste_valor': 25}, format='json')
        _limpiar_cache()
        mock_get.return_value = _respuesta_blue(compra=1520, venta=1575)
        r = self.cliente.get('/api/productos/items/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(ConfiguracionService.obtener().dolar, Decimal('1600'))
        # Revisado hace un instante: el siguiente listado no vuelve a la API.
        llamadas = mock_get.call_count
        self.cliente.get('/api/productos/items/')
        self.assertEqual(mock_get.call_count, llamadas)

    @patch('precios_service.dolar.requests.get')
    def test_en_manual_listar_no_toca_la_red(self, mock_get):
        self.cliente.get('/api/productos/items/')
        self.cliente.get(self.CONFIG)
        self.assertEqual(mock_get.call_count, 0)

    @patch('precios_service.dolar.requests.get', side_effect=requests.ConnectionError)
    def test_si_dolarapi_cae_el_dolar_queda_como_estaba(self, _mock):
        r = self.cliente.patch(self.CONFIG, {'dolar_modo': 'automatico', 'dolar_ajuste_valor': 25}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['dolar'], Decimal('1550'))
        self.assertEqual(_historial().count(), 0)
        # Con un respaldo guardado, se usa ese.
        CotizacionDolarBlue.guardar(1500, 1555, '2026-10-05T12:00:00Z')
        r = self.cliente.patch(self.CONFIG, {'dolar_ajuste_valor': 30}, format='json')
        self.assertEqual(r.data['dolar'], Decimal('1585'))

    def test_el_dolar_desde_productos_tambien_pasa_por_el_historial(self):
        ConfiguracionProductos.obtener()
        r = self.cliente.patch('/api/productos/configuracion/', {'dolar': 1650}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(ConfiguracionService.obtener().dolar, Decimal('1650'))
        self.assertEqual(_historial().get().origen, 'manual')

    @patch('precios_service.dolar.requests.get')
    def test_desde_productos_en_automatico_se_rechaza(self, mock_get):
        mock_get.return_value = _respuesta_blue()
        self.cliente.patch(self.CONFIG, {'dolar_modo': 'automatico'}, format='json')
        r = self.cliente.patch('/api/productos/configuracion/', {'dolar': 1650}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_historial_con_filtros_y_limite(self):
        config = ConfiguracionService.obtener()
        vieja = registrar_cambio_dolar(config, 1600, origen='manual', usuario=self.admin)
        hace_dias = timezone.now() - timedelta(days=10)
        HistorialDolar.objects.filter(pk=vieja.pk).update(
            vigente_desde=hace_dias, vigente_hasta=hace_dias + timedelta(days=2),
        )
        registrar_cambio_dolar(config, 1620, origen='manual', usuario=self.admin)

        r = self.cliente.get(self.HISTORIAL)
        self.assertEqual(r.status_code, 200)
        # 2 del test + la fila inicial que dejo la migracion (cerrada al primer cambio).
        self.assertEqual(r.data['total'], 3)
        self.assertEqual(r.data['items'][0]['valor'], Decimal('1620'))
        self.assertTrue(r.data['items'][0]['vigente'])
        self.assertEqual(r.data['items'][0]['usuario'], 'dolar')

        hoy = timezone.localdate().isoformat()
        r = self.cliente.get(self.HISTORIAL, {'desde': hoy})
        # La vieja (hace 10 dias) queda afuera; la inicial estuvo vigente hoy hasta el primer cambio.
        self.assertEqual([i['valor'] for i in r.data['items']], [Decimal('1620'), Decimal('1550')])

        hace_9 = (timezone.localdate() - timedelta(days=9)).isoformat()
        r = self.cliente.get(self.HISTORIAL, {'hasta': hace_9})
        self.assertEqual([i['valor'] for i in r.data['items']], [Decimal('1600')])

        r = self.cliente.get(self.HISTORIAL, {'limite': 1})
        self.assertEqual(len(r.data['items']), 1)
        self.assertEqual(r.data['total'], 3)

    def test_la_migracion_dejo_el_valor_inicial_en_el_historial(self):
        inicial = HistorialDolar.objects.get(origen='inicial')
        self.assertEqual(inicial.valor, Decimal('1550'))
        self.assertTrue(inicial.vigente)

    def test_historial_requiere_permiso(self):
        self.assertEqual(APIClient().get(self.HISTORIAL).status_code, 401)


class ReconstruccionHistorialTests(TestCase):
    """La migracion 0009 arma el historial previo con lo que ya auditaba el sistema."""

    def _reconstruir(self):
        from importlib import import_module

        from django.apps import apps

        migracion = import_module('precios_service.migrations.0009_dolar_automatico_e_historial')
        HistorialDolar.objects.all().delete()
        migracion.reconstruir_historial(apps, None)
        return list(HistorialDolar.objects.order_by('vigente_desde'))

    def _auditar(self, antes, despues, cuando, usuario):
        return RegistroAuditoria.objects.create(
            usuario=usuario,
            usuario_username=usuario.username,
            accion='editar',
            app='precios_service',
            modelo='configuracion de service',
            objeto_id='1',
            objeto='config',
            cambios={'dolar service': {'antes': antes, 'despues': despues}},
            creado=cuando,
        )

    def test_sin_auditoria_queda_una_fila_inicial(self):
        filas = self._reconstruir()
        self.assertEqual(len(filas), 1)
        self.assertEqual((filas[0].valor, filas[0].origen), (Decimal('1550'), 'inicial'))
        self.assertTrue(filas[0].vigente)

    def test_con_auditoria_encadena_los_cambios_con_usuario_y_fechas(self):
        from usuarios.models import Usuario

        juan = Usuario.objects.create_user(email='juan@celtuc.test', username='juan', password='x')
        ahora = timezone.now()
        hace_20 = ahora - timedelta(days=20)
        hace_5 = ahora - timedelta(days=5)
        self._auditar('1500.00', '1600.00', hace_20, juan)
        self._auditar('1600.00', '1550.00', hace_5, juan)  # 1550 = el valor actual

        filas = self._reconstruir()
        self.assertEqual([f.valor for f in filas], [Decimal('1500'), Decimal('1600'), Decimal('1550')])
        self.assertEqual([f.origen for f in filas], ['inicial', 'manual', 'manual'])
        self.assertEqual(filas[1].usuario_username, 'juan')
        self.assertEqual(filas[1].vigente_desde, hace_20)
        self.assertEqual(filas[1].vigente_hasta, hace_5)
        self.assertEqual(filas[0].vigente_hasta, hace_20)
        self.assertTrue(filas[2].vigente)
        self.assertEqual(filas[2].valor_anterior, Decimal('1600'))

    def test_si_el_valor_actual_no_coincide_con_la_auditoria_se_agrega_al_final(self):
        from usuarios.models import Usuario

        juan = Usuario.objects.create_user(email='juan2@celtuc.test', username='juan2', password='x')
        self._auditar('1500.00', '1600.00', timezone.now() - timedelta(days=3), juan)
        # El dolar vigente (1550) no es el ultimo auditado (1600): cambio por fuera.
        filas = self._reconstruir()
        self.assertEqual([f.valor for f in filas], [Decimal('1500'), Decimal('1600'), Decimal('1550')])
        self.assertTrue(filas[-1].vigente)
        self.assertEqual(HistorialDolar.objects.filter(vigente_hasta__isnull=True).count(), 1)
        # Las vigencias nunca se superponen ni retroceden.
        for anterior, siguiente in zip(filas, filas[1:]):
            self.assertEqual(anterior.vigente_hasta, siguiente.vigente_desde)
            self.assertLess(anterior.vigente_desde, siguiente.vigente_desde)
