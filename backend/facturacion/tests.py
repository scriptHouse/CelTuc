"""Tests de facturacion que NO tocan ARCA (logica pura, mapeo y serializers).

La conexion real con ARCA (WSAA/WSFEv1) necesita un certificado valido y red, asi
que no se prueba aca; si se prueba todo lo que la rodea, que es donde se cometen
errores: el tipo de comprobante, los totales, el armado del pedido y que las
credenciales nunca se devuelvan por la API.
"""
import base64
import datetime
import json
from decimal import Decimal
from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from usuarios.models import Permiso, Rol, Usuario

from .arca import qr
from .arca.servicio import _construir_detalle, _iva_id
from .concepto import agrupar_en_concepto
from .limites import facturado_del_mes
from .logica import calcular_totales, tipo_comprobante
from .models import Comprobante, ConceptoFactura, Emisor, LimiteMensual
from .serializers import EmisorSerializer


class LogicaFiscalTests(TestCase):
    def test_tipo_comprobante(self):
        self.assertEqual(tipo_comprobante('monotributista', 'consumidor_final'), 'C')
        self.assertEqual(tipo_comprobante('monotributista', 'responsable_inscripto'), 'C')
        self.assertEqual(tipo_comprobante('responsable_inscripto', 'responsable_inscripto'), 'A')
        self.assertEqual(tipo_comprobante('responsable_inscripto', 'consumidor_final'), 'B')
        self.assertEqual(tipo_comprobante('responsable_inscripto', 'monotributista'), 'B')

    def test_totales_con_iva(self):
        items = [
            {'cantidad': Decimal('2'), 'precio_unitario': Decimal('100')},
            {'cantidad': 1, 'precio_unitario': 50},
        ]
        self.assertEqual(
            calcular_totales(items, 'B', Decimal('21')),
            {'neto': Decimal('250.00'), 'iva': Decimal('52.50'), 'total': Decimal('302.50')},
        )

    def test_totales_factura_c_sin_iva(self):
        items = [{'cantidad': 3, 'precio_unitario': 100}]
        self.assertEqual(
            calcular_totales(items, 'C', Decimal('21')),
            {'neto': Decimal('300.00'), 'iva': Decimal('0.00'), 'total': Decimal('300.00')},
        )

    def test_iva_id(self):
        self.assertEqual(_iva_id(Decimal('21')), 5)
        self.assertEqual(_iva_id(Decimal('10.5')), 4)
        self.assertEqual(_iva_id(Decimal('27')), 6)
        self.assertEqual(_iva_id(Decimal('99')), 5)  # default 21 %


class ConstruirDetalleTests(TestCase):
    fecha = datetime.date(2026, 6, 26)

    def test_factura_a_discrimina_iva(self):
        totales = {'neto': Decimal('100.00'), 'iva': Decimal('21.00'), 'total': Decimal('121.00')}
        d = _construir_detalle(
            tipo='A', concepto=1, doc_tipo='CUIT', doc_numero='30714567893', numero=5,
            fecha=self.fecha, vencimiento=None, totales=totales, alicuota=Decimal('21'),
            cliente_condicion='responsable_inscripto',
        )
        self.assertEqual(d['CbteDesde'], 5)
        self.assertEqual(d['DocTipo'], 80)
        self.assertEqual(d['DocNro'], 30714567893)
        self.assertEqual(d['CbteFch'], '20260626')
        self.assertEqual(d['CondicionIVAReceptorId'], 1)
        self.assertEqual(d['ImpNeto'], 100.0)
        self.assertEqual(d['ImpIVA'], 21.0)
        self.assertEqual(d['Iva']['AlicIva'][0], {'Id': 5, 'BaseImp': 100.0, 'Importe': 21.0})

    def test_factura_c_sin_iva(self):
        totales = {'neto': Decimal('100.00'), 'iva': Decimal('0.00'), 'total': Decimal('100.00')}
        d = _construir_detalle(
            tipo='C', concepto=1, doc_tipo='CF', doc_numero='', numero=1,
            fecha=self.fecha, vencimiento=None, totales=totales, alicuota=Decimal('21'),
            cliente_condicion='consumidor_final',
        )
        self.assertNotIn('Iva', d)
        self.assertEqual(d['DocTipo'], 99)
        self.assertEqual(d['DocNro'], 0)
        self.assertEqual(d['CondicionIVAReceptorId'], 5)
        self.assertEqual(d['ImpIVA'], 0.0)

    def test_servicios_agrega_fechas(self):
        totales = {'neto': Decimal('100.00'), 'iva': Decimal('21.00'), 'total': Decimal('121.00')}
        d = _construir_detalle(
            tipo='B', concepto=2, doc_tipo='CF', doc_numero='', numero=1,
            fecha=self.fecha, vencimiento=datetime.date(2026, 7, 10), totales=totales,
            alicuota=Decimal('21'), cliente_condicion='consumidor_final',
        )
        self.assertEqual(d['FchServDesde'], '20260626')
        self.assertEqual(d['FchServHasta'], '20260626')
        self.assertEqual(d['FchVtoPago'], '20260710')


class QRTests(TestCase):
    def test_url_y_payload(self):
        url = qr.construir_url(
            fecha='2026-06-26', cuit_emisor='20111111112', punto_venta=1, tipo_cbte=6,
            numero=1, importe_total=Decimal('121.00'), tipo_doc_receptor=99,
            nro_doc_receptor='', cae='71234567890123',
        )
        self.assertTrue(url.startswith('https://www.afip.gob.ar/fe/qr/?p='))
        payload = json.loads(base64.b64decode(url.split('p=')[1]))
        self.assertEqual(payload['cuit'], 20111111112)
        self.assertEqual(payload['codAut'], 71234567890123)
        self.assertEqual(payload['tipoCodAut'], 'E')
        self.assertEqual(payload['nroDocRec'], 0)


