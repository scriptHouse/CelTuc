from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    ConfiguracionService,
    CotizacionDolarBlue,
    Dispositivo,
    ItemService,
    PrecioItemService,
    SeccionService,
    VarianteSeccion,
    resolver_precios,
)
from .serializers import ItemServiceSerializer, SeccionServiceSerializer


class DerivacionPreciosTests(TestCase):
    """Las reglas de la planilla, verificadas contra celdas reales del Excel."""

    def setUp(self):
        self.config = ConfiguracionService.obtener()  # dolar 1550, cash 20 %, redondeo 1000
        self.seccion = SeccionService.objects.create(nombre='Prueba')
        self.variante = VarianteSeccion.objects.create(seccion=self.seccion, nombre='Estándar')
        self.item = ItemService.objects.create(seccion=self.seccion, etiqueta='X')

    def _precio(self, **kwargs):
        return PrecioItemService.objects.create(item=self.item, variante=self.variante, **kwargs)

    def test_derivacion_completa_desde_lista_usd(self):
        # DIAGNOSTICO HASTA LINEA 11: 20.4 -> 16.32 / 32000 / 26000 en la hoja.
        precio = self._precio(precio_lista_usd=Decimal('20.4'))
        efectivo = resolver_precios(precio, self.config)
        self.assertEqual(efectivo['cash_usd'], Decimal('16.32'))
        self.assertEqual(efectivo['lista_ars'], Decimal('32000'))   # ceil(31620)
        self.assertEqual(efectivo['cash_ars'], Decimal('26000'))    # ceil(25600)

    def test_redondeo_ars_siempre_para_arriba(self):
        # REPARACION DE PLACA 7/7+: 102 -> 159000 (158100 redondea ARRIBA).
        precio = self._precio(precio_lista_usd=Decimal('102'))
        efectivo = resolver_precios(precio, self.config)
        self.assertEqual(efectivo['lista_ars'], Decimal('159000'))
        self.assertEqual(efectivo['cash_ars'], Decimal('128000'))   # ceil(127200)

    def test_overrides_pisan_la_formula(self):
        # BATERIAS 11: cash USD retocado a mano (51, no 70*0.8=56).
        precio = self._precio(precio_lista_usd=Decimal('70'), precio_cash_usd=Decimal('51'))
        efectivo = resolver_precios(precio, self.config)
        self.assertEqual(efectivo['cash_usd'], Decimal('51'))
        # Los ARS siguen derivando de la lista USD (109000 -> 88000), no del cash.
        self.assertEqual(efectivo['lista_ars'], Decimal('109000'))
        self.assertEqual(efectivo['cash_ars'], Decimal('88000'))

    def test_descuento_propio_de_la_seccion(self):
        # TAPA TRASERA con promo 30 %: 71.4 -> lista 111000 -> cash 78000.
        precio = self._precio(precio_lista_usd=Decimal('71.4'))
        efectivo = resolver_precios(precio, self.config, descuento_pct=Decimal('30'))
        self.assertEqual(efectivo['lista_ars'], Decimal('111000'))
        self.assertEqual(efectivo['cash_ars'], Decimal('78000'))    # ceil(77700)

    def test_variante_solo_en_pesos(self):
        # BATERIA "reconoce como original": sin USD, ambos $ cargados a mano.
        precio = self._precio(
            precio_lista_ars=Decimal('180000'), precio_cash_ars=Decimal('152000'),
        )
        efectivo = resolver_precios(precio, self.config)
        self.assertIsNone(efectivo['lista_usd'])
        self.assertIsNone(efectivo['cash_usd'])
        self.assertEqual(efectivo['lista_ars'], Decimal('180000'))
        self.assertEqual(efectivo['cash_ars'], Decimal('152000'))

    def test_cambiar_el_dolar_recalcula(self):
        precio = self._precio(precio_lista_usd=Decimal('100'))
        self.config.dolar = Decimal('2000')
        efectivo = resolver_precios(precio, self.config)
        self.assertEqual(efectivo['lista_ars'], Decimal('200000'))


