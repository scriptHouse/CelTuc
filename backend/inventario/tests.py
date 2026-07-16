from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from productos.models import CategoriaProducto, Producto
from usuarios.models import Permiso, Rol, Usuario

from .models import (
    MovimientoStock,
    StockProducto,
    Sucursal,
    Venta,
    aplicar_ajuste,
    aplicar_transferencia,
    registrar_venta,
)


def _producto(nombre='Fuente 20W test', **kwargs):
    categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria test')
    return Producto.objects.create(categoria=categoria, nombre=nombre, **kwargs)


class OperacionesStockTests(TestCase):
    """La logica pura: ajustes, pisos en 0 y transferencias."""

    def setUp(self):
        self.producto = _producto()
        self.solar = Sucursal.objects.create(nombre='Solar test', orden=1)
        self.centro = Sucursal.objects.create(nombre='Centro test', orden=2)

    def test_ajuste_crea_fila_y_movimiento(self):
        fila, mov = aplicar_ajuste(self.producto, self.solar, delta=5)
        self.assertEqual(fila.cantidad, 5)
        self.assertEqual(mov.tipo, MovimientoStock.Tipo.INGRESO)
        self.assertEqual(mov.delta, 5)
        self.assertEqual(mov.resultante, 5)

    def test_cantidad_fija_calcula_delta(self):
        aplicar_ajuste(self.producto, self.solar, delta=10)
        fila, mov = aplicar_ajuste(self.producto, self.solar, cantidad=4)
        self.assertEqual(fila.cantidad, 4)
        self.assertEqual(mov.delta, -6)
        self.assertEqual(mov.tipo, MovimientoStock.Tipo.EGRESO)

    def test_no_baja_de_cero(self):
        aplicar_ajuste(self.producto, self.solar, delta=2)
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            aplicar_ajuste(self.producto, self.solar, delta=-3)
        fila = StockProducto.objects.get(producto=self.producto, sucursal=self.solar)
        self.assertEqual(fila.cantidad, 2)  # no cambio nada

    def test_delta_cero_no_registra_movimiento(self):
        aplicar_ajuste(self.producto, self.solar, delta=3)
        antes = MovimientoStock.objects.count()
        aplicar_ajuste(self.producto, self.solar, cantidad=3)
        self.assertEqual(MovimientoStock.objects.count(), antes)

    def test_transferencia_mueve_y_deja_dos_movimientos(self):
        aplicar_ajuste(self.producto, self.solar, delta=10)
        salida, entrada = aplicar_transferencia(self.producto, self.solar, self.centro, 4)
        self.assertEqual(salida.cantidad, 6)
        self.assertEqual(entrada.cantidad, 4)
        movs = MovimientoStock.objects.filter(tipo=MovimientoStock.Tipo.TRANSFERENCIA)
        self.assertEqual(movs.count(), 2)
        self.assertEqual(sorted(m.delta for m in movs), [-4, 4])

    def test_ajuste_limpia_sin_dato(self):
        # Una fila "(no informado)" deja de estarlo en cuanto alguien carga
        # una cantidad real — incluso si lo que carga es 0 (conto y habia 0).
        StockProducto.objects.create(producto=self.producto, sucursal=self.solar, sin_dato=True)
        fila, mov = aplicar_ajuste(self.producto, self.solar, cantidad=0)
        self.assertFalse(fila.sin_dato)
        self.assertIsNone(mov)  # el 0 explicito no genera movimiento
        StockProducto.objects.create(producto=self.producto, sucursal=self.centro, sin_dato=True)
        fila, mov = aplicar_ajuste(self.producto, self.centro, delta=3)
        self.assertFalse(fila.sin_dato)
        self.assertEqual(mov.tipo, MovimientoStock.Tipo.INGRESO)

    def test_transferencia_sin_stock_falla_atomica(self):
        aplicar_ajuste(self.producto, self.solar, delta=2)
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            aplicar_transferencia(self.producto, self.solar, self.centro, 5)
        self.assertEqual(
            StockProducto.objects.get(producto=self.producto, sucursal=self.solar).cantidad, 2,
        )
        self.assertFalse(
            StockProducto.objects.filter(producto=self.producto, sucursal=self.centro).exists(),
        )


