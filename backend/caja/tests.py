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
    MedioPago,
    MovimientoCaja,
    SesionCaja,
    abrir_caja,
    cerrar_caja,
    configurar_por_sucursal,
    deshabilitar_caja_sucursal,
    eliminar_movimiento,
    habilitar_caja_sucursal,
    registrar_movimiento,
    registrar_venta_en_caja,
    resumen_sesion,
    sucursal_tiene_caja,
)


def _contado(**kwargs):
    # Se arma desde los medios REALES: al sumar uno nuevo (p. ej. la
    # transferencia financiera) los tests no se quedan viejos.
    base = {medio: 0 for medio in MedioPago.values}
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
        movs, avisos = registrar_venta_en_caja(venta, caja=self.caja)
        self.assertEqual(avisos, [])
        self.assertEqual(len(movs), 1)  # un solo medio -> un solo movimiento
        mov = movs[0]
        self.assertEqual(mov.sesion_id, sesion.pk)
        self.assertEqual(mov.tipo, MovimientoCaja.Tipo.VENTA)
        self.assertEqual(mov.medio, 'transferencia')
        self.assertEqual(mov.monto, Decimal('10000'))
        self.assertEqual(mov.venta_id, venta.pk)
        self.assertIn('Fuente caja test', mov.detalle)

    def test_sin_turno_abierto_no_crea_movimientos(self):
        venta = self._venta()
        self.assertEqual(registrar_venta_en_caja(venta, caja=self.caja), ([], []))

    def test_sin_caja_usa_la_unica_sesion_abierta(self):
        sesion = abrir_caja(self.caja, fondo_inicial=0)
        venta = self._venta()
        movs, _ = registrar_venta_en_caja(venta)
        self.assertEqual(movs[0].sesion_id, sesion.pk)

    def test_movimiento_de_venta_no_se_elimina_desde_caja(self):
        abrir_caja(self.caja, fondo_inicial=0)
        venta = self._venta()
        movs, _ = registrar_venta_en_caja(venta)
        with self.assertRaises(ValidationError):
            eliminar_movimiento(movs[0])

    def test_venta_con_varios_medios_genera_un_movimiento_por_medio(self):
        """Cobro dividido: una venta, varias partes, todas del mismo turno."""
        sesion = abrir_caja(self.caja, fondo_inicial=0)
        venta = registrar_venta(
            self.sucursal,
            [(self.producto, 2, Decimal('5000'))],  # total 10000
            pagos=[
                {'medio': 'efectivo', 'monto': Decimal('6000')},
                {'medio': 'transferencia', 'monto': Decimal('4000')},
            ],
        )
        movs, _ = registrar_venta_en_caja(venta, caja=self.caja)
        self.assertEqual(len(movs), 2)
        self.assertTrue(all(m.venta_id == venta.pk for m in movs))
        self.assertTrue(all(m.sesion_id == sesion.pk for m in movs))
        self.assertEqual({m.medio: m.monto for m in movs}, {
            'efectivo': Decimal('6000'), 'transferencia': Decimal('4000'),
        })
        # Cada parte se identifica en el detalle, y el arqueo por medio cierra.
        self.assertIn('Pago 1 de 2', movs[0].detalle)
        resumen = resumen_sesion(sesion)
        self.assertEqual(resumen['esperado_por_medio']['efectivo'], Decimal('6000'))
        self.assertEqual(resumen['esperado_por_medio']['transferencia'], Decimal('4000'))
        self.assertEqual(
            sum(resumen['ventas_por_medio'].values(), Decimal('0')), venta.total,
        )


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
        movs, _ = registrar_venta_en_caja(venta, caja=self.caja_general)
        self.assertEqual(movs[0].sesion_id, sesion_ri.pk)

    def test_monotributo_y_sin_factura_van_a_la_general(self):
        abrir_caja(self.caja_ri, fondo_inicial=0)
        sesion_general = abrir_caja(self.caja_general, fondo_inicial=0)
        movs_c, _ = registrar_venta_en_caja(self._venta('factura_c'), caja=self.caja_ri)
        movs_sf, _ = registrar_venta_en_caja(self._venta('sin_factura'))
        self.assertEqual(movs_c[0].sesion_id, sesion_general.pk)
        self.assertEqual(movs_sf[0].sesion_id, sesion_general.pk)

    def test_venta_mitad_facturada_se_reparte_entre_las_dos_cajas(self):
        """Una venta, dos cajas: lo facturado con el RI a la suya, el resto a la general."""
        sesion_ri = abrir_caja(self.caja_ri, fondo_inicial=0)
        sesion_general = abrir_caja(self.caja_general, fondo_inicial=0)
        venta = registrar_venta(
            self.sucursal,
            [(self.producto, 1, Decimal('10000'))],
            pagos=[
                {'medio': 'transferencia', 'facturacion': 'factura_ri', 'monto': Decimal('6000')},
                {'medio': 'efectivo', 'facturacion': 'sin_factura', 'monto': Decimal('4000')},
            ],
        )
        movs, avisos = registrar_venta_en_caja(venta)
        self.assertEqual(avisos, [])
        self.assertEqual(len(movs), 2)
        # Sigue siendo UNA sola venta, repartida en las dos cajas.
        self.assertTrue(all(m.venta_id == venta.pk for m in movs))
        por_sesion = {m.sesion_id: m for m in movs}
        self.assertEqual(por_sesion[sesion_ri.pk].monto, Decimal('6000'))
        self.assertEqual(por_sesion[sesion_ri.pk].medio, 'transferencia')
        self.assertEqual(por_sesion[sesion_general.pk].monto, Decimal('4000'))
        self.assertEqual(por_sesion[sesion_general.pk].medio, 'efectivo')
        # Cada arqueo ve solo su parte.
        self.assertEqual(
            resumen_sesion(sesion_ri)['esperado_por_medio']['transferencia'], Decimal('6000'),
        )
        self.assertEqual(
            resumen_sesion(sesion_general)['esperado_por_medio']['efectivo'], Decimal('4000'),
        )

    def test_cada_movimiento_informa_la_facturacion_de_su_parte(self):
        """El ticket Z agrupa por facturación: cada parte tiene que decir la suya."""
        abrir_caja(self.caja_ri, fondo_inicial=0)
        abrir_caja(self.caja_general, fondo_inicial=0)
        venta = registrar_venta(
            self.sucursal,
            [(self.producto, 1, Decimal('10000'))],
            pagos=[
                {'medio': 'efectivo', 'facturacion': 'factura_ri', 'monto': Decimal('7000')},
                {'medio': 'efectivo', 'facturacion': 'sin_factura', 'monto': Decimal('3000')},
            ],
        )
        movs, _ = registrar_venta_en_caja(venta)
        # Mismo medio en las dos partes: sin el vinculo al pago serian
        # indistinguibles y el Z contaria toda la venta como facturada.
        self.assertEqual(len(movs), 2)
        por_facturacion = {m.pago.facturacion: m.monto for m in movs}
        self.assertEqual(por_facturacion['factura_ri'], Decimal('7000'))
        self.assertEqual(por_facturacion['sin_factura'], Decimal('3000'))

    def test_parte_facturada_con_su_caja_cerrada_avisa_y_entra_el_resto(self):
        """La caja RI cerrada no frena la parte que sí puede entrar."""
        sesion_general = abrir_caja(self.caja_general, fondo_inicial=0)  # la RI queda cerrada
        venta = registrar_venta(
            self.sucursal,
            [(self.producto, 1, Decimal('10000'))],
            pagos=[
                {'medio': 'transferencia', 'facturacion': 'factura_ri', 'monto': Decimal('6000')},
                {'medio': 'efectivo', 'facturacion': 'sin_factura', 'monto': Decimal('4000')},
            ],
        )
        movs, avisos = registrar_venta_en_caja(venta)
        self.assertEqual(len(movs), 1)
        self.assertEqual(movs[0].sesion_id, sesion_general.pk)
        self.assertEqual(movs[0].monto, Decimal('4000'))
        self.assertEqual(len(avisos), 1)
        self.assertIn('Facturación RI', avisos[0])

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
        movs, _ = registrar_venta_en_caja(self._venta('factura_ri'))
        self.assertEqual(movs[0].sesion_id, sesion.pk)

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


