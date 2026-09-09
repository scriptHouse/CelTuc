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


# ===== Importacion de la lista de precios =====

def _lista(filas, encabezado=None, titulo=True, grupo=None, totales=True, hoja_extra=True):
    """Un .xlsx con la forma EXACTA del que baja «Exportar».

    `filas` son tuplas (item, seccion, variante, lista_usd, lista_ars, cash_ars)
    o las columnas que diga `encabezado`. Con `grupo` se antepone el renglon de
    seccion combinado que escribe el exportador ("Baterías  (3)").
    """
    import io

    import openpyxl

    libro = openpyxl.Workbook()
    hoja = libro.active
    hoja.title = 'Precios de service'
    if titulo:
        # Las cuatro filas de cortesia que el exportador deja arriba.
        hoja.append(['Precios de service'])
        hoja.append([''])
        hoja.append(['Generado el 08/09/2026, 02:14 por nicolas · 35 filas'])
        hoja.append(['Filtros: Sección: Baterías'])
        hoja.append([])
    hoja.append(encabezado or ['Ítem', 'Sección', 'Variante', 'Lista USD', 'Lista $', 'Cash $'])
    if grupo:
        hoja.append([f'{grupo}  ({len(filas)})'])
    for fila in filas:
        hoja.append(list(fila))
    if totales:
        hoja.append([f'Subtotal {grupo or "Todo"}'])
        hoja.append([])
        hoja.append([f'TOTAL · {len(filas)} filas'])
    if hoja_extra:
        otra = libro.create_sheet('Cómo se generó')
        otra.append(['Cómo se generó este archivo'])
        otra.append(['Título', 'Precios de service'])
        otra.append(['Columnas', 'Ítem · Sección · Variante · Lista USD'])
    buffer = io.BytesIO()
    libro.save(buffer)
    buffer.seek(0)
    buffer.name = 'service-2026-09-08.xlsx'
    return buffer