class VentasTests(TestCase):
    """La venta de mostrador: descuenta stock, registra kardex, todo o nada."""

    def setUp(self):
        self.fuente = _producto('Fuente venta test')
        self.cable = _producto('Cable venta test')
        self.solar = Sucursal.objects.create(nombre='Solar test', orden=1)
        aplicar_ajuste(self.fuente, self.solar, delta=10)
        aplicar_ajuste(self.cable, self.solar, delta=2)

        from usuarios.models import Permiso, Rol, Usuario
        rol = Rol.objects.create(nombre='Mostrador ventas test')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_inventario'))
        self.empleado = Usuario.objects.create_user(
            email='vtas@celtuc.test', username='vtas.inv', password='x', rol=rol,
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.empleado)

    def test_registrar_venta_descuenta_y_totaliza(self):
        venta = registrar_venta(
            self.solar,
            [(self.fuente, 2, Decimal('38800')), (self.cable, 1, Decimal('11600'))],
            forma_pago='efectivo',
            usuario=self.empleado,
        )
        self.assertEqual(venta.total, Decimal('89200'))
        self.assertEqual(StockProducto.objects.get(producto=self.fuente, sucursal=self.solar).cantidad, 8)
        self.assertEqual(StockProducto.objects.get(producto=self.cable, sucursal=self.solar).cantidad, 1)
        movs = MovimientoStock.objects.filter(tipo=MovimientoStock.Tipo.VENTA)
        self.assertEqual(movs.count(), 2)
        self.assertTrue(all(m.nota == f'Venta #{venta.pk}' for m in movs))

    def test_venta_sin_stock_no_registra_nada(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            registrar_venta(
                self.solar,
                [(self.fuente, 1, Decimal('38800')), (self.cable, 5, Decimal('11600'))],
            )
        # Atomica: ni la venta, ni items, ni el descuento de la fuente.
        self.assertEqual(Venta.objects.count(), 0)
        self.assertEqual(StockProducto.objects.get(producto=self.fuente, sucursal=self.solar).cantidad, 10)
        self.assertEqual(MovimientoStock.objects.filter(tipo=MovimientoStock.Tipo.VENTA).count(), 0)

    def test_api_post_y_get(self):
        r = self.cliente.post('/api/inventario/ventas/', {
            'sucursal': self.solar.id,
            'forma_pago': 'tarjeta',
            'nota': 'cliente del 13',
            'items': [
                {'producto': self.fuente.id, 'cantidad': 1, 'precio_unitario': 38800},
            ],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(float(r.data['total']), 38800)
        self.assertEqual(r.data['usuario'], 'vtas.inv')
        self.assertEqual(r.data['items'][0]['nombre'], 'Fuente venta test')
        r = self.cliente.get(f'/api/inventario/ventas/?sucursal={self.solar.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)

    def test_api_sin_stock_400_legible(self):
        r = self.cliente.post('/api/inventario/ventas/', {
            'sucursal': self.solar.id,
            'items': [{'producto': self.cable.id, 'cantidad': 99, 'precio_unitario': 100}],
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('stock suficiente', r.data['detail'])

    def test_api_requiere_permiso(self):
        from usuarios.models import Usuario
        pelado = Usuario.objects.create_user(
            email='pelado.v@celtuc.test', username='pelado.v', password='x',
        )
        cliente = APIClient()
        cliente.force_authenticate(pelado)
        self.assertEqual(cliente.get('/api/inventario/ventas/').status_code, 403)


class ApiInventarioTests(TestCase):
    """Permisos y contratos de la API."""

    def setUp(self):
        self.producto = _producto()
        self.solar = Sucursal.objects.create(nombre='Solar test', orden=1)
        self.centro = Sucursal.objects.create(nombre='Centro test', orden=2)

        self.admin = Usuario.objects.create_superuser(
            email='admin@celtuc.test', username='admin.inv', password='x',
        )
        # Empleado CON ver_inventario (rol propio para no depender del seed).
        rol = Rol.objects.create(nombre='Mostrador test')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_inventario'))
        self.empleado = Usuario.objects.create_user(
            email='empleado@celtuc.test', username='empleado.inv', password='x', rol=rol,
        )
        # Usuario sin ningun permiso.
        self.pelado = Usuario.objects.create_user(
            email='pelado@celtuc.test', username='pelado.inv', password='x',
        )

    def _cliente(self, usuario):
        cliente = APIClient()
        cliente.force_authenticate(usuario)
        return cliente

    def test_empleado_con_permiso_lee_y_ajusta(self):
        cliente = self._cliente(self.empleado)
        r = cliente.get('/api/inventario/stock/')
        self.assertEqual(r.status_code, 200)
        r = cliente.post('/api/inventario/stock/ajustar/', {
            'producto': self.producto.id, 'sucursal': self.solar.id, 'delta': 3,
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['stock']['cantidad'], 3)
        self.assertIs(r.data['stock']['sin_dato'], False)
        self.assertEqual(r.data['movimiento']['tipo'], 'ingreso')
        self.assertEqual(r.data['movimiento']['usuario'], 'empleado.inv')

    def test_sin_permiso_403(self):
        cliente = self._cliente(self.pelado)
        self.assertEqual(cliente.get('/api/inventario/stock/').status_code, 403)
        r = cliente.post('/api/inventario/stock/ajustar/', {
            'producto': self.producto.id, 'sucursal': self.solar.id, 'delta': 1,
        }, format='json')
        self.assertEqual(r.status_code, 403)

    def test_sucursales_solo_admin_escribe(self):
        empleado = self._cliente(self.empleado)
        self.assertEqual(empleado.get('/api/inventario/sucursales/').status_code, 200)
        r = empleado.post('/api/inventario/sucursales/', {'nombre': 'Norte'}, format='json')
        self.assertEqual(r.status_code, 403)
        admin = self._cliente(self.admin)
        r = admin.post('/api/inventario/sucursales/', {'nombre': 'Norte'}, format='json')
        self.assertEqual(r.status_code, 201)

    def test_ajuste_no_baja_de_cero_da_400_legible(self):
        cliente = self._cliente(self.empleado)
        r = cliente.post('/api/inventario/stock/ajustar/', {
            'producto': self.producto.id, 'sucursal': self.solar.id, 'delta': -1,
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('stock suficiente', r.data['detail'])

    def test_actualizar_solo_minimo_no_genera_movimiento(self):
        cliente = self._cliente(self.empleado)
        r = cliente.post('/api/inventario/stock/ajustar/', {
            'producto': self.producto.id, 'sucursal': self.solar.id, 'stock_minimo': 5,
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['stock']['stock_minimo'], 5)
        self.assertIsNone(r.data['movimiento'])
        self.assertEqual(MovimientoStock.objects.filter(producto=self.producto).count(), 0)

    def test_transferencia_api(self):
        cliente = self._cliente(self.empleado)
        cliente.post('/api/inventario/stock/ajustar/', {
            'producto': self.producto.id, 'sucursal': self.solar.id, 'delta': 8,
        }, format='json')
        r = cliente.post('/api/inventario/stock/transferir/', {
            'producto': self.producto.id, 'origen': self.solar.id,
            'destino': self.centro.id, 'cantidad': 3,
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['origen']['cantidad'], 5)
        self.assertEqual(r.data['destino']['cantidad'], 3)

    def test_movimientos_filtrables(self):
        cliente = self._cliente(self.empleado)
        cliente.post('/api/inventario/stock/ajustar/', {
            'producto': self.producto.id, 'sucursal': self.solar.id, 'delta': 2, 'nota': 'llegó caja',
        }, format='json')
        r = cliente.get(f'/api/inventario/movimientos/?producto={self.producto.id}&sucursal={self.solar.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['nota'], 'llegó caja')

    def test_requiere_autenticacion(self):
        self.assertEqual(APIClient().get('/api/inventario/stock/').status_code, 401)


class CostoSoloAdminTests(TestCase):
    """`costo_usd` de Producto: visible para admins, oculto para el resto."""

    def setUp(self):
        self.producto = _producto(costo_usd=Decimal('10.5'))
        self.admin = Usuario.objects.create_superuser(
            email='admin2@celtuc.test', username='admin.costo', password='x',
        )
        rol = Rol.objects.create(nombre='Vendedor test')
        rol.permisos.set(Permiso.objects.filter(codigo__in=['ver_productos', 'ver_inventario']))
        self.empleado = Usuario.objects.create_user(
            email='vende@celtuc.test', username='vende.costo', password='x', rol=rol,
        )

    def _get(self, usuario):
        cliente = APIClient()
        cliente.force_authenticate(usuario)
        r = cliente.get('/api/productos/items/')
        self.assertEqual(r.status_code, 200)
        return next(p for p in r.data if p['id'] == self.producto.id)

    def test_admin_ve_costo(self):
        self.assertEqual(self._get(self.admin)['costo_usd'], 10.5)

    def test_empleado_no_ve_costo(self):
        self.assertNotIn('costo_usd', self._get(self.empleado))

    def test_ver_inventario_habilita_leer_productos(self):
        rol = Rol.objects.create(nombre='Solo inventario test')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_inventario'))
        usuario = Usuario.objects.create_user(
            email='soloinv@celtuc.test', username='solo.inv', password='x', rol=rol,
        )
        cliente = APIClient()
        cliente.force_authenticate(usuario)
        self.assertEqual(cliente.get('/api/productos/items/').status_code, 200)
        self.assertEqual(cliente.get('/api/productos/categorias/').status_code, 200)


class SeedInventarioTests(TestCase):
    """Los seeds de sucursales y stock inicial importado de las planillas."""

    def test_sucursales_seed(self):
        nombres = set(Sucursal.objects.values_list('nombre', flat=True))
        self.assertIn('Solar', nombres)
        self.assertIn('Centro', nombres)

    def test_stock_importado(self):
        solar = Sucursal.objects.get(nombre='Solar')
        centro = Sucursal.objects.get(nombre='Centro')
        self.assertGreater(StockProducto.objects.filter(sucursal=solar, cantidad__gt=0).count(), 150)
        self.assertGreater(StockProducto.objects.filter(sucursal=centro, cantidad__gt=0).count(), 130)
        # Cada fila importada dejo su movimiento de carga inicial.
        self.assertEqual(
            MovimientoStock.objects.filter(nota__icontains='planilla').count(),
            StockProducto.objects.filter(cantidad__gt=0).count(),
        )

    def test_seed_no_informado(self):
        # Las filas cuya celda de stock estaba vacia en las planillas quedan
        # como "(no informado)": cantidad 0 + sin_dato, sin movimiento.
        # 378 del seed 0006 (Solar 175 + Centro 203) + 506 repuestos de
        # service del seed 0007 (253 productos x 2 sucursales).
        marcadas = StockProducto.objects.filter(sin_dato=True)
        self.assertEqual(marcadas.count(), 884)
        self.assertFalse(marcadas.exclude(cantidad=0).exists())
        # Producto que solo estaba en las planillas sin cantidad: se creo aca.
        haylou = Producto.objects.get(nombre='Haylou X1 Neo')
        self.assertEqual(haylou.stocks.filter(sin_dato=True).count(), 2)
        # "Fuente 5W - CO" estaba vacia en las dos hojas (en Centro ademas de
        # Solar): las dos sucursales quedan "(no informado)".
        fuente5 = StockProducto.objects.filter(
            producto__nombre='Fuente 5W', producto__calidad='Calidad original',
        )
        self.assertEqual(fuente5.count(), 2)
        self.assertTrue(all(f.sin_dato and f.cantidad == 0 for f in fuente5))
        # Los repuestos de service (seed 0007) tambien: la bateria del 14 Pro
        # existe como producto SIN precio (los precios siguen en /service).
        bateria = Producto.objects.get(categoria__nombre='Baterías', nombre='14 PRO')
        self.assertIsNone(bateria.precio_lista_usd)
        self.assertEqual(bateria.stocks.filter(sin_dato=True, cantidad=0).count(), 2)
        # Los iPhone 17 de la planilla no tienen precio $ cargado -> no entran.
        self.assertFalse(Producto.objects.filter(
            categoria__nombre='Baterías', nombre__startswith='17',
        ).exists())

    def test_casos_conocidos_de_la_hoja(self):
        solar = Sucursal.objects.get(nombre='Solar')
        centro = Sucursal.objects.get(nombre='Centro')
        # "Fuente 20W - CO" -> 56 en Solar y 32 en Centro (celdas I5).
        fila = StockProducto.objects.get(
            producto__nombre='Fuente 20W', producto__calidad='Calidad original',
            producto__nota='', sucursal=solar,
        )
        self.assertEqual(fila.cantidad, 56)
        fila_centro = StockProducto.objects.get(producto=fila.producto, sucursal=centro)
        self.assertEqual(fila_centro.cantidad, 32)
        # Los tipeados a mano al final de la hoja Solar existen como productos.
        self.assertTrue(Producto.objects.filter(nombre__iexact='alexa echo show 10').exists())
