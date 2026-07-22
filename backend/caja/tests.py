from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from inventario.models import Sucursal, aplicar_ajuste, registrar_venta
from productos.models import CategoriaProducto, Producto
from usuarios.models import Permiso, Rol, Usuario

from .models import (
    Caja,
    CierreCaja,
    ConfiguracionCaja,
    MovimientoCaja,
    SesionCaja,
    abrir_caja,
    cerrar_caja,
    eliminar_movimiento,
    registrar_movimiento,
    registrar_venta_en_caja,
    resumen_sesion,
)


def _contado(**kwargs):
    base = {'efectivo': 0, 'transferencia': 0, 'tarjeta': 0, 'otro': 0}
    base.update(kwargs)
    return base


class TurnoTests(TestCase):
    """Apertura, movimientos y guardas del turno."""

    def setUp(self):
        self.caja = Caja.objects.create(nombre='Principal test')

    def test_abrir_asigna_numero_correlativo(self):
        s1 = abrir_caja(self.caja, fondo_inicial=10000)
        cerrar_caja(s1, contado_por_medio=_contado(efectivo=10000), fondo_siguiente=10000)
        s2 = abrir_caja(self.caja, fondo_inicial=10000)
        self.assertEqual(s2.numero, s1.numero + 1)

    def test_no_permite_dos_turnos_abiertos(self):
        abrir_caja(self.caja, fondo_inicial=5000)
        with self.assertRaises(ValidationError):
            abrir_caja(self.caja, fondo_inicial=5000)

    def test_egreso_no_puede_exceder_el_efectivo(self):
        sesion = abrir_caja(self.caja, fondo_inicial=1000)
        with self.assertRaises(ValidationError):
            registrar_movimiento(
                sesion, tipo=MovimientoCaja.Tipo.EGRESO, monto=1500, motivo='Proveedor',
            )
        # Con efectivo suficiente si pasa.
        mov = registrar_movimiento(
            sesion, tipo=MovimientoCaja.Tipo.EGRESO, monto=800, motivo='Proveedor',
        )
        self.assertEqual(mov.medio, 'efectivo')  # los manuales son siempre efectivo

    def test_retiro_respeta_la_configuracion(self):
        config = ConfiguracionCaja.instancia()
        config.retiros_habilitados = False
        config.save()
        sesion = abrir_caja(self.caja, fondo_inicial=50000)
        with self.assertRaises(ValidationError):
            registrar_movimiento(
                sesion, tipo=MovimientoCaja.Tipo.RETIRO, monto=10000, motivo='Retiro a boveda',
            )

    def test_resumen_esperado_efectivo(self):
        sesion = abrir_caja(self.caja, fondo_inicial=10000)
        registrar_movimiento(
            sesion, tipo=MovimientoCaja.Tipo.VENTA, medio='efectivo', monto=5000, motivo='Venta',
        )
        registrar_movimiento(
            sesion, tipo=MovimientoCaja.Tipo.VENTA, medio='transferencia', monto=8000, motivo='Venta',
        )
        registrar_movimiento(sesion, tipo=MovimientoCaja.Tipo.EGRESO, monto=2000, motivo='Gasto')
        r = resumen_sesion(sesion)
        self.assertEqual(r['esperado_por_medio']['efectivo'], Decimal('13000'))
        self.assertEqual(r['esperado_por_medio']['transferencia'], Decimal('8000'))
        self.assertEqual(r['operaciones_por_medio']['efectivo'], 1)