class EmisorPermisosTests(TestCase):
    """Gestionar emisores (crear/editar/borrar) es SOLO del superadministrador.
    Leer (listar para elegir el emisor) lo puede hacer un facturador con permiso."""

    def setUp(self):
        self.super = Usuario.objects.create_superuser(
            email='sup@celtuc.ar', username='sup', password='x',
        )
        # Admin comun: rol Administrador (es_admin) pero NO superusuario.
        self.admin = Usuario.objects.create_user(
            email='adm@celtuc.ar', username='adm', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )
        # Facturador: rol con permiso ver_facturacion, no admin.
        rol_cajero = Rol.objects.create(nombre='Cajero')
        rol_cajero.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.fact = Usuario.objects.create_user(
            email='fac@celtuc.ar', username='fac', password='x', rol=rol_cajero,
        )

    def _payload(self):
        return {
            'nombre': 'Emisor X', 'condicion': 'monotributista',
            'cuit': '20111111112', 'punto_venta': 1, 'produccion': False,
        }

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_admin_comun_no_crea_emisor(self):
        r = self._client(self.admin).post(
            reverse('facturacion:emisor-list'), self._payload(), format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_facturador_no_crea_emisor(self):
        r = self._client(self.fact).post(
            reverse('facturacion:emisor-list'), self._payload(), format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_superadmin_si_crea_emisor(self):
        r = self._client(self.super).post(
            reverse('facturacion:emisor-list'), self._payload(), format='json',
        )
        self.assertEqual(r.status_code, 201)

    def test_facturador_puede_listar_emisores(self):
        r = self._client(self.fact).get(reverse('facturacion:emisor-list'))
        self.assertEqual(r.status_code, 200)


class EmitirDescuentaStockTests(TestCase):
    """Al emitir con `sucursal_stock` + `producto` en los items, baja el stock.

    La emision en ARCA se mockea (devuelve un comprobante ya creado); lo que se
    prueba es el hook de stock: descuenta con nota "Factura ...", nunca deja
    negativo y los problemas van como `avisos_stock` sin voltear la factura.
    """

    def setUp(self):
        from inventario.models import Sucursal, aplicar_ajuste
        from productos.models import CategoriaProducto, Producto

        rol = Rol.objects.create(nombre='CajeroStock')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.fact = Usuario.objects.create_user(
            email='fs@celtuc.ar', username='facstock', password='x', rol=rol,
        )
        self.emisor = Emisor.objects.create(
            nombre='Emisor Test', condicion='monotributista', cuit='20111111112', punto_venta=1,
        )
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria fact test')
        self.producto = Producto.objects.create(categoria=categoria, nombre='Fuente fact test')
        self.sucursal = Sucursal.objects.create(nombre='Solar fact test', orden=90)
        aplicar_ajuste(self.producto, self.sucursal, delta=5)

        self.cliente = APIClient()
        self.cliente.force_authenticate(self.fact)

    def _emitir_mock(self, emisor, datos, usuario=None):
        comp = Comprobante.objects.create(
            emisor=emisor, tipo='C', punto_venta=1,
            numero=(Comprobante.objects.count() + 1),
            cliente_nombre=datos['cliente_nombre'],
            cliente_condicion=datos['cliente_condicion'],
            neto=100, iva=0, total=100, cae='999',
        )
        return comp

    def _payload(self, cantidad, con_producto=True, con_sucursal=True):
        item = {'descripcion': 'Fuente', 'cantidad': cantidad, 'precio_unitario': 100}
        if con_producto:
            item['producto'] = self.producto.id
        payload = {
            'emisor': self.emisor.id,
            'cliente_nombre': 'Cliente',
            'cliente_condicion': 'consumidor_final',
            'items': [item],
        }
        if con_sucursal:
            payload['sucursal_stock'] = self.sucursal.id
        return payload

    @patch('facturacion.views.servicio.emitir')
    def test_descuenta_stock_con_nota_de_factura(self, mock_emitir):
        from inventario.models import MovimientoStock, StockProducto
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(2), format='json')
        self.assertEqual(r.status_code, 201)
        self.assertNotIn('avisos_stock', r.data)
        fila = StockProducto.objects.get(producto=self.producto, sucursal=self.sucursal)
        self.assertEqual(fila.cantidad, 3)
        mov = MovimientoStock.objects.get(tipo=MovimientoStock.Tipo.VENTA)
        self.assertEqual(mov.delta, -2)
        self.assertIn('Factura C', mov.nota)
        # Lo que llego a ARCA no incluye el campo `producto`.
        datos_emitidos = mock_emitir.call_args.args[1]
        self.assertNotIn('producto', datos_emitidos['items'][0])

    @patch('facturacion.views.servicio.emitir')
    def test_sin_stock_avisa_pero_la_factura_sale(self, mock_emitir):
        from inventario.models import StockProducto
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(50), format='json')
        self.assertEqual(r.status_code, 201)  # la factura salio igual
        self.assertIn('avisos_stock', r.data)
        self.assertIn('stock suficiente', r.data['avisos_stock'][0])
        fila = StockProducto.objects.get(producto=self.producto, sucursal=self.sucursal)
        self.assertEqual(fila.cantidad, 5)  # intacto, nunca negativo

    @patch('facturacion.views.servicio.emitir')
    def test_sin_sucursal_no_toca_stock(self, mock_emitir):
        from inventario.models import MovimientoStock, StockProducto
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(2, con_sucursal=False), format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(
            StockProducto.objects.get(producto=self.producto, sucursal=self.sucursal).cantidad, 5,
        )
        self.assertEqual(MovimientoStock.objects.filter(tipo=MovimientoStock.Tipo.VENTA).count(), 0)


@override_settings(
    EMAIL_HOST='smtp.test',
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
)
class EnviarEmailTests(TestCase):
    """El endpoint de envio por email adjunta el PDF y lo manda (backend en memoria)."""

    def setUp(self):
        rol = Rol.objects.create(nombre='CajeroMail')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.fact = Usuario.objects.create_user(
            email='fm@celtuc.ar', username='facmail', password='x', rol=rol,
        )
        emisor = Emisor.objects.create(
            nombre='Emisor Test', condicion='monotributista', cuit='20111111112', punto_venta=1,
        )
        self.comp = Comprobante.objects.create(
            emisor=emisor, tipo='C', punto_venta=1, numero=1,
            cliente_nombre='Cliente', cliente_condicion='consumidor_final',
            fecha=datetime.date(2026, 6, 28), neto=100, iva=0, total=100, cae='123',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.fact)

    def _url(self):
        return reverse('facturacion:comprobante-email', args=[self.comp.id])

    def test_envia_con_adjunto(self):
        pdf_b64 = base64.b64encode(b'%PDF-1.4 test').decode()
        r = self.client.post(self._url(), {'email': 'dest@x.com', 'pdf_base64': pdf_b64}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['dest@x.com'])
        self.assertEqual(len(mail.outbox[0].attachments), 1)

    @override_settings(EMAIL_HOST='')
    def test_sin_smtp_configurado_avisa(self):
        pdf_b64 = base64.b64encode(b'%PDF-1.4 test').decode()
        r = self.client.post(self._url(), {'email': 'dest@x.com', 'pdf_base64': pdf_b64}, format='json')
        self.assertEqual(r.status_code, 503)


