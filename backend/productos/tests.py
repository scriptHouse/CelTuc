from decimal import Decimal

from django.test import TestCase

from cotizaciones.models import ModeloEquipo
from cotizaciones.serializers import ModeloEquipoSerializer
from precios_service.models import ConfiguracionService, Dispositivo

from .models import (
    CategoriaProducto,
    ConfiguracionProductos,
    Producto,
    resolver_precio_producto,
)
from .serializers import CategoriaProductoSerializer


class DerivacionProductosTests(TestCase):
    """La formula de la hoja Accesorios, verificada contra celdas reales."""

    def setUp(self):
        self.config = ConfiguracionProductos.obtener()

    def _efectivo(self, categoria_nombre, producto_nombre, **extra):
        producto = Producto.objects.select_related('categoria').get(
            categoria__nombre=categoria_nombre, nombre=producto_nombre, **extra,
        )
        return resolver_precio_producto(producto, self.config)

    def test_derivacion_accesorio_comun(self):
        # Fuente 5W: 12.24 -> 9.79 / 19.000 / 16.000 (celdas C10-F10).
        e = self._efectivo('Fuentes de carga y powerbanks', 'Fuente 5W')
        self.assertEqual(e['lista_usd'], Decimal('12.24'))
        self.assertEqual(e['cash_usd'], Decimal('9.79'))
        self.assertEqual(e['lista_ars'], Decimal('19000'))   # ceil a $100
        self.assertEqual(e['cash_ars'], Decimal('16000'))    # ceil a $1.000

    def test_cash_ars_deriva_del_cash_usd(self):
        # Fuente 20W: 25 -> cash 20 -> $31.000 (y NO 32.000, que daria la
        # otra cadena lista_ars * 0.8: la hoja deriva del cash USD).
        e = self._efectivo(
            'Fuentes de carga y powerbanks', 'Fuente 20W',
            calidad='Calidad original', nota='',
        )
        self.assertEqual(e['cash_usd'], Decimal('20'))
        self.assertEqual(e['cash_ars'], Decimal('31000'))

    def test_descuento_30_de_auriculares(self):
        # Xiaomi Earphones USB-C: 17.34 -> 12.14 (30 % off, celda D83).
        e = self._efectivo('Auriculares', 'Xiaomi Earphones USB-C')
        self.assertEqual(e['cash_usd'], Decimal('12.14'))

    def test_samsung_sin_cash_y_redondeo_1000(self):
        e = self._efectivo('Samsung', 'S25 FE 8GB/256GB')
        self.assertEqual(e['lista_ars'], Decimal('1084000'))  # ceil a $1.000
        self.assertIsNone(e['cash_usd'])
        self.assertIsNone(e['cash_ars'])

    def test_override_manual_de_la_hoja(self):
        # Magnetic Case: lista $ pisada a mano en 19.900 (formula daria 22.200).
        producto = Producto.objects.get(nombre__startswith='Magnetic Case')
        self.assertEqual(producto.precio_lista_ars, Decimal('19900'))

    def test_dolar_compartido_con_service(self):
        compartida = ConfiguracionService.obtener()
        original = compartida.dolar
        compartida.dolar = Decimal('2000')
        compartida.save(update_fields=['dolar'])
        try:
            e = self._efectivo(
                'Fuentes de carga y powerbanks', 'Fuente 20W',
                calidad='Calidad original', nota='',
            )
            self.assertEqual(e['lista_ars'], Decimal('50000'))  # 25 x 2000
        finally:
            compartida.dolar = original
            compartida.save(update_fields=['dolar'])