class CierreTests(TestCase):
    """El arqueo: diferencia, tolerancia, fondo siguiente e inmutabilidad."""

    def setUp(self):
        self.caja = Caja.objects.create(nombre='Principal test')
        self.sesion = abrir_caja(self.caja, fondo_inicial=10000)
        registrar_movimiento(
            self.sesion, tipo=MovimientoCaja.Tipo.VENTA, medio='efectivo',
            monto=20000, motivo='Venta',
        )
        registrar_movimiento(
            self.sesion, tipo=MovimientoCaja.Tipo.VENTA, medio='transferencia',
            monto=15000, motivo='Venta',
        )

    def test_cierre_calcula_diferencia_y_retiro(self):
        # Esperado efectivo = 10000 + 20000 = 30000; contamos 29500 -> faltante 500.
        cierre = cerrar_caja(
            self.sesion,
            contado_por_medio=_contado(efectivo=29500, transferencia=15000),
            fondo_siguiente=10000,
        )
        self.assertEqual(cierre.diferencia_total, Decimal('-500'))
        self.assertEqual(cierre.diferencia_por_medio['efectivo'], -500.0)
        self.assertEqual(cierre.fondo_siguiente, Decimal('10000'))
        self.assertEqual(cierre.retiro_final, Decimal('19500'))  # 29500 - 10000
        self.sesion.refresh_from_db()
        self.assertEqual(self.sesion.estado, SesionCaja.Estado.CERRADA)

    def test_fondo_siguiente_no_supera_lo_contado(self):
        cierre = cerrar_caja(
            self.sesion,
            contado_por_medio=_contado(efectivo=30000, transferencia=15000),
            fondo_siguiente=99999,
        )
        self.assertEqual(cierre.fondo_siguiente, Decimal('30000'))
        self.assertEqual(cierre.retiro_final, Decimal('0'))

    def test_diferencia_sobre_tolerancia_exige_motivo(self):
        with self.assertRaises(ValidationError):
            cerrar_caja(
                self.sesion,
                contado_por_medio=_contado(efectivo=20000, transferencia=15000),  # faltan 10000
                fondo_siguiente=10000,
            )
        cierre = cerrar_caja(
            self.sesion,
            contado_por_medio=_contado(efectivo=20000, transferencia=15000),
            fondo_siguiente=10000,
            motivo_diferencia='Faltante de efectivo',
            nota_diferencia='Se investiga.',
        )
        self.assertEqual(cierre.diferencia_total, Decimal('-10000'))

    def test_turno_cerrado_es_inmutable(self):
        mov = registrar_movimiento(
            self.sesion, tipo=MovimientoCaja.Tipo.INGRESO, monto=1000, motivo='Cambio',
        )
        cerrar_caja(
            self.sesion,
            contado_por_medio=_contado(efectivo=31000, transferencia=15000),
            fondo_siguiente=10000,
        )
        with self.assertRaises(ValidationError):
            registrar_movimiento(
                self.sesion, tipo=MovimientoCaja.Tipo.INGRESO, monto=1, motivo='Tarde',
            )
        with self.assertRaises(ValidationError):
            eliminar_movimiento(mov)

    def test_ciclo_dia_siguiente(self):
        """Se deja 10000 al cerrar -> el proximo turno arranca con ese fondo."""
        cierre = cerrar_caja(
            self.sesion,
            contado_por_medio=_contado(efectivo=30000, transferencia=15000),
            fondo_siguiente=10000,
        )
        siguiente = abrir_caja(self.caja, fondo_inicial=cierre.fondo_siguiente)
        self.assertEqual(siguiente.fondo_inicial, Decimal('10000'))
        self.assertEqual(resumen_sesion(siguiente)['esperado_por_medio']['efectivo'], Decimal('10000'))


class VentaEnCajaTests(TestCase):
    """La integracion clave: la venta de mostrador entra sola al arqueo.

    Estos tests cubren el comportamiento SIN cajas fiscales (canal): por eso
    se eliminan las que siembra la migracion 0004; el enrutamiento por canal
    se prueba aparte en `CajasFiscalesTests`.
    """

    def setUp(self):
        self.caja = Caja.objects.create(nombre='Principal test')
        Caja.todos.exclude(pk=self.caja.pk).delete()
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria test')
        self.producto = Producto.objects.create(categoria=categoria, nombre='Fuente caja test')
        self.sucursal = Sucursal.objects.create(nombre='Solar caja test', orden=1)
        aplicar_ajuste(self.producto, self.sucursal, delta=10)

    def _venta(self, forma_pago='efectivo', cantidad=2, precio='5000'):
        return registrar_venta(
            self.sucursal,
            [(self.producto, cantidad, Decimal(precio))],
            forma_pago=forma_pago,
        )

    def test_venta_entra_al_turno_abierto(self):
        sesion = abrir_caja(self.caja, fondo_inicial=10000)
        venta = self._venta(forma_pago='transferencia')
        mov = registrar_venta_en_caja(venta, caja=self.caja)
        self.assertIsNotNone(mov)
        self.assertEqual(mov.sesion_id, sesion.pk)
        self.assertEqual(mov.tipo, MovimientoCaja.Tipo.VENTA)
        self.assertEqual(mov.medio, 'transferencia')
        self.assertEqual(mov.monto, Decimal('10000'))
        self.assertEqual(mov.venta_id, venta.pk)
        self.assertIn('Fuente caja test', mov.detalle)

    def test_sin_turno_abierto_devuelve_none(self):
        venta = self._venta()
        self.assertIsNone(registrar_venta_en_caja(venta, caja=self.caja))

    def test_sin_caja_usa_la_unica_sesion_abierta(self):
        sesion = abrir_caja(self.caja, fondo_inicial=0)
        venta = self._venta()
        mov = registrar_venta_en_caja(venta)
        self.assertEqual(mov.sesion_id, sesion.pk)

    def test_movimiento_de_venta_no_se_elimina_desde_caja(self):
        abrir_caja(self.caja, fondo_inicial=0)
        venta = self._venta()
        mov = registrar_venta_en_caja(venta)
        with self.assertRaises(ValidationError):
            eliminar_movimiento(mov)


