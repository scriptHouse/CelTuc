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

from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from usuarios.models import Permiso, Rol, Usuario

from .arca import qr
from .arca.servicio import _construir_detalle, _iva_id
from .logica import calcular_totales, tipo_comprobante
from .models import Comprobante, Emisor
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