class ImportarListaServiceTests(TestCase):
    """Leer la lista: el archivo del exportador tiene que volver a entrar."""

    def setUp(self):
        from .importacion import analizar

        self.analizar = analizar
        self.config = ConfiguracionService.obtener()  # dolar 1550, cash 20 %, redondeo 1000
        self.seccion = SeccionService.objects.create(nombre='Baterías Zeta')
        self.simple = VarianteSeccion.objects.create(seccion=self.seccion, nombre='Estándar')
        self.item = ItemService.objects.create(seccion=self.seccion, etiqueta='Zeta iPhone 11')
        self.precio = PrecioItemService.objects.create(
            item=self.item, variante=self.simple, precio_lista_usd=Decimal('70'),
        )

    def _filas(self, archivo, **kwargs):
        return {f['fila']: f for f in self.analizar(archivo, **kwargs)['filas']}

    # --- lectura del formato del exportador ---

    def test_saltea_titulo_grupo_subtotal_y_total(self):
        """Arriba hay titulo y filtros, y abajo subtotales: nada de eso es un precio."""
        res = self.analizar(_lista(
            [('Zeta iPhone 11', 'Baterías Zeta', '', 70, 109000, 88000)],
            grupo='Baterías Zeta',
        ))
        self.assertEqual(res['resumen']['filas'], 1)
        self.assertEqual(res['filas'][0]['etiqueta'], 'Zeta iPhone 11')
        self.assertEqual(res['columnas']['hoja'], 'Precios de service')
        self.assertEqual(res['columnas']['fila'], 6)

    def test_el_ida_y_vuelta_no_cambia_nada(self):
        """Bajar la lista y volver a subirla sin tocarla no cambia un peso."""
        res = self.analizar(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', 70, 109000, 88000),
        ]))
        fila = res['filas'][0]
        self.assertEqual(fila['estado'], 'igual')
        self.assertIsNone(fila['opciones'][0]['precio']['aplicar'])
        self.assertEqual(res['resumen']['actualiza'], 0)

    def test_el_precio_editado_a_mano_entra(self):
        filas = self._filas(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', 85, 109000, 88000),
        ]))
        fila = filas[7]
        self.assertEqual(fila['estado'], 'actualiza')
        opcion = fila['opciones'][0]
        self.assertEqual(opcion['precio']['aplicar'], {'precio_lista_usd': '85.00'})
        # Los pesos se recalculan solos: 85 x 1550 redondeado al millar.
        self.assertEqual(opcion['precio']['despues']['lista_ars'], '132000')

    def test_la_seccion_sale_del_renglon_de_grupo(self):
        """Si no se exporto la columna Sección, la dice el renglon del grupo."""
        res = self.analizar(_lista(
            [('Zeta iPhone 11', '', 85, 109000)],
            encabezado=['Ítem', 'Variante', 'Lista USD', 'Lista $'],
            grupo='Baterías Zeta',
        ))
        fila = res['filas'][0]
        self.assertTrue(fila['seccion_de_grupo'])
        self.assertEqual(fila['seccion_nombre'], 'Baterías Zeta')
        self.assertEqual(fila['estado'], 'actualiza')

    def test_una_fila_con_el_nombre_solo_no_abre_una_seccion(self):
        """Sin el "(N)" no es un renglon de grupo: es una fila sin precio. Si se
        tomara como seccion, todo lo de abajo se buscaria en una que no existe."""
        res = self.analizar(_lista(
            [('Zeta iPhone 11', '', ''), ('Zeta iPhone 11', 'Baterías Zeta', 85)],
            encabezado=['Ítem', 'Sección', 'Lista USD'],
            grupo='Baterías Zeta',
        ))
        estados = [f['estado'] for f in res['filas']]
        self.assertEqual(estados, ['sin_valor', 'actualiza'])

    def test_columnas_de_mas_y_de_menos(self):
        """Alcanza con el ítem y un precio; lo que sobra se ignora."""
        res = self.analizar(_lista(
            [('Zeta iPhone 11', 85, 'lo que sea')],
            encabezado=['Ítem', 'Lista USD', 'Comentario interno'],
        ))
        self.assertEqual(res['filas'][0]['estado'], 'actualiza')
        self.assertEqual(res['columnas']['detectadas']['lista_usd'], 1)
        self.assertIsNone(res['columnas']['detectadas']['seccion'])

    def test_rotulos_que_no_son_los_del_exportador(self):
        """"PRECIO DE LISTA EN DOLARES" tambien se entiende."""
        res = self.analizar(_lista(
            [('Zeta iPhone 11', 85)],
            encabezado=['MODELO', 'PRECIO DE LISTA EN DOLARES'],
        ))
        self.assertEqual(res['columnas']['detectadas']['etiqueta'], 0)
        self.assertEqual(res['columnas']['detectadas']['lista_usd'], 1)
        self.assertEqual(res['filas'][0]['estado'], 'actualiza')

    def test_sin_encabezado_reconocible_error_legible(self):
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError) as ctx:
            self.analizar(_lista([('x', 'y')], encabezado=['Una cosa', 'Otra']))
        self.assertIn('Ítem', ' '.join(ctx.exception.messages))

    def test_se_puede_elegir_otra_columna_a_mano(self):
        """La valvula: si el lector agarro la columna equivocada, se le dice."""
        res = self.analizar(
            _lista([('Zeta iPhone 11', 999, 85)], encabezado=['Ítem', 'Lista USD', 'Otra']),
            columnas={'lista_usd': 2},
        )
        self.assertEqual(
            res['filas'][0]['opciones'][0]['precio']['aplicar'],
            {'precio_lista_usd': '85.00'},
        )

    # --- los pesos ---

    def test_los_pesos_no_se_importan_por_defecto(self):
        """La planilla vieja trae pesos de otro dolar: importarlos los congelaria."""
        filas = self._filas(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', 70, 999000, 800000),
        ]))
        fila = filas[7]
        self.assertEqual(fila['estado'], 'igual')
        self.assertEqual(fila['opciones'][0]['precio']['ignorados'], ['lista_ars', 'cash_ars'])
        self.assertEqual(self.analizar(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', 70, 999000, 800000),
        ]))['resumen']['pesos_ignorados'], 1)

    def test_los_pesos_entran_si_se_piden(self):
        filas = self._filas(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', 70, 999000, 800000),
        ]), con_pesos=True)
        aplicar = filas[7]['opciones'][0]['precio']['aplicar']
        self.assertEqual(aplicar['precio_lista_ars'], '999000.00')
        self.assertIn('lista_ars', filas[7]['opciones'][0]['precio']['fijados'])

    def test_la_fila_que_solo_tiene_pesos_los_importa_igual(self):
        """Sin precio en dolares, los pesos son el UNICO precio que hay."""
        solo_pesos = ItemService.objects.create(
            seccion=self.seccion, etiqueta='Zeta solo pesos',
        )
        PrecioItemService.objects.create(item=solo_pesos, variante=self.simple)
        filas = self._filas(_lista([
            ('Zeta solo pesos', 'Baterías Zeta', '', None, 150000, None),
        ]))
        aplicar = filas[7]['opciones'][0]['precio']['aplicar']
        self.assertEqual(aplicar['precio_lista_ars'], '150000.00')

    def test_deduce_el_dolar_con_el_que_se_armo_la_planilla(self):
        """No viene escrito: se deduce de los pesos para poder avisar."""
        for etiqueta in ('Zeta A', 'Zeta B', 'Zeta C'):
            item = ItemService.objects.create(seccion=self.seccion, etiqueta=etiqueta)
            PrecioItemService.objects.create(item=item, variante=self.simple)
        res = self.analizar(_lista([
            # 1600 de dolar: 40 -> 64.000, 70 -> 112.000, 100 -> 160.000.
            ('Zeta A', 'Baterías Zeta', '', 40, 64000, None),
            ('Zeta B', 'Baterías Zeta', '', 70, 112000, None),
            ('Zeta C', 'Baterías Zeta', '', 100, 160000, None),
        ]))
        self.assertEqual(res['resumen']['dolar_planilla'], '1600.00')
        self.assertEqual(res['resumen']['dolar_negocio'], '1550.00')

    # --- calidades e items nuevos ---

    def test_varias_calidades_sin_decir_cual_se_elige_en_la_revision(self):
        otra = VarianteSeccion.objects.create(seccion=self.seccion, nombre='Original')
        PrecioItemService.objects.create(
            item=self.item, variante=otra, precio_lista_usd=Decimal('120'),
        )
        filas = self._filas(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', 85, None, None),
        ]))
        fila = filas[7]
        self.assertEqual(fila['estado'], 'revisar')
        self.assertEqual(len(fila['opciones']), 2)
        self.assertEqual(
            {o['variante_nombre'] for o in fila['opciones']}, {'Estándar', 'Original'},
        )
        # Cada opcion ya trae lo que escribiria: elegir no vuelve a consultar.
        for opcion in fila['opciones']:
            self.assertEqual(opcion['precio']['aplicar'], {'precio_lista_usd': '85.00'})

    def test_la_calidad_que_dice_la_planilla_manda(self):
        otra = VarianteSeccion.objects.create(seccion=self.seccion, nombre='Original')
        PrecioItemService.objects.create(
            item=self.item, variante=otra, precio_lista_usd=Decimal('120'),
        )
        filas = self._filas(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', 'Original', 130, None, None),
        ]))
        fila = filas[7]
        self.assertEqual(fila['estado'], 'actualiza')
        self.assertEqual(fila['opciones'][0]['variante'], otra.id)

    def test_item_que_no_esta_en_la_lista_es_un_alta(self):
        filas = self._filas(_lista([
            ('Zeta iPhone 17 Pro', 'Baterías Zeta', '', 200, None, None),
        ]))
        fila = filas[7]
        self.assertEqual(fila['estado'], 'nueva')
        self.assertTrue(fila['puede_crear'])
        opcion = fila['opciones'][0]
        self.assertIsNone(opcion['item'])
        self.assertEqual(opcion['variante'], self.simple.id)
        self.assertEqual(opcion['precio']['aplicar'], {'precio_lista_usd': '200.00'})

    def test_seccion_desconocida_no_se_inventa(self):
        filas = self._filas(_lista([
            ('Zeta lo que sea', 'Sección que no existe', '', 200, None, None),
        ]))
        self.assertEqual(filas[7]['estado'], 'revisar')
        self.assertFalse(filas[7]['puede_crear'])
        self.assertIn('sección', filas[7]['motivo'])

    def test_dos_filas_para_el_mismo_precio_se_marcan(self):
        filas = self._filas(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', 85, None, None),
            ('Zeta iPhone 11', 'Baterías Zeta', '', 90, None, None),
        ]))
        self.assertEqual(filas[7]['duplicada_con'], [8])
        self.assertEqual(filas[8]['duplicada_con'], [7])
        self.assertFalse(filas[7]['sugerido'])

    def test_una_fila_sin_ningun_precio_queda_afuera(self):
        filas = self._filas(_lista([
            ('Zeta iPhone 11', 'Baterías Zeta', '', None, None, None),
        ]))
        self.assertEqual(filas[7]['estado'], 'sin_valor')
        self.assertEqual(filas[7]['opciones'], [])