class ApiCajaTests(TestCase):
    """Permisos y contrato de la API, incluida la venta con caja."""

    def setUp(self):
        self.caja = Caja.objects.create(nombre='Principal test')
        # Sin cajas fiscales: aca se prueba el contrato historico de la API.
        Caja.todos.exclude(pk=self.caja.pk).delete()

        rol = Rol.objects.create(nombre='Cajero test')
        rol.permisos.set(Permiso.objects.filter(codigo__in=('ver_caja', 'ver_inventario')))
        self.cajero = Usuario.objects.create_user(
            email='cajero@celtuc.test', username='cajero.caja', password='x', rol=rol,
        )
        self.admin = Usuario.objects.create_superuser(
            email='admin.caja@celtuc.test', username='admin.caja', password='x',
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.cajero)

    def test_flujo_completo_por_api(self):
        # Abrir con fondo.
        r = self.cliente.post('/api/caja/abrir/', {
            'caja': self.caja.pk, 'fondo_inicial': 10000, 'nota_apertura': 'fondo de ayer',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        sesion_id = r.data['id']
        self.assertEqual(r.data['abierta_por'], 'cajero.caja')

        # Movimiento manual.
        r = self.cliente.post('/api/caja/movimientos/', {
            'sesion': sesion_id, 'tipo': 'egreso', 'monto': 2000, 'motivo': 'Pago a proveedor',
        }, format='json')
        self.assertEqual(r.status_code, 201)

        # Estado con el movimiento.
        r = self.cliente.get(f'/api/caja/cajas/{self.caja.pk}/estado/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['movimientos']), 1)
        self.assertEqual(r.data['sesion']['numero'], 1)

        # Cerrar dejando 5000 (esperado efectivo = 8000; contamos exacto).
        r = self.cliente.post('/api/caja/cerrar/', {
            'sesion': sesion_id,
            'contado_por_medio': _contado(efectivo=8000),
            'fondo_siguiente': 5000,
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['numero'], 1)
        self.assertEqual(float(r.data['retiro_final']), 3000)
        self.assertEqual(float(r.data['fondo_siguiente']), 5000)
        self.assertEqual(len(r.data['movimientos']), 1)

        # Historial.
        r = self.cliente.get(f'/api/caja/cierres/?caja={self.caja.pk}&limite=1')
        self.assertEqual(len(r.data), 1)
        self.assertEqual(float(r.data[0]['fondo_siguiente']), 5000)

    def test_venta_por_api_entra_al_arqueo(self):
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria test')
        producto = Producto.objects.create(categoria=categoria, nombre='Cable api test')
        sucursal = Sucursal.objects.create(nombre='Solar api test', orden=1)
        aplicar_ajuste(producto, sucursal, delta=5)

        r = self.cliente.post('/api/caja/abrir/', {
            'caja': self.caja.pk, 'fondo_inicial': 0,
        }, format='json')
        self.assertEqual(r.status_code, 201)

        r = self.cliente.post('/api/inventario/ventas/', {
            'sucursal': sucursal.pk,
            'forma_pago': 'efectivo',
            'caja': self.caja.pk,
            'items': [{'producto': producto.pk, 'cantidad': 1, 'precio_unitario': 9500}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIsNotNone(r.data['movimiento_caja'])

        estado = self.cliente.get(f'/api/caja/cajas/{self.caja.pk}/estado/').data
        self.assertEqual(len(estado['movimientos']), 1)
        self.assertEqual(estado['movimientos'][0]['tipo'], 'venta')
        self.assertEqual(float(estado['movimientos'][0]['monto']), 9500)

    def test_venta_sin_turno_avisa(self):
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria test')
        producto = Producto.objects.create(categoria=categoria, nombre='Funda api test')
        sucursal = Sucursal.objects.create(nombre='Centro api test', orden=2)
        aplicar_ajuste(producto, sucursal, delta=5)

        r = self.cliente.post('/api/inventario/ventas/', {
            'sucursal': sucursal.pk,
            'forma_pago': 'efectivo',
            'caja': self.caja.pk,
            'items': [{'producto': producto.pk, 'cantidad': 1, 'precio_unitario': 100}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(r.data['movimiento_caja'])
        self.assertTrue(r.data['aviso_caja'])

    def test_config_solo_admin_escribe(self):
        r = self.cliente.get('/api/caja/config/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['cierre_ciego'])

        r = self.cliente.patch('/api/caja/config/', {'cierre_ciego': False}, format='json')
        self.assertEqual(r.status_code, 403)  # el cajero no configura

        admin = APIClient()
        admin.force_authenticate(self.admin)
        r = admin.patch('/api/caja/config/', {'cierre_ciego': False}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['cierre_ciego'])

    def test_sin_permiso_403(self):
        pelado = Usuario.objects.create_user(
            email='pelado.caja@celtuc.test', username='pelado.caja', password='x',
        )
        cliente = APIClient()
        cliente.force_authenticate(pelado)
        self.assertEqual(cliente.get('/api/caja/cajas/').status_code, 403)

    def test_no_se_elimina_la_ultima_caja(self):
        # La migracion siembra la caja "Principal": la sacamos para quedarnos con una sola.
        Caja.todos.exclude(pk=self.caja.pk).delete()
        admin = APIClient()
        admin.force_authenticate(self.admin)
        r = admin.delete(f'/api/caja/cajas/{self.caja.pk}/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('al menos una caja', r.data['detail'])


class CajasFiscalesTests(TestCase):
    """Dos cajas por canal fiscal: lo facturado RI a una, el resto a la otra.

    Las cajas las siembra la migracion 0004: «Facturación RI» (canal
    factura_ri) y «Monotributo y sin factura» (canal general, la vieja
    "Principal"). La venta se etiqueta con su facturacion y entra SOLA a la
    caja que corresponde, sin importar cual este seleccionada en pantalla.
    """

    def setUp(self):
        self.caja_ri = Caja.objects.get(canal=Caja.Canal.FACTURA_RI)
        self.caja_general = Caja.objects.get(canal=Caja.Canal.GENERAL)
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria test')
        self.producto = Producto.objects.create(categoria=categoria, nombre='Modulo fiscal test')
        self.sucursal = Sucursal.objects.create(nombre='Solar fiscal test', orden=1)
        aplicar_ajuste(self.producto, self.sucursal, delta=20)

    def _venta(self, facturacion, forma_pago='efectivo'):
        return registrar_venta(
            self.sucursal,
            [(self.producto, 1, Decimal('10000'))],
            forma_pago=forma_pago,
            facturacion=facturacion,
        )

    def test_migracion_siembra_las_dos_cajas_y_multicaja(self):
        self.assertEqual(self.caja_ri.nombre, 'Facturación RI')
        self.assertEqual(self.caja_general.nombre, 'Monotributo y sin factura')
        self.assertTrue(self.caja_ri.activa)
        self.assertTrue(self.caja_general.activa)
        self.assertTrue(ConfiguracionCaja.instancia().multi_caja)

    def test_venta_ri_va_a_su_caja_aunque_se_indique_otra(self):
        sesion_ri = abrir_caja(self.caja_ri, fondo_inicial=0)
        abrir_caja(self.caja_general, fondo_inicial=0)
        venta = self._venta('factura_ri')
        # Aunque en pantalla este seleccionada la general, el canal manda.
        mov = registrar_venta_en_caja(venta, caja=self.caja_general)
        self.assertEqual(mov.sesion_id, sesion_ri.pk)

    def test_monotributo_y_sin_factura_van_a_la_general(self):
        abrir_caja(self.caja_ri, fondo_inicial=0)
        sesion_general = abrir_caja(self.caja_general, fondo_inicial=0)
        mov_c = registrar_venta_en_caja(self._venta('factura_c'), caja=self.caja_ri)
        mov_sf = registrar_venta_en_caja(self._venta('sin_factura'))
        self.assertEqual(mov_c.sesion_id, sesion_general.pk)
        self.assertEqual(mov_sf.sesion_id, sesion_general.pk)

    def test_caja_del_canal_cerrada_avisa_y_no_mezcla_la_plata(self):
        abrir_caja(self.caja_general, fondo_inicial=0)  # la RI queda cerrada
        venta = self._venta('factura_ri')
        with self.assertRaises(ValidationError) as ctx:
            registrar_venta_en_caja(venta)
        self.assertIn('Facturación RI', ' '.join(ctx.exception.messages))
        # No quedo anotada en la caja equivocada.
        self.assertFalse(MovimientoCaja.objects.filter(venta=venta).exists())

    def test_caja_del_canal_inactiva_cae_al_comportamiento_historico(self):
        self.caja_ri.activa = False
        self.caja_ri.save(update_fields=['activa'])
        self.caja_general.activa = False
        self.caja_general.save(update_fields=['activa'])
        comun = Caja.objects.create(nombre='Comun test')
        sesion = abrir_caja(comun, fondo_inicial=0)
        mov = registrar_venta_en_caja(self._venta('factura_ri'))
        self.assertEqual(mov.sesion_id, sesion.pk)

    def test_api_venta_ri_entra_a_su_caja_y_avisa_si_esta_cerrada(self):
        rol = Rol.objects.create(nombre='Cajero fiscal test')
        rol.permisos.set(Permiso.objects.filter(codigo__in=('ver_caja', 'ver_inventario')))
        cajero = Usuario.objects.create_user(
            email='cajero.fiscal@celtuc.test', username='cajero.fiscal', password='x', rol=rol,
        )
        cliente = APIClient()
        cliente.force_authenticate(cajero)

        def vender():
            return cliente.post('/api/inventario/ventas/', {
                'sucursal': self.sucursal.pk,
                'forma_pago': 'efectivo',
                'facturacion': 'factura_ri',
                'caja': self.caja_general.pk,  # el canal la manda a la RI igual
                'items': [{'producto': self.producto.pk, 'cantidad': 1, 'precio_unitario': 10000}],
            }, format='json')

        # Con la caja RI cerrada: la venta vale pero avisa que no entro al arqueo.
        r = vender()
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(r.data['movimiento_caja'])
        self.assertIn('Facturación RI', r.data['aviso_caja'])

        # Con la caja RI abierta: entra a su arqueo y la respuesta dice a cual.
        abrir_caja(self.caja_ri, fondo_inicial=0)
        r = vender()
        self.assertEqual(r.status_code, 201)
        self.assertIsNotNone(r.data['movimiento_caja'])
        self.assertEqual(r.data['caja_arqueo'], 'Facturación RI')
        self.assertEqual(r.data['facturacion'], 'factura_ri')

        estado = cliente.get(f'/api/caja/cajas/{self.caja_ri.pk}/estado/').data
        self.assertEqual(len(estado['movimientos']), 1)
        # La etiqueta de facturacion viaja con el movimiento (se ve en el feed y el Z).
        self.assertEqual(estado['movimientos'][0]['facturacion'], 'factura_ri')

    def test_no_puede_haber_dos_cajas_del_mismo_canal(self):
        admin = Usuario.objects.create_superuser(
            email='admin.fiscal@celtuc.test', username='admin.fiscal', password='x',
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)
        r = cliente.post(
            '/api/caja/cajas/', {'nombre': 'Otra RI', 'canal': 'factura_ri'}, format='json',
        )
        self.assertEqual(r.status_code, 400)
        # Sin canal (caja comun) se puede crear la que haga falta.
        r = cliente.post('/api/caja/cajas/', {'nombre': 'Service'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['canal'], '')