class TransferenciaFinancieraTests(TestCase):
    """La transferencia financiera (monotributo) se concilia APARTE de la comun.

    Son dos rieles distintos: si se sumaran juntas no se podria cuadrar ninguna
    de las dos por separado en el cierre.
    """

    def setUp(self):
        self.caja = Caja.objects.create(nombre='Caja financiera test')
        self.sesion = abrir_caja(self.caja, fondo_inicial=0)

    def test_es_un_medio_valido_y_distinto(self):
        self.assertIn('transf_financiera', MedioPago.values)
        self.assertNotEqual(MedioPago.TRANSFERENCIA, MedioPago.TRANSF_FINANCIERA)

    def test_no_se_suma_con_la_transferencia_comun(self):
        registrar_movimiento(
            self.sesion, tipo=MovimientoCaja.Tipo.VENTA, medio='transferencia',
            monto=8000, motivo='Venta RI',
        )
        registrar_movimiento(
            self.sesion, tipo=MovimientoCaja.Tipo.VENTA, medio='transf_financiera',
            monto=5000, motivo='Venta monotributo',
        )
        r = resumen_sesion(self.sesion)
        self.assertEqual(r['ventas_por_medio']['transferencia'], Decimal('8000'))
        self.assertEqual(r['ventas_por_medio']['transf_financiera'], Decimal('5000'))
        self.assertEqual(r['esperado_por_medio']['transf_financiera'], Decimal('5000'))
        self.assertEqual(r['operaciones_por_medio']['transf_financiera'], 1)

    def test_el_cierre_la_cuadra_por_separado(self):
        registrar_movimiento(
            self.sesion, tipo=MovimientoCaja.Tipo.VENTA, medio='transf_financiera',
            monto=5000, motivo='Venta monotributo',
        )
        cierre = cerrar_caja(
            self.sesion,
            contado_por_medio=_contado(transf_financiera=5000),
            fondo_siguiente=0,
        )
        self.assertEqual(cierre.diferencia_por_medio['transf_financiera'], 0)
        self.assertEqual(cierre.diferencia_total, 0)


