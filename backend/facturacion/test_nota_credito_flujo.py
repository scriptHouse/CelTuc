"""Prueba de punta a punta del flujo de nota de credito, con ARCA simulado.

Recorre lo mismo que hace la pantalla: emitir una factura, acreditarla parcial,
acreditar el saldo, y mirar como quedan la lista, el detalle, el resumen del mes
y el tope de facturacion. Es un test de verdad (corre con `manage.py test`), no
un script suelto: asi queda como red de seguridad.
"""
import datetime
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from usuarios.models import Permiso, Rol, Usuario

from .models import Comprobante, Emisor


def _cae(numero):
    return {
        'cae': f'752000000000{numero:02d}',
        'cae_vencimiento': '20261231',
        'numero': numero,
        'resultado': 'A',
        'observaciones': '',
    }


class FlujoCompletoNotaCreditoTests(TestCase):
    """La historia completa: facturar, acreditar de a partes y ver los numeros."""

    def setUp(self):
        rol = Rol.objects.create(nombre='CajeroE2E')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        self.usuario = Usuario.objects.create_superuser(
            email='e2e@celtuc.ar', username='e2enc', password='x',
        )
        self.emisor = Emisor.objects.create(
            nombre='CelTuc SRL', condicion='responsable_inscripto', cuit='30111111116',
            punto_venta=1, certificado='PEM', clave_privada='PEM',
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.usuario)

    def _con_arca(self, numero):
        """Contexto que simula al WSFEv1 devolviendo ese numero de comprobante."""
        return (
            patch('facturacion.arca.servicio.wsaa.obtener_ta', return_value=('tk', 'sg')),
            patch('facturacion.arca.servicio.wsfev1.ultimo_autorizado', return_value=numero - 1),
            patch('facturacion.arca.servicio.wsfev1.solicitar_cae', return_value=_cae(numero)),
        )

    def test_facturar_acreditar_y_ver_los_numeros(self):
        # --- 1. Se emite una factura B de $1.210 (1000 + IVA) -----------------
        ta, ultimo, cae = self._con_arca(1)
        with ta, ultimo, cae:
            r = self.cliente.post(
                reverse('facturacion:comprobante-list'),
                {
                    'emisor': self.emisor.id,
                    'cliente_nombre': 'Ana Gomez',
                    'cliente_condicion': 'consumidor_final',
                    'cliente_doc_tipo': 'DNI',
                    'cliente_doc_numero': '30111222',
                    'fecha': '2026-08-10',
                    'medio_pago': 'efectivo',
                    'estado_cobro': 'pagada',
                    'items': [
                        {'descripcion': 'iPhone 13', 'cantidad': 1, 'precio_unitario': '800'},
                        {'descripcion': 'Funda', 'cantidad': 2, 'precio_unitario': '100'},
                    ],
                },
                format='json',
            )
        self.assertEqual(r.status_code, 201, r.data)
        factura_id = r.data['id']
        self.assertEqual(r.data['clase'], 'factura')
        self.assertEqual(r.data['tipo'], 'B')
        self.assertEqual(Decimal(str(r.data['total'])), Decimal('1210.00'))
        self.assertEqual(r.data['saldo_acreditable'], Decimal('1210.00'))
        self.assertEqual(r.data['notas_credito'], [])

        url_nc = reverse('facturacion:comprobante-nota-credito', args=[factura_id])

        # --- 2. Nota de credito PARCIAL: se devuelve una sola funda ----------
        ta, ultimo, cae = self._con_arca(1)
        with ta, ultimo, cae as mock_cae:
            r = self.cliente.post(
                url_nc,
                {
                    'items': [{'descripcion': 'Funda', 'cantidad': 1, 'precio_unitario': '100'}],
                    'fecha': '2026-08-12',
                    'observaciones': 'Devolución del producto',
                },
                format='json',
            )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['clase'], 'nota_credito')
        self.assertEqual(r.data['tipo'], 'B')                     # misma letra
        self.assertEqual(Decimal(str(r.data['total'])), Decimal('121.00'))
        self.assertEqual(r.data['asociado']['numero_formateado'], '0001-00000001')
        self.assertEqual(r.data['observaciones'], 'Devolución del producto')
        self.assertEqual(r.data['medio_pago'], 'efectivo')        # hereda el balde
        # A ARCA le fue el codigo 8 y el comprobante asociado.
        self.assertEqual(mock_cae.call_args.args[5], 8)
        self.assertEqual(
            mock_cae.call_args.args[6]['CbtesAsoc'],
            {'CbteAsoc': [{'Tipo': 6, 'PtoVta': 1, 'Nro': 1}]},
        )

        # --- 3. El detalle de la factura muestra el saldo y la nota ----------
        r = self.cliente.get(reverse('facturacion:comprobante-detail', args=[factura_id]))
        self.assertEqual(r.data['acreditado'], Decimal('121.00'))
        self.assertEqual(r.data['saldo_acreditable'], Decimal('1089.00'))
        self.assertEqual(len(r.data['notas_credito']), 1)

        # --- 4. Acreditar MAS del saldo se frena antes de ARCA ---------------
        r = self.cliente.post(
            url_nc,
            {'items': [{'descripcion': 'De mas', 'cantidad': 1, 'precio_unitario': '2000'}]},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('supera', r.data['detail'])

        # --- 5. Se acredita el saldo restante --------------------------------
        ta, ultimo, cae = self._con_arca(2)
        with ta, ultimo, cae:
            r = self.cliente.post(
                url_nc,
                {'items': [{'descripcion': 'Saldo', 'cantidad': 1, 'precio_unitario': '900'}]},
                format='json',
            )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(str(r.data['total'])), Decimal('1089.00'))

        # --- 6. Ya no queda nada por acreditar --------------------------------
        r = self.cliente.post(
            url_nc,
            {'items': [{'descripcion': 'Otra', 'cantidad': 1, 'precio_unitario': '10'}]},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('acreditada por completo', r.data['detail'])

        # --- 7. La lista trae los tres comprobantes y se filtra ---------------
        lista = reverse('facturacion:comprobante-list')
        self.assertEqual(len(self.cliente.get(lista).data), 3)
        self.assertEqual(len(self.cliente.get(lista, {'clase': 'factura'}).data), 1)
        self.assertEqual(len(self.cliente.get(lista, {'clase': 'nota_credito'}).data), 2)

        # --- 8. El mes quedo en cero: se acredito toda la factura -------------
        from .limites import facturado_del_mes
        from .resumen import resumen_mensual

        self.assertEqual(facturado_del_mes(self.emisor, 2026, 8), Decimal('0.00'))
        resumen = resumen_mensual(2026, 8)
        self.assertEqual(resumen['totales']['cantidad'], 3)
        self.assertEqual(resumen['totales']['total'], 0.0)
        self.assertEqual(resumen['totales']['por_medio']['efectivo'], 0.0)

        # --- 9. Cada comprobante conserva su numero propio ---------------------
        numeros = {
            (c.clase, c.numero)
            for c in Comprobante.objects.all()
        }
        self.assertEqual(
            numeros,
            {('factura', 1), ('nota_credito', 1), ('nota_credito', 2)},
        )

    def test_una_factura_c_se_acredita_con_el_13(self):
        mono = Emisor.objects.create(
            nombre='Mono', condicion='monotributista', cuit='20111111112',
            punto_venta=2, certificado='PEM', clave_privada='PEM',
        )
        factura = Comprobante.objects.create(
            emisor=mono, tipo='C', punto_venta=2, numero=5,
            cliente_nombre='Cliente', cliente_condicion='consumidor_final',
            fecha=datetime.date(2026, 8, 5),
            neto=Decimal('500.00'), iva=Decimal('0.00'), total=Decimal('500.00'), cae='751',
        )
        ta, ultimo, cae = self._con_arca(1)
        with ta, ultimo, cae as mock_cae:
            r = self.cliente.post(
                reverse('facturacion:comprobante-nota-credito', args=[factura.pk]),
                {'items': [{'descripcion': 'Anulación', 'cantidad': 1, 'precio_unitario': '500'}]},
                format='json',
            )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(mock_cae.call_args.args[5], 13)
        self.assertEqual(Decimal(str(r.data['iva'])), Decimal('0.00'))
        self.assertEqual(Decimal(str(r.data['total'])), Decimal('500.00'))