class SeedAccesoriosTests(TestCase):
    def test_categorias_y_productos_sembrados(self):
        # 15 de la hoja Accesorios + 11 de las secciones de service de las
        # planillas de stock (Baterías, Módulos, ... — seed 0007 de inventario).
        self.assertEqual(CategoriaProducto.objects.filter(padre__isnull=True).count(), 26)
        # 403 de la hoja Accesorios + 12 que aparecieron en las planillas de
        # stock de las sucursales (seed de inventario, jul 2026) + 19 de las
        # filas sin cantidad informada (seed "(no informado)", jul 2026) + 253
        # repuestos de service (filas con precio de BATERIAS/MODULOS/etc.).
        self.assertEqual(Producto.objects.count(), 687)

    def test_jerarquia_de_cables(self):
        cables = CategoriaProducto.objects.get(nombre='Cables', padre__isnull=True)
        hijas = list(cables.hijas.order_by('orden').values_list('nombre', flat=True))
        self.assertEqual(hijas, ['USB a Lightning', 'USB-C a USB', 'USB-C a Lightning', 'USB-C a USB-C'])
        baseus = Producto.objects.get(nombre__startswith='Cable USB-C a Lightning 1M Baseus')
        self.assertEqual(baseus.categoria.nombre, 'USB-C a Lightning')
        self.assertEqual(baseus.calidad, 'Original')

    def test_normalizacion_de_nombres(self):
        # "Fuente 20W - CO" -> nombre limpio + calidad estructurada. Las 4
        # variantes de la hoja (CO / Apple original, con y sin "si compran
        # equipo") comparten nombre y se distinguen por calidad + nota.
        fuentes = Producto.objects.filter(
            categoria__nombre__startswith='Fuentes', nombre='Fuente 20W',
        )
        self.assertEqual(fuentes.count(), 4)
        self.assertEqual(
            fuentes.filter(calidad='Calidad original', nota='').count(), 1,
        )
        self.assertEqual(
            fuentes.filter(calidad='Apple original', nota='Precio si compran equipo').count(), 1,
        )
        # "( A PEDIDO )" y "PRODUCTO NUEVO" pasan a flags.
        boombox = Producto.objects.get(nombre='BoomBox 3')
        self.assertTrue(boombox.a_pedido)
        self.assertEqual(boombox.marca, 'JBL')
        flex = Producto.objects.get(nombre='JBL Tune Flex 2')
        self.assertTrue(flex.nuevo)

    def test_vinculos_a_equipos(self):
        # "Silicone Case LINEA 17" -> los 4 equipos de la linea 17.
        funda = Producto.objects.get(nombre='Silicone Case LINEA 17')
        self.assertEqual(funda.dispositivos.count(), 4)
        # Los iPad de la hoja quedan vinculados al equipo iPad.
        ipad = Producto.objects.get(nombre="iPad Air M3 11'' 128GB")
        self.assertEqual(
            list(ipad.dispositivos.values_list('nombre', flat=True)), ['iPad'],
        )
        self.assertTrue(ipad.categoria.es_equipo)

    def test_iphones_vacia_lista_para_cargar(self):
        iphones = CategoriaProducto.objects.get(nombre='iPhones')
        self.assertTrue(iphones.es_equipo)
        self.assertEqual(iphones.tarifa_cuotas, 'equipos')
        self.assertEqual(iphones.productos.count(), 0)


class CategoriaSerializerTests(TestCase):
    def test_maximo_dos_niveles(self):
        cables = CategoriaProducto.objects.get(nombre='Cables', padre__isnull=True)
        hija = cables.hijas.first()
        serializer = CategoriaProductoSerializer(data={'nombre': 'Nieta', 'padre': hija.id})
        self.assertFalse(serializer.is_valid())
        self.assertIn('padre', serializer.errors)


class PuenteCotizacionesTests(TestCase):
    def test_modelos_existentes_vinculados(self):
        self.assertEqual(ModeloEquipo.objects.filter(dispositivo__isnull=True).count(), 0)
        trece = ModeloEquipo.objects.get(nombre='13 Pro')
        self.assertEqual(trece.dispositivo.nombre, 'iPhone 13 Pro')

    def test_modelo_nuevo_se_vincula_solo(self):
        Dispositivo.objects.create(nombre='iPhone 18', linea='18', orden=99)
        serializer = ModeloEquipoSerializer(data={'nombre': '18'})
        serializer.is_valid(raise_exception=True)
        modelo = serializer.save()
        self.assertEqual(modelo.dispositivo.nombre, 'iPhone 18')