class DolarBlueTests(TestCase):
    """El proxy a DolarAPI: cachea, mapea los campos y falla con gracia."""

    URL = '/api/precios-service/dolar-blue/'

    def setUp(self):
        cache.delete('dolar_blue')
        from usuarios.models import Usuario
        self.cliente = APIClient()
        self.cliente.force_authenticate(
            Usuario.objects.create_superuser(email='blue@celtuc.test', username='blue', password='x'),
        )

    def _respuesta_ok(self):
        respuesta = Mock()
        respuesta.raise_for_status.return_value = None
        respuesta.json.return_value = {
            'compra': 1500, 'venta': 1540, 'fechaActualizacion': '2026-07-04T12:00:00.000Z',
        }
        return respuesta

    @patch('precios_service.views.requests.get')
    def test_devuelve_la_cotizacion_y_cachea(self, mock_get):
        mock_get.return_value = self._respuesta_ok()
        r = self.cliente.get(self.URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['venta'], 1540)
        self.assertEqual(r.data['compra'], 1500)
        self.assertFalse(r.data['desactualizado'])
        # Segunda consulta: sale de la cache, sin pegarle de nuevo a DolarAPI.
        self.cliente.get(self.URL)
        self.assertEqual(mock_get.call_count, 1)

    @patch('precios_service.views.requests.get')
    def test_guarda_la_cotizacion_en_base_de_datos(self, mock_get):
        mock_get.return_value = self._respuesta_ok()
        self.cliente.get(self.URL)
        fila = CotizacionDolarBlue.ultima()
        self.assertIsNotNone(fila)
        self.assertEqual(fila.venta, Decimal('1540'))
        self.assertEqual(fila.compra, Decimal('1500'))
        self.assertEqual(fila.fecha.isoformat(), '2026-07-04T12:00:00+00:00')

    @patch('precios_service.views.requests.get')
    def test_si_dolarapi_cae_devuelve_la_ultima_guardada(self, mock_get):
        # Primera consulta OK: queda guardada en la base.
        mock_get.return_value = self._respuesta_ok()
        self.cliente.get(self.URL)
        cache.delete('dolar_blue')
        # DolarAPI se cae: se responde la guardada, marcada como desactualizada.
        mock_get.side_effect = requests.ConnectionError
        r = self.cliente.get(self.URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(float(r.data['venta']), 1540)
        self.assertEqual(float(r.data['compra']), 1500)
        self.assertTrue(r.data['desactualizado'])
        self.assertIsNotNone(r.data['guardado'])
        # El respaldo NO se cachea: la proxima consulta reintenta contra la API.
        self.assertIsNone(cache.get('dolar_blue'))

    @patch('precios_service.views.requests.get', side_effect=requests.ConnectionError)
    def test_si_no_responde_y_no_hay_guardada_503_legible(self, _mock):
        r = self.cliente.get(self.URL)
        self.assertEqual(r.status_code, 503)
        self.assertIn('DolarAPI', r.data['detail'])

    def test_requiere_autenticacion(self):
        self.assertEqual(APIClient().get(self.URL).status_code, 401)


class SeccionSerializerTests(TestCase):
    def test_reemplazo_de_variantes_conserva_ids_y_precios(self):
        seccion = SeccionService.objects.create(nombre='Módulos')
        lcd = VarianteSeccion.objects.create(seccion=seccion, nombre='LCD', orden=0)
        oled = VarianteSeccion.objects.create(seccion=seccion, nombre='OLED', orden=1)
        item = ItemService.objects.create(seccion=seccion, etiqueta='13')
        PrecioItemService.objects.create(item=item, variante=lcd, precio_lista_usd=100)
        PrecioItemService.objects.create(item=item, variante=oled, precio_lista_usd=200)

        # Renombrar LCD (mismo id), quitar OLED y agregar una nueva.
        serializer = SeccionServiceSerializer(seccion, data={'variantes': [
            {'id': lcd.id, 'nombre': 'Certificada (LCD)'},
            {'nombre': 'Apple Original'},
        ]}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        lcd.refresh_from_db()
        self.assertEqual(lcd.nombre, 'Certificada (LCD)')
        # El precio contra LCD sobrevive; el de OLED cayo con su variante.
        self.assertEqual(item.precios.count(), 1)
        self.assertEqual(item.precios.first().variante_id, lcd.id)
        self.assertEqual(seccion.variantes.count(), 2)

    def test_crear_seccion_sin_variantes_crea_estandar(self):
        serializer = SeccionServiceSerializer(data={'nombre': 'Parlantes'})
        serializer.is_valid(raise_exception=True)
        seccion = serializer.save()
        self.assertEqual(seccion.variantes.count(), 1)


class ItemSerializerTests(TestCase):
    def setUp(self):
        self.config = ConfiguracionService.obtener()
        self.seccion = SeccionService.objects.create(nombre='Flex de carga')
        self.variante = VarianteSeccion.objects.create(seccion=self.seccion, nombre='Estándar')

    def test_guardar_item_con_precios_y_efectivo(self):
        serializer = ItemServiceSerializer(
            data={
                'seccion': self.seccion.id,
                'etiqueta': '13 PRO',
                'precios': [{'variante': self.variante.id, 'precio_lista_usd': 112.2}],
            },
            context={'config': self.config},
        )
        serializer.is_valid(raise_exception=True)
        item = serializer.save()

        data = ItemServiceSerializer(item, context={'config': self.config}).data
        efectivo = data['precios'][0]['efectivo']
        self.assertEqual(efectivo['cash_usd'], Decimal('89.76'))
        self.assertEqual(efectivo['lista_ars'], Decimal('174000'))
        self.assertEqual(efectivo['cash_ars'], Decimal('140000'))

    def test_variante_de_otra_seccion_invalida(self):
        otra = SeccionService.objects.create(nombre='Otra')
        ajena = VarianteSeccion.objects.create(seccion=otra, nombre='Estándar')
        serializer = ItemServiceSerializer(data={
            'seccion': self.seccion.id,
            'etiqueta': 'X',
            'precios': [{'variante': ajena.id, 'precio_lista_usd': 10}],
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('precios', serializer.errors)


class SeedExcelTests(TestCase):
    """La migracion de seed carga la hoja "Precios Service" tal cual."""

    def test_config_y_secciones_sembradas(self):
        config = ConfiguracionService.obtener()
        self.assertEqual(config.dolar, Decimal('1550'))
        self.assertGreaterEqual(SeccionService.objects.count(), 13)

    def test_baterias_con_dos_variantes_y_overrides(self):
        baterias = SeccionService.objects.get(nombre__iexact='Baterías')
        self.assertEqual(baterias.variantes.count(), 2)
        once = baterias.items.get(etiqueta='iPhone 11')
        normal = once.precios.get(variante__orden=0)
        # Cash USD retocado a mano en la hoja (51 y no 70*0.8=56): override.
        self.assertEqual(normal.precio_lista_usd, Decimal('70'))
        self.assertEqual(normal.precio_cash_usd, Decimal('51'))

    def test_reparaciones_derivadas_sin_overrides(self):
        reparaciones = SeccionService.objects.get(nombre__iexact='Reparaciones generales')
        diagnostico = reparaciones.items.get(etiqueta__startswith='Diagnóstico hasta línea 11')
        precio = diagnostico.precios.first()
        self.assertEqual(precio.precio_lista_usd, Decimal('20.4'))
        # Todo lo demas sale de la formula: no hace falta override.
        self.assertIsNone(precio.precio_cash_usd)
        self.assertIsNone(precio.precio_lista_ars)
        self.assertIsNone(precio.precio_cash_ars)

    def test_tapa_trasera_con_promo_30(self):
        tapa = SeccionService.objects.get(nombre__istartswith='Tapa trasera')
        self.assertEqual(tapa.descuento_cash_pct, Decimal('30'))

    def test_modulos_tres_variantes(self):
        modulos = SeccionService.objects.get(nombre__iexact='Módulos')
        self.assertEqual(modulos.variantes.count(), 3)
        # 13 PRO en Apple Original: 410 USD (celda D73 de la hoja).
        item = modulos.items.get(etiqueta='iPhone 13 Pro')
        ao = item.precios.get(variante__nombre__icontains='Apple Original')
        self.assertEqual(ao.precio_lista_usd, Decimal('410'))


class SeedDispositivosTests(TestCase):
    """El mapeo item -> equipos sembrado desde las etiquetas de la hoja."""

    def test_catalogo_sembrado(self):
        self.assertEqual(Dispositivo.objects.count(), 46)

    def test_linea_expande_a_la_familia(self):
        item = ItemService.objects.get(
            seccion__nombre='Reparación de Face ID', etiqueta='Línea 11',
        )
        nombres = set(item.dispositivos.values_list('nombre', flat=True))
        self.assertEqual(nombres, {'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max'})

    def test_hasta_linea_incluye_los_se_de_la_epoca(self):
        item = ItemService.objects.get(etiqueta__startswith='Baño químico hasta línea 11')
        nombres = set(item.dispositivos.values_list('nombre', flat=True))
        for esperado in ('iPhone 6', 'iPhone 7 Plus', 'iPhone SE 2016', 'iPhone SE 2020',
                         'iPhone XR', 'iPhone 11 Pro Max'):
            self.assertIn(esperado, nombres)
        self.assertNotIn('iPhone 12', nombres)
        self.assertNotIn('iPhone SE 2022', nombres)  # es de la era 13

    def test_software_iphone_aplica_a_todos(self):
        item = ItemService.objects.get(etiqueta__startswith='Software iPhone')
        self.assertEqual(item.dispositivos.count(), 43)  # todos los iPhone
        self.assertFalse(item.dispositivos.filter(nombre='iPad').exists())

    def test_watch_y_grupos_con_barra(self):
        watch = SeccionService.objects.get(nombre__startswith='Módulo Apple Watch')
        for item in watch.items.all():
            self.assertEqual(
                list(item.dispositivos.values_list('nombre', flat=True)), ['Apple Watch'],
            )
        tapa = ItemService.objects.get(
            seccion__nombre='Tapa trasera', etiqueta='iPhone 11 Pro / 11 Pro Max',
        )
        self.assertEqual(tapa.dispositivos.count(), 2)

    def test_perfil_completo_de_un_equipo(self):
        # El caso de uso del selector: elegir iPhone 11 Pro trae su perfil entero.
        once_pro = Dispositivo.objects.get(nombre='iPhone 11 Pro')
        secciones = set(once_pro.items.values_list('seccion__nombre', flat=True))
        for esperada in ('Baterías', 'Módulos', 'Reparación de Face ID',
                         'Reparaciones generales', 'Cámara trasera', 'Tapa trasera'):
            self.assertIn(esperada, secciones)

    def test_item_serializer_reemplaza_dispositivos(self):
        seccion = SeccionService.objects.get(nombre='Tapa trasera')
        item = seccion.items.get(etiqueta='iPhone 11')
        nuevo = Dispositivo.objects.get(nombre='iPhone 12')
        serializer = ItemServiceSerializer(
            item, data={'dispositivos': [nuevo.id]}, partial=True,
            context={'config': ConfiguracionService.obtener()},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self.assertEqual(
            list(item.dispositivos.values_list('nombre', flat=True)), ['iPhone 12'],
        )
        # El PATCH parcial no toco los precios.
        self.assertEqual(item.precios.count(), 1)