class CajaPorSucursalTests(TestCase):
    """Cada sucursal cierra su propio cajon (y se elige cual tiene caja).

    El modo arranca APAGADO: hasta que un admin lo prende, todo funciona como
    siempre con las cajas compartidas. Prendido, la plata de una sucursal nunca
    cae en el cajon de otra.
    """

    def setUp(self):
        self.ri_compartida = Caja.objects.get(canal=Caja.Canal.FACTURA_RI, sucursal__isnull=True)
        self.general_compartida = Caja.objects.get(canal=Caja.Canal.GENERAL, sucursal__isnull=True)
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria test')
        self.producto = Producto.objects.create(categoria=categoria, nombre='Modulo sucursal test')
        self.solar = Sucursal.objects.create(nombre='Solar suc test', orden=1)
        self.salta = Sucursal.objects.create(nombre='Salta suc test', orden=2)
        self.oficina = Sucursal.objects.create(nombre='Oficina suc test', orden=3)
        for sucursal in (self.solar, self.salta, self.oficina):
            aplicar_ajuste(self.producto, sucursal, delta=50)
        self.admin = Usuario.objects.create_superuser(
            email='admin.suc@celtuc.test', username='admin.suc', password='x',
        )

    def _venta(self, sucursal, facturacion='sin_factura', forma_pago='efectivo', pagos=None):
        return registrar_venta(
            sucursal,
            [(self.producto, 1, Decimal('10000'))],
            forma_pago=forma_pago,
            facturacion=facturacion,
            pagos=pagos,
        )

    def _prender(self, *sucursales):
        return configurar_por_sucursal(activar=True, sucursales=list(sucursales))

    def _caja(self, sucursal, canal):
        return Caja.objects.get(sucursal=sucursal, canal=canal)

    # --- Modo apagado: nada cambia ------------------------------------------

    def test_arranca_apagado_con_las_cajas_compartidas(self):
        self.assertFalse(ConfiguracionCaja.instancia().por_sucursal)
        self.assertFalse(Caja.objects.filter(sucursal__isnull=False).exists())

    def test_apagado_las_ventas_de_todas_las_sucursales_van_a_las_compartidas(self):
        sesion = abrir_caja(self.general_compartida, fondo_inicial=0)
        movs_solar, _ = registrar_venta_en_caja(self._venta(self.solar))
        movs_salta, _ = registrar_venta_en_caja(self._venta(self.salta))
        self.assertEqual(movs_solar[0].sesion_id, sesion.pk)
        self.assertEqual(movs_salta[0].sesion_id, sesion.pk)

    # --- Prender el modo ------------------------------------------------------

    def test_prender_exige_cerrar_los_turnos_compartidos(self):
        abrir_caja(self.ri_compartida, fondo_inicial=0)
        with self.assertRaises(ValidationError) as ctx:
            self._prender(self.solar)
        self.assertIn('Facturación RI', ' '.join(ctx.exception.messages))
        self.assertFalse(ConfiguracionCaja.instancia().por_sucursal)
        self.assertFalse(Caja.objects.filter(sucursal__isnull=False).exists())

    def test_prender_da_dos_cajas_fiscales_a_cada_sucursal_elegida(self):
        self._prender(self.solar, self.salta)
        self.assertTrue(ConfiguracionCaja.instancia().por_sucursal)
        for sucursal in (self.solar, self.salta):
            cajas = Caja.objects.filter(sucursal=sucursal, activa=True)
            self.assertEqual(
                {(c.canal, c.nombre) for c in cajas},
                {('factura_ri', 'Facturación RI'), ('general', 'Monotributo y sin factura')},
            )
        self.assertFalse(sucursal_tiene_caja(self.oficina))

    def test_prender_sin_lista_le_da_caja_a_todas_las_activas(self):
        configurar_por_sucursal(activar=True)
        for sucursal in Sucursal.objects.filter(activa=True):
            self.assertTrue(sucursal_tiene_caja(sucursal))

    # --- Enrutamiento por sucursal -------------------------------------------

    def test_la_venta_entra_a_la_caja_de_su_sucursal(self):
        self._prender(self.solar, self.salta)
        ri_solar = abrir_caja(self._caja(self.solar, 'factura_ri'), fondo_inicial=0)
        general_solar = abrir_caja(self._caja(self.solar, 'general'), fondo_inicial=0)
        ri_salta = abrir_caja(self._caja(self.salta, 'factura_ri'), fondo_inicial=0)
        general_salta = abrir_caja(self._caja(self.salta, 'general'), fondo_inicial=0)

        movs, _ = registrar_venta_en_caja(self._venta(self.solar, 'factura_ri'))
        self.assertEqual(movs[0].sesion_id, ri_solar.pk)
        movs, _ = registrar_venta_en_caja(self._venta(self.salta, 'factura_ri'))
        self.assertEqual(movs[0].sesion_id, ri_salta.pk)
        movs, _ = registrar_venta_en_caja(self._venta(self.salta, 'factura_c'))
        self.assertEqual(movs[0].sesion_id, general_salta.pk)
        movs, _ = registrar_venta_en_caja(self._venta(self.solar, 'sin_factura'))
        self.assertEqual(movs[0].sesion_id, general_solar.pk)

    def test_la_caja_indicada_de_otra_sucursal_no_se_usa(self):
        self._prender(self.solar, self.salta)
        general_salta = self._caja(self.salta, 'general')
        abrir_caja(general_salta, fondo_inicial=0)
        # Solar tiene caja pero cerrada: la plata de Solar NO cae en Salta.
        venta = self._venta(self.solar, 'sin_factura')
        with self.assertRaises(ValidationError):
            registrar_venta_en_caja(venta, caja=general_salta)
        self.assertFalse(MovimientoCaja.objects.filter(venta=venta).exists())

    def test_respaldo_sin_canal_queda_dentro_de_la_sucursal(self):
        self._prender(self.solar, self.salta)
        # Solar se queda solo con una caja comun (sus fiscales desactivadas).
        Caja.objects.filter(sucursal=self.solar).update(activa=False)
        comun_solar = Caja.objects.create(nombre='Comun solar', sucursal=self.solar)
        sesion_solar = abrir_caja(comun_solar, fondo_inicial=0)
        abrir_caja(self._caja(self.salta, 'general'), fondo_inicial=0)
        movs, _ = registrar_venta_en_caja(self._venta(self.solar, 'factura_ri'))
        self.assertEqual(movs[0].sesion_id, sesion_solar.pk)

    def test_venta_dividida_se_reparte_entre_las_cajas_de_su_sucursal(self):
        self._prender(self.solar, self.salta)
        ri_solar = abrir_caja(self._caja(self.solar, 'factura_ri'), fondo_inicial=0)
        general_solar = abrir_caja(self._caja(self.solar, 'general'), fondo_inicial=0)
        abrir_caja(self._caja(self.salta, 'factura_ri'), fondo_inicial=0)
        venta = self._venta(self.solar, pagos=[
            {'medio': 'transferencia', 'facturacion': 'factura_ri', 'monto': Decimal('6000')},
            {'medio': 'efectivo', 'facturacion': 'sin_factura', 'monto': Decimal('4000')},
        ])
        movs, avisos = registrar_venta_en_caja(venta)
        self.assertEqual(avisos, [])
        self.assertEqual({m.sesion_id: m.monto for m in movs}, {
            ri_solar.pk: Decimal('6000'), general_solar.pk: Decimal('4000'),
        })

    def test_sucursal_sin_caja_no_entra_a_ningun_arqueo(self):
        self._prender(self.solar)
        abrir_caja(self._caja(self.solar, 'general'), fondo_inicial=0)
        venta = self._venta(self.oficina)
        movs, avisos = registrar_venta_en_caja(venta)
        self.assertEqual(movs, [])
        self.assertIn('Oficina suc test', avisos[0])
        self.assertFalse(MovimientoCaja.objects.filter(venta=venta).exists())

    # --- Abrir turnos segun el modo --------------------------------------------

    def test_con_el_modo_prendido_no_se_abren_las_compartidas(self):
        self._prender(self.solar)
        with self.assertRaises(ValidationError):
            abrir_caja(self.general_compartida, fondo_inicial=0)

    def test_con_el_modo_apagado_no_se_abren_las_de_sucursal(self):
        self._prender(self.solar)
        configurar_por_sucursal(activar=False)
        with self.assertRaises(ValidationError):
            abrir_caja(self._caja(self.solar, 'general'), fondo_inicial=0)

    # --- Dar y quitar caja ------------------------------------------------------

    def test_no_se_quita_la_caja_con_un_turno_abierto(self):
        self._prender(self.solar)
        abrir_caja(self._caja(self.solar, 'factura_ri'), fondo_inicial=0)
        with self.assertRaises(ValidationError):
            deshabilitar_caja_sucursal(self.solar)
        self.assertTrue(sucursal_tiene_caja(self.solar))

    def test_quitar_y_volver_a_dar_caja_reusa_las_mismas_cajas(self):
        self._prender(self.solar)
        ids = set(Caja.objects.filter(sucursal=self.solar).values_list('pk', flat=True))
        deshabilitar_caja_sucursal(self.solar)
        self.assertFalse(sucursal_tiene_caja(self.solar))
        habilitar_caja_sucursal(self.solar)
        self.assertEqual(
            set(Caja.objects.filter(sucursal=self.solar, activa=True).values_list('pk', flat=True)),
            ids,
        )

    def test_prender_con_otra_lista_le_quita_la_caja_a_las_que_no_estan(self):
        self._prender(self.solar, self.salta)
        self._prender(self.solar)
        self.assertTrue(sucursal_tiene_caja(self.solar))
        self.assertFalse(sucursal_tiene_caja(self.salta))

    # --- Apagar el modo -----------------------------------------------------------

    def test_apagar_exige_cerrar_los_turnos_de_las_sucursales(self):
        self._prender(self.solar)
        abrir_caja(self._caja(self.solar, 'general'), fondo_inicial=0)
        with self.assertRaises(ValidationError):
            configurar_por_sucursal(activar=False)
        self.assertTrue(ConfiguracionCaja.instancia().por_sucursal)

    def test_apagar_vuelve_a_las_compartidas(self):
        self._prender(self.solar)
        configurar_por_sucursal(activar=False)
        sesion = abrir_caja(self.general_compartida, fondo_inicial=0)
        movs, _ = registrar_venta_en_caja(self._venta(self.solar))
        self.assertEqual(movs[0].sesion_id, sesion.pk)

    def test_apagar_sin_compartidas_activas_las_reactiva(self):
        self._prender(self.solar)
        Caja.objects.filter(sucursal__isnull=True).update(activa=False)
        configurar_por_sucursal(activar=False)
        self.assertTrue(Caja.objects.get(pk=self.ri_compartida.pk).activa)
        self.assertTrue(Caja.objects.get(pk=self.general_compartida.pk).activa)

    # --- Cierre e historial ---------------------------------------------------------

    def test_el_cierre_guarda_la_sucursal(self):
        self._prender(self.salta)
        sesion = abrir_caja(self._caja(self.salta, 'general'), fondo_inicial=0)
        cierre = cerrar_caja(sesion, contado_por_medio=_contado(), fondo_siguiente=0)
        self.assertEqual(cierre.sucursal_nombre, 'Salta suc test')
        # Los cierres de las compartidas quedan sin sucursal.
        configurar_por_sucursal(activar=False)
        sesion = abrir_caja(self.general_compartida, fondo_inicial=0)
        cierre = cerrar_caja(sesion, contado_por_medio=_contado(), fondo_siguiente=0)
        self.assertEqual(cierre.sucursal_nombre, '')

    # --- API ------------------------------------------------------------------------

    def _cajero(self):
        rol = Rol.objects.create(nombre='Cajero sucursal test')
        rol.permisos.set(Permiso.objects.filter(codigo__in=('ver_caja', 'ver_inventario')))
        cajero = Usuario.objects.create_user(
            email='cajero.suc@celtuc.test', username='cajero.suc', password='x', rol=rol,
        )
        cliente = APIClient()
        cliente.force_authenticate(cajero)
        return cliente

    def _cliente_admin(self):
        cliente = APIClient()
        cliente.force_authenticate(self.admin)
        return cliente

    def test_api_solo_el_admin_cambia_el_modo_y_las_sucursales(self):
        cajero = self._cajero()
        r = cajero.patch('/api/caja/config/', {'por_sucursal': True}, format='json')
        self.assertEqual(r.status_code, 403)
        r = cajero.patch(f'/api/caja/sucursales/{self.solar.pk}/', {'tiene_caja': True}, format='json')
        self.assertEqual(r.status_code, 403)
        r = cajero.get('/api/caja/sucursales/')
        self.assertEqual(r.status_code, 200)

    def test_api_prender_el_modo_con_las_sucursales_elegidas(self):
        admin = self._cliente_admin()
        r = admin.patch('/api/caja/config/', {
            'por_sucursal': True, 'sucursales_con_caja': [self.solar.pk, self.salta.pk],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['por_sucursal'])

        r = admin.get('/api/caja/sucursales/')
        por_nombre = {s['nombre']: s for s in r.data}
        self.assertTrue(por_nombre['Solar suc test']['tiene_caja'])
        self.assertTrue(por_nombre['Salta suc test']['tiene_caja'])
        self.assertFalse(por_nombre['Oficina suc test']['tiene_caja'])

        r = admin.get('/api/caja/cajas/')
        de_salta = [c for c in r.data if c['sucursal'] == self.salta.pk]
        self.assertEqual(len(de_salta), 2)
        self.assertEqual(de_salta[0]['sucursal_nombre'], 'Salta suc test')

        r = admin.patch(f'/api/caja/sucursales/{self.oficina.pk}/', {'tiene_caja': True}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['tiene_caja'])

    def test_api_cambiar_el_modo_con_turnos_abiertos_devuelve_400(self):
        abrir_caja(self.general_compartida, fondo_inicial=0)
        admin = self._cliente_admin()
        r = admin.patch('/api/caja/config/', {'por_sucursal': True, 'cierre_ciego': False}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Monotributo y sin factura', r.data['detail'])
        # Todo o nada: el resto del PATCH tampoco se aplico.
        config = ConfiguracionCaja.instancia()
        self.assertFalse(config.por_sucursal)
        self.assertTrue(config.cierre_ciego)

    def test_api_patch_de_config_sin_modo_no_lo_toca(self):
        self._prender(self.solar)
        admin = self._cliente_admin()
        r = admin.patch('/api/caja/config/', {'cierre_ciego': False}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['por_sucursal'])
        self.assertTrue(ConfiguracionCaja.instancia().por_sucursal)

    def test_api_mismo_nombre_y_canal_en_distintas_sucursales(self):
        self._prender(self.solar)
        admin = self._cliente_admin()
        # Salta todavia no tiene: puede tener su propia «Facturación RI».
        r = admin.post('/api/caja/cajas/', {
            'nombre': 'Facturación RI', 'canal': 'factura_ri', 'sucursal': self.salta.pk,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        # Pero no dos en la misma sucursal.
        r = admin.post('/api/caja/cajas/', {
            'nombre': 'Otra RI', 'canal': 'factura_ri', 'sucursal': self.solar.pk,
        }, format='json')
        self.assertEqual(r.status_code, 400)
        # Y la sucursal de una caja no se cambia.
        caja = self._caja(self.solar, 'general')
        r = admin.patch(f'/api/caja/cajas/{caja.pk}/', {'sucursal': self.salta.pk}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_api_venta_de_sucursal_sin_caja_avisa_y_vale(self):
        self._prender(self.solar)
        cajero = self._cajero()
        r = cajero.post('/api/inventario/ventas/', {
            'sucursal': self.oficina.pk,
            'forma_pago': 'efectivo',
            'items': [{'producto': self.producto.pk, 'cantidad': 1, 'precio_unitario': 500}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(r.data['movimiento_caja'])
        self.assertIn('no tiene caja', r.data['aviso_caja'])

    def test_api_cierres_se_filtran_por_sucursal(self):
        self._prender(self.solar, self.salta)
        for sucursal in (self.solar, self.salta):
            sesion = abrir_caja(self._caja(sucursal, 'general'), fondo_inicial=0)
            cerrar_caja(sesion, contado_por_medio=_contado(), fondo_siguiente=0)
        r = self._cajero().get(f'/api/caja/cierres/?sucursal={self.salta.pk}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['sucursal'], self.salta.pk)
        self.assertEqual(r.data[0]['sucursal_nombre'], 'Salta suc test')


class CajaAccesoPorSucursalTests(TestCase):
    """Con caja por sucursal, cada empleado ve y opera SOLO la caja de su sucursal.

    El administrador y el superadministrador ven todas. Un empleado sin
    sucursal asignada tambien (no hay a cual limitarlo). Con el modo apagado
    no se limita nada: las cajas son compartidas.
    """

    def setUp(self):
        from empleados.models import Empleado

        self.solar = Sucursal.objects.create(nombre='Solar acceso test', orden=1)
        self.salta = Sucursal.objects.create(nombre='Salta acceso test', orden=2)
        configurar_por_sucursal(activar=True, sucursales=[self.solar, self.salta])
        self.general_solar = Caja.objects.get(sucursal=self.solar, canal=Caja.Canal.GENERAL)
        self.general_salta = Caja.objects.get(sucursal=self.salta, canal=Caja.Canal.GENERAL)

        rol = Rol.objects.create(nombre='Cajero acceso test')
        rol.permisos.set(Permiso.objects.filter(codigo__in=('ver_caja', 'ver_inventario')))
        self.rol = rol

        def cuenta(username, *, sucursal=None, con_empleado=True, rol_cuenta=None):
            usuario = Usuario.objects.create_user(
                email=f'{username}@celtuc.test', username=username, password='x',
                rol=rol_cuenta or rol,
            )
            if con_empleado:
                Empleado.objects.create(nombre=username, usuario=usuario, sucursal=sucursal)
            cliente = APIClient()
            cliente.force_authenticate(usuario)
            return cliente

        self.empleado_salta = cuenta('empleado.salta', sucursal=self.salta)
        self.empleado_sin_sucursal = cuenta('empleado.sin.sucursal')
        self.cuenta_sin_empleado = cuenta('cuenta.sin.empleado', con_empleado=False)
        rol_admin = Rol.objects.create(nombre='Admin acceso test', es_admin=True)
        self.admin_con_sucursal = cuenta('admin.salta', sucursal=self.salta, rol_cuenta=rol_admin)
        superadmin = Usuario.objects.create_superuser(
            email='super.acceso@celtuc.test', username='super.acceso', password='x',
        )
        self.superadmin = APIClient()
        self.superadmin.force_authenticate(superadmin)

    @staticmethod
    def _ids(respuesta):
        return {item['id'] for item in respuesta.data}

    def _cajas_de(self, cliente):
        r = cliente.get('/api/caja/cajas/')
        self.assertEqual(r.status_code, 200)
        return {c['sucursal'] for c in r.data}

    # --- Lo que ve cada uno --------------------------------------------------------

    def test_el_empleado_ve_solo_las_cajas_de_su_sucursal(self):
        self.assertEqual(self._cajas_de(self.empleado_salta), {self.salta.pk})

    def test_admin_y_superadmin_ven_todas(self):
        # Aunque el admin tenga sucursal: ser admin manda.
        for cliente in (self.superadmin, self.admin_con_sucursal):
            self.assertTrue({self.solar.pk, self.salta.pk} <= self._cajas_de(cliente))

    def test_empleado_sin_sucursal_ve_todas(self):
        for cliente in (self.empleado_sin_sucursal, self.cuenta_sin_empleado):
            self.assertTrue({self.solar.pk, self.salta.pk} <= self._cajas_de(cliente))

    def test_el_empleado_no_ve_el_turno_de_otra_sucursal(self):
        r = self.empleado_salta.get(f'/api/caja/cajas/{self.general_solar.pk}/estado/')
        self.assertEqual(r.status_code, 404)
        r = self.empleado_salta.get(f'/api/caja/cajas/{self.general_solar.pk}/')
        self.assertEqual(r.status_code, 404)
        r = self.empleado_salta.get(f'/api/caja/cajas/{self.general_salta.pk}/estado/')
        self.assertEqual(r.status_code, 200)

    def test_sucursales_abiertas_y_cierres_solo_de_la_propia(self):
        for caja in (self.general_solar, self.general_salta):
            sesion = abrir_caja(caja, fondo_inicial=0)
            cerrar_caja(sesion, contado_por_medio=_contado(), fondo_siguiente=0)
            abrir_caja(caja, fondo_inicial=0)

        r = self.empleado_salta.get('/api/caja/sucursales/')
        self.assertEqual(self._ids(r), {self.salta.pk})
        r = self.empleado_salta.get('/api/caja/abiertas/')
        self.assertEqual(set(r.data), {self.general_salta.pk})
        r = self.empleado_salta.get('/api/caja/cierres/')
        self.assertEqual({c['sucursal'] for c in r.data}, {self.salta.pk})
        # Pedir explicitamente la otra sucursal no la destapa.
        r = self.empleado_salta.get(f'/api/caja/cierres/?sucursal={self.solar.pk}')
        self.assertEqual(r.data, [])

        r = self.superadmin.get('/api/caja/cierres/')
        self.assertTrue({self.solar.pk, self.salta.pk} <= {c['sucursal'] for c in r.data})
        r = self.superadmin.get('/api/caja/abiertas/')
        self.assertTrue({self.general_solar.pk, self.general_salta.pk} <= set(r.data))

    # --- Lo que puede operar ----------------------------------------------------------

    def test_el_empleado_no_abre_la_caja_de_otra_sucursal(self):
        r = self.empleado_salta.post('/api/caja/abrir/', {
            'caja': self.general_solar.pk, 'fondo_inicial': 0,
        }, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertIn('otra sucursal', r.data['detail'])
        self.assertFalse(SesionCaja.objects.filter(caja=self.general_solar).exists())

        r = self.empleado_salta.post('/api/caja/abrir/', {
            'caja': self.general_salta.pk, 'fondo_inicial': 0,
        }, format='json')
        self.assertEqual(r.status_code, 201)

    def test_el_empleado_no_mueve_ni_cierra_la_caja_de_otra_sucursal(self):
        sesion = abrir_caja(self.general_solar, fondo_inicial=5000)
        mov = registrar_movimiento(sesion, tipo=MovimientoCaja.Tipo.INGRESO, monto=100, motivo='Cambio')

        r = self.empleado_salta.post('/api/caja/movimientos/', {
            'sesion': sesion.pk, 'tipo': 'egreso', 'monto': 10, 'motivo': 'Gasto',
        }, format='json')
        self.assertEqual(r.status_code, 403)
        r = self.empleado_salta.delete(f'/api/caja/movimientos/{mov.pk}/')
        self.assertEqual(r.status_code, 403)
        r = self.empleado_salta.post('/api/caja/cerrar/', {
            'sesion': sesion.pk, 'contado_por_medio': _contado(efectivo=5100), 'fondo_siguiente': 0,
        }, format='json')
        self.assertEqual(r.status_code, 403)

        sesion.refresh_from_db()
        self.assertEqual(sesion.estado, SesionCaja.Estado.ABIERTA)
        self.assertEqual(sesion.movimientos.count(), 1)

        # El superadmin si puede.
        r = self.superadmin.post('/api/caja/cerrar/', {
            'sesion': sesion.pk, 'contado_por_medio': _contado(efectivo=5100), 'fondo_siguiente': 0,
        }, format='json')
        self.assertEqual(r.status_code, 201)

    def test_el_empleado_opera_su_caja_de_punta_a_punta(self):
        r = self.empleado_salta.post('/api/caja/abrir/', {
            'caja': self.general_salta.pk, 'fondo_inicial': 1000,
        }, format='json')
        sesion_id = r.data['id']
        r = self.empleado_salta.post('/api/caja/movimientos/', {
            'sesion': sesion_id, 'tipo': 'egreso', 'monto': 200, 'motivo': 'Gasto',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        r = self.empleado_salta.delete(f'/api/caja/movimientos/{r.data["id"]}/')
        self.assertEqual(r.status_code, 204)
        r = self.empleado_salta.post('/api/caja/cerrar/', {
            'sesion': sesion_id, 'contado_por_medio': _contado(efectivo=1000), 'fondo_siguiente': 1000,
        }, format='json')
        self.assertEqual(r.status_code, 201)

    # --- Modo apagado: sin limites ----------------------------------------------------------

    def test_con_el_modo_apagado_no_se_limita_a_nadie(self):
        configurar_por_sucursal(activar=False)
        compartida = Caja.objects.filter(sucursal__isnull=True, activa=True).first()
        self.assertIn(None, self._cajas_de(self.empleado_salta))
        r = self.empleado_salta.get(f'/api/caja/cajas/{compartida.pk}/estado/')
        self.assertEqual(r.status_code, 200)
        r = self.empleado_salta.post('/api/caja/abrir/', {
            'caja': compartida.pk, 'fondo_inicial': 0,
        }, format='json')
        self.assertEqual(r.status_code, 201)