class ImportarListaServiceApiTests(TestCase):
    """Los dos endpoints: analizar (no escribe) y aplicar (todo o nada)."""

    ANALIZAR = '/api/precios-service/importar/analizar/'
    APLICAR = '/api/precios-service/importar/aplicar/'

    def setUp(self):
        from usuarios.models import Permiso, Rol, Usuario

        self.seccion = SeccionService.objects.create(nombre='Baterías Api')
        self.variante = VarianteSeccion.objects.create(seccion=self.seccion, nombre='Estándar')
        self.item = ItemService.objects.create(seccion=self.seccion, etiqueta='Api iPhone 11')
        self.precio = PrecioItemService.objects.create(
            item=self.item, variante=self.variante, precio_lista_usd=Decimal('70'),
        )
        self.admin = Usuario.objects.create_superuser(
            email='admin@service.test', username='admin.service', password='x',
        )
        rol = Rol.objects.create(nombre='Mostrador service test')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_precios_service'))
        self.empleado = Usuario.objects.create_user(
            email='emp@service.test', username='empleado.service', password='x', rol=rol,
        )

    def _cliente(self, usuario):
        cliente = APIClient()
        cliente.force_authenticate(usuario)
        return cliente

    def test_analizar_devuelve_el_diff_y_no_escribe(self):
        r = self._cliente(self.admin).post(self.ANALIZAR, {
            'archivo': _lista([('Api iPhone 11', 'Baterías Api', '', 85, None, None)]),
        }, format='multipart')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['resumen']['actualiza'], 1)
        self.assertEqual(r.data['columnas']['elegidas']['lista_usd'], 3)
        self.precio.refresh_from_db()
        self.assertEqual(self.precio.precio_lista_usd, Decimal('70'))

    def test_analizar_acepta_las_columnas_elegidas_a_mano(self):
        """La válvula, por la API: se manda de qué columna sale cada dato."""
        r = self._cliente(self.admin).post(self.ANALIZAR, {
            'archivo': _lista(
                [('Api iPhone 11', 999, 85)], encabezado=['Ítem', 'Lista USD', 'Otra'],
            ),
            'col_lista_usd': 2,
            'col_seccion': -1,
        }, format='multipart')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['columnas']['elegidas']['lista_usd'], 2)
        self.assertIsNone(r.data['columnas']['elegidas']['seccion'])
        self.assertEqual(
            r.data['filas'][0]['opciones'][0]['precio']['aplicar'],
            {'precio_lista_usd': '85.00'},
        )

    def test_analizar_con_los_pesos_prendidos(self):
        r = self._cliente(self.admin).post(self.ANALIZAR, {
            'archivo': _lista([('Api iPhone 11', 'Baterías Api', '', 70, 999000, None)]),
            'con_pesos': 'true',
        }, format='multipart')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['resumen']['con_pesos'])
        self.assertEqual(
            r.data['filas'][0]['opciones'][0]['precio']['aplicar'],
            {'precio_lista_ars': '999000.00'},
        )
        # Y sin prenderlos, ese mismo peso no entra.
        r = self._cliente(self.admin).post(self.ANALIZAR, {
            'archivo': _lista([('Api iPhone 11', 'Baterías Api', '', 70, 999000, None)]),
        }, format='multipart')
        self.assertIsNone(r.data['filas'][0]['opciones'][0]['precio']['aplicar'])
        self.assertEqual(r.data['resumen']['pesos_ignorados'], 1)

    def test_importar_es_solo_admin(self):
        """Tocar la lista de precios lo hace un administrador."""
        for url, datos, formato in (
            (self.ANALIZAR, {'archivo': _lista([('Api iPhone 11', 'B', '', 85, None, None)])}, 'multipart'),
            (self.APLICAR, {'items': []}, 'json'),
        ):
            r = self._cliente(self.empleado).post(url, datos, format=formato)
            self.assertEqual(r.status_code, 403, url)

    def test_archivo_que_no_es_xlsx(self):
        import io

        archivo = io.BytesIO(b'no soy un excel')
        archivo.name = 'lista.csv'
        r = self._cliente(self.admin).post(
            self.ANALIZAR, {'archivo': archivo}, format='multipart',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('.xlsx', str(r.data))

    def test_aplicar_escribe_el_precio(self):
        r = self._cliente(self.admin).post(self.APLICAR, {
            'items': [{
                'item': self.item.id, 'variante': self.variante.id,
                'precio_lista_usd': '85',
            }],
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['actualizados'], 1)
        self.precio.refresh_from_db()
        self.assertEqual(self.precio.precio_lista_usd, Decimal('85'))
        self.assertEqual(self.precio.actualizado_por, self.admin)

    def test_aplicar_borra_el_precio_fijado_a_mano(self):
        self.precio.precio_lista_ars = Decimal('999000')
        self.precio.save(update_fields=['precio_lista_ars'])
        r = self._cliente(self.admin).post(self.APLICAR, {
            'items': [{
                'item': self.item.id, 'variante': self.variante.id,
                'precio_lista_ars': None,
            }],
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.precio.refresh_from_db()
        self.assertIsNone(self.precio.precio_lista_ars)

    def test_aplicar_da_de_alta_el_item_y_su_precio(self):
        r = self._cliente(self.admin).post(self.APLICAR, {
            'items': [{
                'crear': {'seccion': self.seccion.id, 'etiqueta': 'Api iPhone 17'},
                'variante': self.variante.id,
                'precio_lista_usd': '200',
            }],
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['altas'], 1)
        self.assertEqual(r.data['creados'], 1)
        creado = ItemService.objects.get(etiqueta='Api iPhone 17')
        self.assertEqual(creado.seccion, self.seccion)
        self.assertEqual(
            creado.precios.get(variante=self.variante).precio_lista_usd, Decimal('200'),
        )

    def test_una_calidad_de_otra_seccion_da_400(self):
        otra = SeccionService.objects.create(nombre='Otra Api')
        ajena = VarianteSeccion.objects.create(seccion=otra, nombre='Estándar')
        r = self._cliente(self.admin).post(self.APLICAR, {
            'items': [{
                'item': self.item.id, 'variante': ajena.id, 'precio_lista_usd': '85',
            }],
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_una_fila_invalida_no_aplica_ninguna(self):
        """Todo o nada: la lista no queda a medio actualizar."""
        r = self._cliente(self.admin).post(self.APLICAR, {
            'items': [
                {'item': self.item.id, 'variante': self.variante.id, 'precio_lista_usd': '85'},
                {'item': 999999, 'variante': self.variante.id, 'precio_lista_usd': '90'},
            ],
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.precio.refresh_from_db()
        self.assertEqual(self.precio.precio_lista_usd, Decimal('70'))

    def test_el_mismo_precio_repetido_da_400(self):
        r = self._cliente(self.admin).post(self.APLICAR, {
            'items': [
                {'item': self.item.id, 'variante': self.variante.id, 'precio_lista_usd': '85'},
                {'item': self.item.id, 'variante': self.variante.id, 'precio_lista_usd': '90'},
            ],
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_el_precio_crudo_del_excel_se_redondea(self):
        r = self._cliente(self.admin).post(self.APLICAR, {
            'items': [{
                'item': self.item.id, 'variante': self.variante.id,
                'precio_lista_usd': '7.140000000000001',
            }],
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.precio.refresh_from_db()
        self.assertEqual(self.precio.precio_lista_usd, Decimal('7.14'))