class EmisorVisibilidadTests(TestCase):
    """Los facturadores ven SOLO emisores activos; el superadmin ve todos."""

    def setUp(self):
        Emisor.objects.create(
            nombre='Activo', condicion='monotributista', cuit='20111111112', punto_venta=1, activo=True,
        )
        Emisor.objects.create(
            nombre='Inactivo', condicion='monotributista', cuit='20222222223', punto_venta=1, activo=False,
        )
        self.super = Usuario.objects.create_superuser(email='sv@celtuc.ar', username='supv', password='x')
        rol = Rol.objects.create(nombre='CajeroVis')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.fact = Usuario.objects.create_user(email='fv@celtuc.ar', username='facv', password='x', rol=rol)

    def _listar(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c.get(reverse('facturacion:emisor-list'))

    def test_facturador_no_ve_inactivos(self):
        r = self._listar(self.fact)
        self.assertEqual(r.status_code, 200)
        nombres = [e['nombre'] for e in r.data]
        self.assertIn('Activo', nombres)
        self.assertNotIn('Inactivo', nombres)

    def test_superadmin_ve_todos(self):
        r = self._listar(self.super)
        self.assertEqual(r.status_code, 200)
        nombres = [e['nombre'] for e in r.data]
        self.assertIn('Activo', nombres)
        self.assertIn('Inactivo', nombres)


class LimiteMensualTests(TestCase):
    """Tope de facturacion mensual: aviso 409 antes de emitir, confirmable.

    La emision en ARCA se mockea; lo que se prueba es el control PREVIO: con
    tope superado responde 409 SIN llamar a ARCA, con `confirmar_limite` emite
    igual, y los comprobantes ocultados (borrado logico) siguen contando.
    """

    def setUp(self):
        rol = Rol.objects.create(nombre='CajeroLimite')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.fact = Usuario.objects.create_user(
            email='fl@celtuc.ar', username='faclim', password='x', rol=rol,
        )
        self.super = Usuario.objects.create_superuser(
            email='sl@celtuc.ar', username='suplim', password='x',
        )
        rol_admin = Rol.objects.create(nombre='AdminLimite', es_admin=True)
        self.admin = Usuario.objects.create_user(
            email='al@celtuc.ar', username='admlim', password='x', rol=rol_admin,
        )
        self.emisor = Emisor.objects.create(
            nombre='Emisor Limite', condicion='monotributista', cuit='20111111112', punto_venta=1,
        )
        LimiteMensual.objects.create(
            emisor=self.emisor, anio=2026, mes=7, monto=Decimal('1000000'),
        )
        # Dos compras de 400.000 ya emitidas en julio 2026.
        for numero in (1, 2):
            Comprobante.objects.create(
                emisor=self.emisor, tipo='C', punto_venta=1, numero=numero,
                cliente_nombre='Cliente', cliente_condicion='consumidor_final',
                fecha=datetime.date(2026, 7, numero), neto=400000, iva=0,
                total=Decimal('400000'), cae='999',
            )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.fact)

    def _emitir_mock(self, emisor, datos, usuario=None):
        return Comprobante.objects.create(
            emisor=emisor, tipo='C', punto_venta=1,
            numero=(Comprobante.todos.count() + 1),
            cliente_nombre=datos['cliente_nombre'],
            cliente_condicion=datos['cliente_condicion'],
            fecha=datos.get('fecha') or datetime.date(2026, 7, 15),
            total=Decimal('400000'), cae='999',
        )

    def _payload(self, precio, fecha='2026-07-15', confirmar=False):
        payload = {
            'emisor': self.emisor.id,
            'cliente_nombre': 'Cliente',
            'cliente_condicion': 'consumidor_final',
            'fecha': fecha,
            'items': [{'descripcion': 'Equipo', 'cantidad': 1, 'precio_unitario': precio}],
        }
        if confirmar:
            payload['confirmar_limite'] = True
        return payload

    @patch('facturacion.views.servicio.emitir')
    def test_bajo_el_limite_emite_normal(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(150000), format='json')
        self.assertEqual(r.status_code, 201)
        mock_emitir.assert_called_once()

    @patch('facturacion.views.servicio.emitir')
    def test_superar_el_limite_devuelve_409_sin_llamar_a_arca(self, mock_emitir):
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(400000), format='json')
        self.assertEqual(r.status_code, 409)
        mock_emitir.assert_not_called()
        self.assertEqual(r.data['codigo'], 'limite_mensual_excedido')
        self.assertEqual(r.data['limite'], 1000000.0)
        self.assertEqual(r.data['facturado'], 800000.0)
        self.assertEqual(r.data['total_factura'], 400000.0)
        self.assertEqual(r.data['excedente'], 200000.0)
        self.assertEqual(r.data['mes'], 7)

    @patch('facturacion.views.servicio.emitir')
    def test_confirmando_emite_igual_y_no_viaja_a_arca_el_flag(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(400000, confirmar=True), format='json')
        self.assertEqual(r.status_code, 201)
        datos_emitidos = mock_emitir.call_args.args[1]
        self.assertNotIn('confirmar_limite', datos_emitidos)

    @patch('facturacion.views.servicio.emitir')
    def test_otro_mes_sin_limite_no_avisa(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(400000, fecha='2026-08-15'), format='json')
        self.assertEqual(r.status_code, 201)

    def test_comprobante_oculto_sigue_contando(self):
        Comprobante.objects.get(numero=2).delete()  # borrado logico (oculta)
        self.assertEqual(facturado_del_mes(self.emisor, 2026, 7), Decimal('800000'))

    def test_facturador_ve_limites_pero_no_los_edita(self):
        url = reverse('facturacion:emisor-limites', args=[self.emisor.id])
        r = self.cliente.get(url, {'anio': 2026})
        self.assertEqual(r.status_code, 200)
        julio = next(fila for fila in r.data['limites'] if fila['mes'] == 7)
        self.assertEqual(julio['monto'], 1000000.0)
        self.assertEqual(julio['facturado'], 800000.0)
        r = self.cliente.put(url, {'anio': 2026, 'limites': []}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_administrador_tambien_edita_los_limites(self):
        """El tope es control interno de gestion: no hace falta ser el dueño."""
        c = APIClient()
        c.force_authenticate(self.admin)
        url = reverse('facturacion:emisor-limites', args=[self.emisor.id])
        r = c.put(url, {'anio': 2026, 'limites': [{'mes': 7, 'monto': '1500000'}]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            next(fila for fila in r.data['limites'] if fila['mes'] == 7)['monto'], 1500000.0,
        )

    def test_superadmin_aplica_varios_meses_y_quita_con_null(self):
        c = APIClient()
        c.force_authenticate(self.super)
        url = reverse('facturacion:emisor-limites', args=[self.emisor.id])
        r = c.put(url, {
            'anio': 2026,
            'limites': [
                {'mes': 8, 'monto': '2000000'},
                {'mes': 9, 'monto': '2000000'},
                {'mes': 7, 'monto': None},  # quita el de julio
            ],
        }, format='json')
        self.assertEqual(r.status_code, 200)
        montos = {fila['mes']: fila['monto'] for fila in r.data['limites']}
        self.assertIsNone(montos[7])
        self.assertEqual(montos[8], 2000000.0)
        self.assertEqual(montos[9], 2000000.0)
        # Volver a ponerlo en julio no choca con el borrado logico anterior.
        r = c.put(url, {'anio': 2026, 'limites': [{'mes': 7, 'monto': '500000'}]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            next(fila for fila in r.data['limites'] if fila['mes'] == 7)['monto'], 500000.0,
        )


class TicketAccesoCompartidoTests(TestCase):
    """Dos emisores del MISMO CUIT comparten el Ticket de Acceso (ARCA entrega uno
    por CUIT): el segundo NO vuelve a loguear, asi no rompe la cuenta que ya funciona."""

    def _emisor(self, nombre, pv, cuit='20350940643', yb=False):
        return Emisor.objects.create(
            nombre=nombre, condicion='responsable_inscripto', cuit=cuit,
            punto_venta=pv, produccion=True, responsable_yb=yb,
            certificado='cert', clave_privada='key',
        )

    def test_segundo_emisor_del_mismo_cuit_reusa_el_ta(self):
        from datetime import timedelta

        from django.utils import timezone

        from .arca import wsaa
        from .models import TicketAcceso

        e1 = self._emisor('RI Centro', 10)
        e2 = self._emisor('RI Yerba Buena', 11, yb=True)
        exp = timezone.now() + timedelta(hours=12)
        with patch.object(wsaa, '_login', return_value=('TOK', 'SIG', exp)) as login:
            self.assertEqual(wsaa.obtener_ta(e1), ('TOK', 'SIG'))
            self.assertEqual(wsaa.obtener_ta(e2), ('TOK', 'SIG'))
        login.assert_called_once()  # el 2do reuso el TA del 1ro (no re-logueo)
        self.assertEqual(TicketAcceso.objects.count(), 1)

    def test_cuit_distinto_no_comparte_ta(self):
        from datetime import timedelta

        from django.utils import timezone

        from .arca import wsaa

        e1 = self._emisor('RI A', 10, cuit='20350940643')
        otro = self._emisor('RI B', 1, cuit='20111111112')
        exp = timezone.now() + timedelta(hours=12)
        with patch.object(wsaa, '_login', return_value=('T', 'S', exp)) as login:
            wsaa.obtener_ta(e1)
            wsaa.obtener_ta(otro)
        self.assertEqual(login.call_count, 2)  # CUIT distinto = TA propio


class EmisorSerializerTests(TestCase):
    base = {
        'nombre': 'CelTuc SRL',
        'condicion': 'responsable_inscripto',
        'cuit': '30-71456789-3',
        'punto_venta': 1,
        'produccion': False,
    }

    def test_normaliza_cuit_y_oculta_credenciales(self):
        s = EmisorSerializer(data={**self.base, 'certificado': 'CERT', 'clave_privada': 'KEY'})
        s.is_valid(raise_exception=True)
        emisor = s.save()
        self.assertEqual(emisor.cuit, '30714567893')
        self.assertTrue(emisor.tiene_credenciales)

        salida = EmisorSerializer(emisor).data
        self.assertNotIn('certificado', salida)
        self.assertNotIn('clave_privada', salida)
        self.assertTrue(salida['tiene_credenciales'])

    def test_cuit_invalido(self):
        s = EmisorSerializer(data={**self.base, 'cuit': '123'})
        self.assertFalse(s.is_valid())
        self.assertIn('cuit', s.errors)

    def test_editar_sin_credenciales_no_las_pisa(self):
        s = EmisorSerializer(data={**self.base, 'certificado': 'CERT', 'clave_privada': 'KEY'})
        s.is_valid(raise_exception=True)
        emisor = s.save()

        s2 = EmisorSerializer(emisor, data={'certificado': '', 'clave_privada': ''}, partial=True)
        s2.is_valid(raise_exception=True)
        s2.save()
        emisor.refresh_from_db()
        self.assertEqual(emisor.certificado, 'CERT')
        self.assertEqual(emisor.clave_privada, 'KEY')


class BaseClientesTests(TestCase):
    """La base de clientes: identidad, email e historial completo de compras.

    Las compras del cliente son de los dos tipos que el sistema guarda: las
    facturas (cruzadas por documento/telefono) y las ventas de mostrador (que
    apuntan al cliente con una FK). Una venta que despues se facturo NO se
    cuenta dos veces.
    """

    def setUp(self):
        from inventario.models import Sucursal, aplicar_ajuste
        from productos.models import CategoriaProducto, Producto

        rol = Rol.objects.create(nombre='CajeroClientes')
        rol.permisos.set(Permiso.objects.filter(codigo__in=('ver_facturacion', 'ver_inventario')))
        self.usuario = Usuario.objects.create_user(
            email='cl@celtuc.ar', username='faccli', password='x', rol=rol,
        )
        self.emisor = Emisor.objects.create(
            nombre='Emisor Clientes', condicion='monotributista', cuit='20111111112', punto_venta=1,
        )
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria clientes test')
        self.producto = Producto.objects.create(categoria=categoria, nombre='Funda clientes test')
        self.sucursal = Sucursal.objects.create(nombre='Solar clientes test', orden=91)
        aplicar_ajuste(self.producto, self.sucursal, delta=10)

        self.api = APIClient()
        self.api.force_authenticate(self.usuario)

    def _factura(self, *, doc='20304050607', telefono='', email='', total=1000, numero=1):
        return Comprobante.objects.create(
            emisor=self.emisor, tipo='C', punto_venta=1, numero=numero,
            cliente_nombre='Ana Perez', cliente_doc_tipo='CUIT', cliente_doc_numero=doc,
            cliente_condicion='consumidor_final', cliente_telefono=telefono, cliente_email=email,
            fecha=datetime.date(2026, 7, 10), neto=total, iva=0, total=Decimal(str(total)), cae='999',
        )

    def _venta(self, *, cliente=None, cantidad=1, precio=500):
        from inventario.models import registrar_venta

        return registrar_venta(
            self.sucursal, [(self.producto, cantidad, Decimal(str(precio)))],
            forma_pago='efectivo', cliente=cliente, usuario=self.usuario,
        )

    def test_la_factura_guarda_el_email_en_la_base(self):
        from .clientes import registrar_cliente_desde_comprobante

        cliente = registrar_cliente_desde_comprobante(self._factura(email='Ana@Mail.com'))
        self.assertEqual(cliente.email, 'ana@mail.com')  # normalizado a minusculas
        r = self.api.get(reverse('facturacion:cliente-detail', args=[cliente.id]))
        self.assertEqual(r.data['email'], 'ana@mail.com')

    def test_solo_con_email_se_registra_e_identifica(self):
        from .clientes import registrar_cliente

        primero = registrar_cliente(nombre='Sin Doc', email='solo@mail.com')
        self.assertIsNotNone(primero)
        segundo = registrar_cliente(nombre='Sin Doc', email='solo@mail.com', telefono='3815550000')
        self.assertEqual(primero.pk, segundo.pk)  # es el mismo, no duplica
        self.assertEqual(segundo.telefono, '3815550000')

    def test_no_pisa_con_vacio_un_dato_guardado(self):
        from .clientes import registrar_cliente

        cliente = registrar_cliente(nombre='Ana', doc_numero='20304050607', email='ana@mail.com')
        de_nuevo = registrar_cliente(nombre='Ana', doc_numero='20304050607', email='')
        self.assertEqual(de_nuevo.email, 'ana@mail.com')
        self.assertEqual(cliente.pk, de_nuevo.pk)

    def test_historial_trae_facturas_y_ventas(self):
        from .clientes import registrar_cliente_desde_comprobante

        cliente = registrar_cliente_desde_comprobante(self._factura(total=1000))
        self._venta(cliente=cliente, precio=500)
        r = self.api.get(reverse('facturacion:cliente-detail', args=[cliente.id]))
        self.assertEqual(r.status_code, 200)
        origenes = sorted(compra['origen'] for compra in r.data['compras'])
        self.assertEqual(origenes, ['factura', 'venta'])
        self.assertEqual(r.data['resumen']['cantidad'], 2)
        self.assertEqual(r.data['resumen']['total'], 1500.0)
        self.assertEqual(r.data['resumen']['facturas'], 1)
        self.assertEqual(r.data['resumen']['ventas'], 1)

    def test_venta_facturada_no_se_cuenta_dos_veces(self):
        from .clientes import registrar_cliente_desde_comprobante

        comprobante = self._factura(total=1000)
        cliente = registrar_cliente_desde_comprobante(comprobante)
        venta = self._venta(cliente=cliente, precio=1000)
        venta.comprobante = comprobante  # se facturo esa misma venta
        venta.save(update_fields=['comprobante'])
        r = self.api.get(reverse('facturacion:cliente-detail', args=[cliente.id]))
        self.assertEqual(r.data['resumen']['cantidad'], 1)
        self.assertEqual(r.data['resumen']['total'], 1000.0)
        self.assertEqual([c['origen'] for c in r.data['compras']], ['factura'])

    def test_la_fecha_de_la_venta_es_la_de_argentina(self):
        """Una venta de las 23:30 no puede figurar al dia siguiente.

        `creado` se guarda en UTC: sin convertir a la hora local, las ventas de
        la noche caerian en la fecha equivocada.
        """
        from django.utils import timezone

        from .clientes import registrar_cliente

        cliente = registrar_cliente(nombre='Nocturno', telefono='3815557777')
        venta = self._venta(cliente=cliente)
        # 2026-07-10 02:30 UTC == 2026-07-09 23:30 en Argentina.
        venta.creado = datetime.datetime(2026, 7, 10, 2, 30, tzinfo=datetime.timezone.utc)
        venta.save(update_fields=['creado'])
        self.assertEqual(timezone.localtime(venta.creado).date(), datetime.date(2026, 7, 9))
        r = self.api.get(reverse('facturacion:cliente-detail', args=[cliente.id]))
        self.assertEqual(r.data['compras'][0]['fecha'], '2026-07-09')
        self.assertEqual(r.data['resumen']['ultima'], '2026-07-09')

    def test_lista_con_stats_suma_los_dos_tipos(self):
        from .clientes import registrar_cliente_desde_comprobante

        cliente = registrar_cliente_desde_comprobante(self._factura(total=1000))
        self._venta(cliente=cliente, precio=500)
        r = self.api.get(reverse('facturacion:cliente-list'), {'stats': '1'})
        fila = next(c for c in r.data if c['id'] == cliente.id)
        self.assertEqual(fila['cantidad_compras'], 2)
        self.assertEqual(fila['total_gastado'], 1500.0)

    def test_venta_de_mostrador_da_de_alta_el_cliente(self):
        from inventario.models import Venta

        r = self.api.post(reverse('inv-ventas'), {
            'sucursal': self.sucursal.id,
            'cliente_datos': {
                'nombre': 'Nuevo Cliente',
                'telefono': '3815551234',
                'email': 'nuevo@mail.com',
            },
            'items': [{'producto': self.producto.id, 'cantidad': 1, 'precio_unitario': 700}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        venta = Venta.objects.get(pk=r.data['id'])
        self.assertIsNotNone(venta.cliente)
        self.assertEqual(venta.cliente.email, 'nuevo@mail.com')
        self.assertEqual(r.data['cliente_nombre'], 'Nuevo Cliente')

    def test_venta_sin_datos_de_cliente_se_registra_igual(self):
        from inventario.models import Venta

        r = self.api.post(reverse('inv-ventas'), {
            'sucursal': self.sucursal.id,
            'items': [{'producto': self.producto.id, 'cantidad': 1, 'precio_unitario': 700}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(Venta.objects.get(pk=r.data['id']).cliente)

    def test_borrar_el_cliente_no_toca_sus_ventas(self):
        from inventario.models import Venta

        from .clientes import registrar_cliente

        cliente = registrar_cliente(nombre='Ana', telefono='3815559999')
        venta = self._venta(cliente=cliente)
        r = self.api.delete(reverse('facturacion:cliente-detail', args=[cliente.id]))
        self.assertEqual(r.status_code, 204)
        venta.refresh_from_db()
        # El borrado del cliente es logico: la venta queda intacta y sigue
        # apuntandolo (si se restaura, su historial vuelve completo).
        self.assertTrue(Venta.objects.filter(pk=venta.pk).exists())
        self.assertEqual(venta.cliente_id, cliente.pk)


class ConceptoFacturaModeloTests(TestCase):
    """Reglas del banco de conceptos."""

    def setUp(self):
        # La migracion de siembra ya dejo un concepto: se vacia para probar las
        # reglas sobre un banco conocido, sin depender del contenido sembrado.
        ConceptoFactura.objects.all().delete()

    def test_un_solo_predeterminado(self):
        a = ConceptoFactura.objects.create(texto='Uno', predeterminado=True)
        b = ConceptoFactura.objects.create(texto='Dos', predeterminado=True)
        a.refresh_from_db()
        self.assertFalse(a.predeterminado)
        self.assertTrue(b.predeterminado)

    def test_por_defecto_usa_el_marcado(self):
        ConceptoFactura.objects.create(texto='Uno', orden=0)
        marcado = ConceptoFactura.objects.create(texto='Dos', orden=1, predeterminado=True)
        self.assertEqual(ConceptoFactura.por_defecto(), marcado)

    def test_por_defecto_cae_al_primer_activo(self):
        ConceptoFactura.objects.create(texto='Inactivo', orden=0, activo=False)
        primero = ConceptoFactura.objects.create(texto='Activo', orden=1)
        self.assertEqual(ConceptoFactura.por_defecto(), primero)

    def test_sin_conceptos_activos_devuelve_none(self):
        ConceptoFactura.objects.create(texto='Inactivo', activo=False)
        self.assertIsNone(ConceptoFactura.por_defecto())


class AgruparEnConceptoTests(TestCase):
    """Agrupar NO puede mover la plata: es lo unico que importa de verdad."""

    def test_un_solo_renglon_con_el_total(self):
        items = [
            {'descripcion': 'Parlante', 'cantidad': 2, 'precio_unitario': Decimal('100')},
            {'descripcion': 'Cable', 'cantidad': 1, 'precio_unitario': Decimal('50')},
        ]
        antes = calcular_totales(items, 'B', Decimal('21'))
        salida = agrupar_en_concepto(items, 'Accesorios varios')
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]['descripcion'], 'Accesorios varios')
        self.assertEqual(salida[0]['cantidad'], Decimal('1'))
        self.assertEqual(salida[0]['precio_unitario'], Decimal('250.00'))
        self.assertEqual(calcular_totales(salida, 'B', Decimal('21')), antes)

    def test_sin_texto_no_toca_nada(self):
        items = [{'descripcion': 'Cable', 'cantidad': 1, 'precio_unitario': Decimal('50')}]
        self.assertIs(agrupar_en_concepto(items, ''), items)
        self.assertIs(agrupar_en_concepto(items, None), items)

    def test_texto_larguisimo_se_recorta_al_renglon(self):
        items = [{'descripcion': 'x', 'cantidad': 1, 'precio_unitario': Decimal('1')}]
        largo = 'x' * 500
        self.assertEqual(len(agrupar_en_concepto(items, largo)[0]['descripcion']), 200)


class ConceptoPermisosTests(TestCase):
    """Leer el banco lo puede hacer quien factura; crearlo/editarlo es de admins."""

    def setUp(self):
        self.admin = Usuario.objects.create_user(
            email='adm2@celtuc.ar', username='adm2', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )
        rol = Rol.objects.create(nombre='CajeroConceptos')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.cajero = Usuario.objects.create_user(
            email='caj2@celtuc.ar', username='caj2', password='x', rol=rol,
        )
        ConceptoFactura.objects.all().delete()  # ignoramos el concepto sembrado
        self.activo = ConceptoFactura.objects.create(texto='Activo', predeterminado=True)
        self.inactivo = ConceptoFactura.objects.create(texto='Inactivo', activo=False)

    def _api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_cajero_lista_solo_activos_pero_no_crea(self):
        api = self._api(self.cajero)
        r = api.get(reverse('facturacion:concepto-list'))
        self.assertEqual(r.status_code, 200)
        # Solo ve los ACTIVOS: son los que puede elegir al facturar.
        self.assertEqual([c['texto'] for c in r.data], ['Activo'])
        creado = api.post(reverse('facturacion:concepto-list'), {'texto': 'Nuevo'}, format='json')
        self.assertEqual(creado.status_code, 403)

    def test_cajero_no_edita_ni_desactiva(self):
        api = self._api(self.cajero)
        url = reverse('facturacion:concepto-detail', args=[self.activo.id])
        self.assertEqual(api.patch(url, {'activo': False}, format='json').status_code, 403)

    def test_admin_crea_edita_y_desactiva(self):
        api = self._api(self.admin)
        r = api.post(reverse('facturacion:concepto-list'), {'texto': 'Nuevo'}, format='json')
        self.assertEqual(r.status_code, 201)
        url = reverse('facturacion:concepto-detail', args=[r.data['id']])
        self.assertEqual(api.patch(url, {'activo': False}, format='json').status_code, 200)
        # El admin SI ve los inactivos, para poder reactivarlos.
        listado = api.get(reverse('facturacion:concepto-list')).data
        self.assertIn('Inactivo', [c['texto'] for c in listado])


class EmitirConConceptoTests(TestCase):
    """De punta a punta: que se manda a emitir y que pasa con el stock."""

    def setUp(self):
        from inventario.models import Sucursal, aplicar_ajuste
        from productos.models import CategoriaProducto, Producto

        rol = Rol.objects.create(nombre='CajeroEmitirConcepto')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.usuario = Usuario.objects.create_user(
            email='cg@celtuc.ar', username='concepto', password='x', rol=rol,
        )
        self.emisor = Emisor.objects.create(
            nombre='Emisor concepto', condicion='monotributista',
            cuit='20111111113', punto_venta=1,
        )
        self.concepto = ConceptoFactura.objects.create(
            texto='Accesorios varios', predeterminado=True,
        )
        self.inactivo = ConceptoFactura.objects.create(texto='Viejo', activo=False)
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Categoria emitir concepto')
        self.producto = Producto.objects.create(categoria=categoria, nombre='Parlante JBL')
        self.otro = Producto.objects.create(categoria=categoria, nombre='Cable comun')
        self.sucursal = Sucursal.objects.create(nombre='Sucursal concepto', orden=91)
        aplicar_ajuste(self.producto, self.sucursal, delta=5)
        aplicar_ajuste(self.otro, self.sucursal, delta=5)

        self.api = APIClient()
        self.api.force_authenticate(self.usuario)

    def _emitir_mock(self, emisor, datos, usuario=None):
        totales = calcular_totales(datos['items'], 'C', Decimal('21'))
        comp = Comprobante.objects.create(
            emisor=emisor, tipo='C', punto_venta=1,
            numero=(Comprobante.objects.count() + 1),
            cliente_nombre=datos['cliente_nombre'],
            cliente_condicion=datos['cliente_condicion'],
            neto=totales['neto'], iva=totales['iva'], total=totales['total'], cae='999',
        )
        for item in datos['items']:
            comp.items.create(**item)
        return comp

    def _payload(self, **extra):
        payload = {
            'emisor': self.emisor.id,
            'cliente_nombre': 'Cliente',
            'cliente_condicion': 'consumidor_final',
            'items': [
                {'descripcion': 'Parlante JBL', 'cantidad': 2,
                 'precio_unitario': 100, 'producto': self.producto.id},
                {'descripcion': 'Cable comun', 'cantidad': 1,
                 'precio_unitario': 50, 'producto': self.otro.id},
            ],
        }
        payload.update(extra)
        return payload

    @patch('facturacion.views.servicio.emitir')
    def test_con_concepto_sale_un_solo_renglon(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.api.post(reverse('facturacion:comprobante-list'),
                          self._payload(concepto_generico=self.concepto.id), format='json')
        self.assertEqual(r.status_code, 201)
        enviados = mock_emitir.call_args.args[1]['items']
        self.assertEqual(len(enviados), 1)
        self.assertEqual(enviados[0]['descripcion'], 'Accesorios varios')
        self.assertEqual(enviados[0]['precio_unitario'], Decimal('250.00'))
        # El campo es interno: no viaja a la emision.
        self.assertNotIn('concepto_generico', mock_emitir.call_args.args[1])
        # La plata es la misma que con detalle: 2x100 + 1x50.
        self.assertEqual(Comprobante.objects.get(pk=r.data['id']).total, Decimal('250.00'))

    @patch('facturacion.views.servicio.emitir')
    def test_sin_concepto_sale_el_detalle_real(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.api.post(reverse('facturacion:comprobante-list'), self._payload(), format='json')
        self.assertEqual(r.status_code, 201)
        enviados = mock_emitir.call_args.args[1]['items']
        self.assertEqual([i['descripcion'] for i in enviados], ['Parlante JBL', 'Cable comun'])

    @patch('facturacion.views.servicio.emitir')
    def test_agrupar_no_le_saca_el_descuento_de_stock_a_nadie(self, mock_emitir):
        from inventario.models import StockProducto
        mock_emitir.side_effect = self._emitir_mock
        r = self.api.post(
            reverse('facturacion:comprobante-list'),
            self._payload(concepto_generico=self.concepto.id, sucursal_stock=self.sucursal.id),
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        # Ya no hay un renglon por producto, pero el stock se descuenta igual:
        # se calcula con la lista ORIGINAL, no con la agrupada.
        self.assertEqual(
            StockProducto.objects.get(producto=self.producto, sucursal=self.sucursal).cantidad, 3)
        self.assertEqual(
            StockProducto.objects.get(producto=self.otro, sucursal=self.sucursal).cantidad, 4)

    @patch('facturacion.views.servicio.emitir')
    def test_no_se_puede_emitir_con_un_concepto_desactivado(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.api.post(reverse('facturacion:comprobante-list'),
                          self._payload(concepto_generico=self.inactivo.id), format='json')
        self.assertEqual(r.status_code, 400)
        mock_emitir.assert_not_called()

class ResumenMensualTests(TestCase):
    """Resumen mensual por dia y medio de cobro (`resumen.py`) + su endpoint.

    Prueba lo que decide el numero de cada columna del Excel: el medio informado
    en el comprobante manda; sin medio se toma el cobro real de la venta ligada
    (repartido si fue mixto); sin nada, queda como "sin_medio" y NUNCA se pierde
    del total. Y que solo un administrador puede pedirlo.
    """

    def setUp(self):
        from .resumen import resumen_mensual
        self.resumen_mensual = resumen_mensual

        self.ri = Emisor.objects.create(
            nombre='RI test', condicion='responsable_inscripto', cuit='30111111112',
            punto_venta=1, produccion=True,
        )
        self.mono = Emisor.objects.create(
            nombre='Mono test', condicion='monotributista', cuit='20111111112',
            punto_venta=1, produccion=True,
        )

    def _comprobante(self, emisor, tipo, numero, fecha, total, **extra):
        return Comprobante.objects.create(
            emisor=emisor, tipo=tipo, punto_venta=1, numero=numero,
            cliente_nombre='Cliente', cliente_condicion='consumidor_final',
            fecha=fecha, neto=total, iva=0, total=Decimal(str(total)), cae='123',
            **extra,
        )

    def _venta_ligada(self, nombre, precio, comprobante, **kwargs):
        """Una venta de mostrador apuntada al comprobante (como hace Caja)."""
        from inventario.models import Sucursal, registrar_venta
        from productos.models import CategoriaProducto, Producto

        sucursal = Sucursal.objects.create(nombre=f'Sucursal {nombre}', orden=90)
        categoria, _ = CategoriaProducto.objects.get_or_create(nombre='Cat resumen')
        producto = Producto.objects.create(categoria=categoria, nombre=f'Prod {nombre}')
        venta = registrar_venta(
            sucursal, [(producto, 1, Decimal(str(precio)))], permitir_faltante=True, **kwargs,
        )
        venta.comprobante = comprobante
        venta.save(update_fields=['comprobante'])
        return venta

    def test_agrupa_por_dia_y_por_medio_informado(self):
        d1 = datetime.date(2026, 8, 3)
        d2 = datetime.date(2026, 8, 20)
        self._comprobante(self.ri, 'B', 1, d1, 1000, medio_pago='efectivo')
        self._comprobante(self.ri, 'B', 2, d1, 2500, medio_pago='transferencia',
                          estado_cobro='pagada')
        self._comprobante(self.mono, 'C', 1, d2, 400, medio_pago='tarjeta')
        # Otro mes: no entra.
        self._comprobante(self.mono, 'C', 2, datetime.date(2026, 7, 31), 999, medio_pago='efectivo')

        r = self.resumen_mensual(2026, 8)
        self.assertEqual(r['desde'], '2026-08-01')
        self.assertEqual(r['hasta'], '2026-08-31')
        self.assertEqual(r['dias_del_mes'], 31)
        self.assertEqual([d['fecha'] for d in r['dias']], ['2026-08-03', '2026-08-20'])
        dia1 = r['dias'][0]
        self.assertEqual(dia1['cantidad'], 2)
        self.assertEqual(dia1['total'], 3500.0)
        self.assertEqual(dia1['por_medio']['efectivo'], 1000.0)
        self.assertEqual(dia1['por_medio']['transferencia'], 2500.0)
        self.assertEqual(dia1['por_medio']['sin_medio'], 0.0)
        self.assertEqual(dia1['ri'], 3500.0)
        self.assertEqual(dia1['mono'], 0.0)
        self.assertEqual(dia1['cobrado'], 2500.0)
        self.assertEqual(dia1['pendiente'], 1000.0)
        self.assertEqual(r['totales']['total'], 3900.0)
        self.assertEqual(r['totales']['cantidad'], 3)
        self.assertEqual(r['totales']['por_medio']['tarjeta'], 400.0)
        self.assertEqual(r['totales']['mono'], 400.0)
        self.assertEqual(len(r['comprobantes']), 3)
        self.assertEqual(r['comprobantes'][0]['medio_origen'], 'comprobante')
        self.assertEqual(r['sin_medio'], {'cantidad': 0, 'total': 0.0})

    def test_sin_medio_queda_aparte_y_no_se_pierde(self):
        self._comprobante(self.ri, 'B', 1, datetime.date(2026, 8, 5), 1500)
        r = self.resumen_mensual(2026, 8)
        self.assertEqual(r['dias'][0]['por_medio']['sin_medio'], 1500.0)
        self.assertEqual(r['dias'][0]['total'], 1500.0)
        self.assertEqual(r['sin_medio'], {'cantidad': 1, 'total': 1500.0})
        self.assertEqual(r['comprobantes'][0]['medio_origen'], '')

    def test_sin_medio_toma_el_cobro_real_de_la_venta_ligada(self):
        """Venta cobrada 60 % efectivo + 40 % tarjeta, facturada entera con el
        mono: la factura aporta 60/40 a esos medios (no va a "sin medio")."""
        comp = self._comprobante(self.mono, 'C', 1, datetime.date(2026, 8, 7), 1000)
        self._venta_ligada(
            'mixta', 1000, comp,
            pagos=[
                {'medio': 'efectivo', 'facturacion': 'factura_c', 'emisor': self.mono,
                 'monto': Decimal('600')},
                {'medio': 'tarjeta', 'facturacion': 'factura_c', 'emisor': self.mono,
                 'monto': Decimal('400')},
            ],
        )
        r = self.resumen_mensual(2026, 8)
        dia = r['dias'][0]
        self.assertEqual(dia['por_medio']['efectivo'], 600.0)
        self.assertEqual(dia['por_medio']['tarjeta'], 400.0)
        self.assertEqual(dia['por_medio']['sin_medio'], 0.0)
        self.assertEqual(r['sin_medio']['cantidad'], 0)
        fila = r['comprobantes'][0]
        self.assertEqual(fila['medio_origen'], 'venta')
        self.assertEqual(fila['por_medio'], {'efectivo': 600.0, 'tarjeta': 400.0})

    def test_reparto_por_venta_cierra_al_centavo(self):
        """Aunque el redondeo no sea exacto, la suma de las partes es EXACTAMENTE
        el total del comprobante (la diferencia va al medio de mayor peso)."""
        comp = self._comprobante(self.ri, 'B', 1, datetime.date(2026, 8, 9), Decimal('9.99'))
        self._venta_ligada(
            'tercios', 10, comp,
            pagos=[
                {'medio': 'efectivo', 'facturacion': 'factura_ri', 'emisor': self.ri,
                 'monto': Decimal('3.33')},
                {'medio': 'transferencia', 'facturacion': 'factura_ri', 'emisor': self.ri,
                 'monto': Decimal('3.33')},
                {'medio': 'tarjeta', 'facturacion': 'factura_ri', 'emisor': self.ri,
                 'monto': Decimal('3.34')},
            ],
        )
        r = self.resumen_mensual(2026, 8)
        partes = r['comprobantes'][0]['por_medio']
        self.assertEqual(len(partes), 3)
        self.assertEqual(round(sum(partes.values()), 2), 9.99)
        self.assertEqual(round(sum(r['dias'][0]['por_medio'].values()), 2), 9.99)

    def test_una_parte_de_monto_exacto_gana_al_reparto(self):
        """Venta cobrada 300 sin factura + 500 facturado: la factura de 500 toma
        SOLO esa parte, no un pedazo de cada medio."""
        comp = self._comprobante(self.mono, 'C', 1, datetime.date(2026, 8, 10), 500)
        self._venta_ligada(
            'exacta', 800, comp,
            pagos=[
                {'medio': 'efectivo', 'facturacion': 'sin_factura', 'monto': Decimal('300')},
                {'medio': 'tarjeta', 'facturacion': 'factura_c', 'emisor': self.mono,
                 'monto': Decimal('500')},
            ],
        )
        r = self.resumen_mensual(2026, 8)
        self.assertEqual(r['comprobantes'][0]['por_medio'], {'tarjeta': 500.0})

    def test_venta_repartida_en_dos_facturas_no_inventa_el_medio(self):
        """Una venta partida en DOS facturas de la misma cuenta solo puede
        apuntar a una (`Venta.comprobante` es una FK): repartirle el total entre
        todas las partes le atribuiria medios que no cobro. Queda sin informar.
        """
        comp = self._comprobante(self.mono, 'C', 1, datetime.date(2026, 8, 11), 500)
        self._venta_ligada(
            'dos-facturas', 1000, comp,
            pagos=[
                {'medio': 'efectivo', 'facturacion': 'factura_c', 'emisor': self.mono,
                 'monto': Decimal('500')},
                {'medio': 'tarjeta', 'facturacion': 'factura_c', 'emisor': self.mono,
                 'monto': Decimal('500')},
            ],
        )
        r = self.resumen_mensual(2026, 8)
        fila = r['comprobantes'][0]
        self.assertEqual(fila['medio_origen'], '')
        self.assertEqual(fila['por_medio'], {'sin_medio': 500.0})
        # La plata sigue estando en el total del dia: no se pierde, se ve que
        # falta informar con que se cobro esa factura.
        self.assertEqual(r['dias'][0]['total'], 500.0)
        self.assertEqual(r['sin_medio'], {'cantidad': 1, 'total': 500.0})

    def test_solo_las_partes_facturadas_con_esa_cuenta_reparten(self):
        """Venta mitad sin factura (efectivo) y mitad Factura C por transferencia
        financiera: la factura del mono va TODA a la financiera."""
        comp = self._comprobante(self.mono, 'C', 1, datetime.date(2026, 8, 9), 500)
        self._venta_ligada(
            'mitad', 1000, comp,
            pagos=[
                {'medio': 'efectivo', 'facturacion': 'sin_factura', 'monto': Decimal('500')},
                {'medio': 'transf_financiera', 'facturacion': 'factura_c',
                 'emisor': self.mono, 'monto': Decimal('500')},
            ],
        )
        r = self.resumen_mensual(2026, 8)
        self.assertEqual(r['comprobantes'][0]['por_medio'], {'transf_financiera': 500.0})

    def test_medio_informado_manda_sobre_la_venta(self):
        comp = self._comprobante(self.mono, 'C', 1, datetime.date(2026, 8, 9), 500,
                                 medio_pago='efectivo')
        self._venta_ligada('manda', 500, comp, forma_pago='tarjeta', facturacion='factura_c')
        r = self.resumen_mensual(2026, 8)
        self.assertEqual(r['dias'][0]['por_medio']['efectivo'], 500.0)
        self.assertEqual(r['dias'][0]['por_medio']['tarjeta'], 0.0)
        self.assertEqual(r['comprobantes'][0]['medio_origen'], 'comprobante')

    def test_filtra_por_cuentas_y_ocultos(self):
        d = datetime.date(2026, 8, 12)
        self._comprobante(self.ri, 'B', 1, d, 100, medio_pago='efectivo')
        oculto = self._comprobante(self.mono, 'C', 1, d, 50, medio_pago='efectivo')
        oculto.delete()  # borrado logico: sale de la lista, el CAE existe igual

        solo_ri = self.resumen_mensual(2026, 8, emisores=[self.ri.pk])
        self.assertEqual(solo_ri['totales']['total'], 100.0)
        self.assertEqual(solo_ri['emisores'], [self.ri.pk])

        sin_ocultos = self.resumen_mensual(2026, 8)
        self.assertEqual(sin_ocultos['totales']['total'], 100.0)

        con_ocultos = self.resumen_mensual(2026, 8, incluir_ocultos=True)
        self.assertEqual(con_ocultos['totales']['total'], 150.0)
        ocultos = [c for c in con_ocultos['comprobantes'] if c['oculto']]
        self.assertEqual(len(ocultos), 1)

    def test_endpoint_solo_administradores(self):
        rol = Rol.objects.create(nombre='Facturador resumen')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        empleado = Usuario.objects.create_user(
            email='emp-resumen@celtuc.ar', username='empresumen', password='x', rol=rol,
        )
        admin = Usuario.objects.create_superuser(
            email='adm-resumen@celtuc.ar', username='admresumen', password='x',
        )
        self._comprobante(self.ri, 'B', 1, datetime.date(2026, 8, 12), 100, medio_pago='efectivo')
        url = reverse('facturacion:comprobante-resumen-mensual')

        cliente = APIClient()
        r = cliente.get(url, {'anio': 2026, 'mes': 8})
        self.assertIn(r.status_code, (401, 403))

        cliente.force_authenticate(empleado)
        r = cliente.get(url, {'anio': 2026, 'mes': 8})
        self.assertEqual(r.status_code, 403)

        cliente.force_authenticate(admin)
        r = cliente.get(url, {'anio': 2026, 'mes': 8, 'emisores': f'{self.ri.pk},{self.mono.pk}'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['totales']['total'], 100.0)
        self.assertEqual(r.data['emisores'], [self.ri.pk, self.mono.pk])

        r = cliente.get(url, {'anio': 2026, 'mes': 13})
        self.assertEqual(r.status_code, 400)
        r = cliente.get(url, {'anio': 'x', 'mes': 8})
        self.assertEqual(r.status_code, 400)
        r = cliente.get(url, {'anio': 2026, 'mes': 8, 'emisores': 'a,b'})
        self.assertEqual(r.status_code, 400)


class MedioPagoComprobanteTests(TestCase):
    """El medio de cobro viaja al emitir, se guarda y se puede corregir despues
    (como el estado de cobro): interno, sin tocar nada fiscal."""

    def setUp(self):
        rol = Rol.objects.create(nombre='Facturador medio')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.fact = Usuario.objects.create_user(
            email='fm@celtuc.ar', username='factmedio', password='x', rol=rol,
        )
        self.emisor = Emisor.objects.create(
            nombre='Emisor medio', condicion='monotributista', cuit='20111111112', punto_venta=1,
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.fact)

    def _emitir_mock(self, emisor, datos, usuario=None):
        # Mismo criterio que `servicio.emitir`: el medio informado se guarda.
        return Comprobante.objects.create(
            emisor=emisor, tipo='C', punto_venta=1,
            numero=(Comprobante.objects.count() + 1),
            cliente_nombre=datos['cliente_nombre'],
            cliente_condicion=datos['cliente_condicion'],
            neto=100, iva=0, total=100, cae='999',
            medio_pago=datos.get('medio_pago') or '',
        )

    def _payload(self, **extra):
        payload = {
            'emisor': self.emisor.id,
            'cliente_nombre': 'Cliente',
            'cliente_condicion': 'consumidor_final',
            'items': [{'descripcion': 'Item', 'cantidad': 1, 'precio_unitario': 100}],
        }
        payload.update(extra)
        return payload

    @patch('facturacion.views.servicio.emitir')
    def test_emitir_con_medio_lo_guarda_y_lo_devuelve(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(medio_pago='tarjeta'), format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['medio_pago'], 'tarjeta')
        self.assertEqual(mock_emitir.call_args.args[1]['medio_pago'], 'tarjeta')
        self.assertEqual(Comprobante.objects.get().medio_pago, 'tarjeta')

    @patch('facturacion.views.servicio.emitir')
    def test_emitir_sin_medio_queda_vacio(self, mock_emitir):
        mock_emitir.side_effect = self._emitir_mock
        r = self.cliente.post(reverse('facturacion:comprobante-list'), self._payload(), format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['medio_pago'], '')

    def test_medio_invalido_es_400(self):
        r = self.cliente.post(reverse('facturacion:comprobante-list'),
                              self._payload(medio_pago='cheque'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('medio_pago', r.data)

    def test_patch_cambia_el_medio_sin_tocar_lo_fiscal(self):
        comp = Comprobante.objects.create(
            emisor=self.emisor, tipo='C', punto_venta=1, numero=7,
            cliente_nombre='Cliente', cliente_condicion='consumidor_final',
            neto=100, iva=0, total=100, cae='999',
        )
        r = self.cliente.patch(
            reverse('facturacion:comprobante-detail', args=[comp.pk]),
            {'medio_pago': 'transf_financiera'}, format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['medio_pago'], 'transf_financiera')
        comp.refresh_from_db()
        self.assertEqual(comp.medio_pago, 'transf_financiera')
        self.assertEqual(comp.cae, '999')
        self.assertEqual(comp.total, Decimal('100'))
        # La lista tambien lo trae.
        r = self.cliente.get(reverse('facturacion:comprobante-list'))
        self.assertEqual(r.data[0]['medio_pago'], 'transf_financiera')
