"""Tests del archivo de documentos generados.

Cubren lo que hace al modulo confiable: que la exportacion quede guardada con
su archivo, que cada empleado vea solo lo suyo, que el borrado sea logico y
solo para administradores, y que el archivo se sirva con el content-type que
decide el servidor (no el que declara el navegador).
"""
import json
import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from auditoria.models import RegistroAuditoria
from facturacion.models import Cliente
from usuarios.models import Rol, Usuario

from .models import DocumentoGenerado

MEDIA_TEMPORAL = tempfile.mkdtemp(prefix='celtuc-test-docs-')

DATOS_CV = {
    'cupon': '1234',
    'nombreVendedor': 'Juan Perez',
    'dniVendedor': '30111222',
    'marca': 'iPhone',
    'modelo': '13 Pro',
    'imei1': '350000000000001',
    'precioNum': '1500000',
}


@override_settings(MEDIA_ROOT=MEDIA_TEMPORAL)
class HistorialDocumentosTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            email='adm@celtuc.ar', username='admdocs', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )
        rol_empleado = Rol.objects.get(nombre='Empleado')
        self.empleado = Usuario.objects.create_user(
            email='emp@celtuc.ar', username='empdocs', password='x', rol=rol_empleado,
        )
        self.otro = Usuario.objects.create_user(
            email='otro@celtuc.ar', username='otrodocs', password='x', rol=rol_empleado,
        )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def _registrar(self, user, *, tipo='compraventa', formato='pdf', cliente='Juan Perez',
                   nombre='compraventa-1234.pdf'):
        return self._client(user).post(
            reverse('documentos:documento-list'),
            {
                'tipo': tipo,
                'tipo_nombre': 'Compra / Venta',
                'formato': formato,
                'nombre_archivo': nombre,
                'sucursal': 'Salta',
                'referencia': '1234',
                'cliente': cliente,
                'cliente_documento': '30111222',
                'detalle': 'iPhone 13 Pro · IMEI 350000000000001',
                'total': '1500000.00',
                'datos': json.dumps(DATOS_CV),
                'archivo': SimpleUploadedFile(nombre, b'%PDF-1.4 fake', content_type='application/pdf'),
            },
            format='multipart',
        )

    # --- Alta -------------------------------------------------------------

    def test_exportar_guarda_archivo_y_metadatos(self):
        r = self._registrar(self.empleado)
        self.assertEqual(r.status_code, 201)
        doc = DocumentoGenerado.objects.get(pk=r.data['id'])
        self.assertEqual(doc.creado_por, self.empleado)
        self.assertEqual(doc.cliente, 'Juan Perez')
        self.assertEqual(str(doc.total), '1500000.00')
        self.assertEqual(doc.datos['modelo'], '13 Pro')
        self.assertEqual(doc.tamanio, len(b'%PDF-1.4 fake'))
        # El archivo quedo en disco, con nombre propio del servidor.
        self.assertTrue(doc.archivo.name.startswith('documentos/'))
        self.assertTrue(doc.archivo.name.endswith('.pdf'))
        self.assertEqual(doc.archivo.read(), b'%PDF-1.4 fake')

    def test_content_type_lo_decide_el_servidor(self):
        """Aunque el navegador mienta el content-type, se guarda el del formato."""
        r = self._client(self.empleado).post(
            reverse('documentos:documento-list'),
            {
                'tipo': 'sena', 'formato': 'xlsx', 'nombre_archivo': 'sena.xlsx',
                'archivo': SimpleUploadedFile('sena.xlsx', b'PK\x03\x04', content_type='text/html'),
            },
            format='multipart',
        )
        self.assertEqual(r.status_code, 201)
        doc = DocumentoGenerado.objects.get(pk=r.data['id'])
        self.assertEqual(
            doc.content_type,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        self.assertTrue(doc.archivo.name.endswith('.xlsx'))

    def test_sin_archivo_no_se_registra(self):
        r = self._client(self.empleado).post(
            reverse('documentos:documento-list'), {'tipo': 'sena'}, format='multipart',
        )
        self.assertEqual(r.status_code, 400)
        self.assertFalse(DocumentoGenerado.objects.exists())

    def test_tipo_es_obligatorio(self):
        r = self._client(self.empleado).post(
            reverse('documentos:documento-list'),
            {'archivo': SimpleUploadedFile('x.pdf', b'x', content_type='application/pdf')},
            format='multipart',
        )
        self.assertEqual(r.status_code, 400)

    def test_datos_invalidos_no_rompen(self):
        r = self._client(self.empleado).post(
            reverse('documentos:documento-list'),
            {
                'tipo': 'sena', 'datos': 'no-es-json',
                'archivo': SimpleUploadedFile('x.pdf', b'x', content_type='application/pdf'),
            },
            format='multipart',
        )
        self.assertEqual(r.status_code, 400)

    def test_campos_vacios_del_multipart_no_rompen(self):
        """Un formulario a medio llenar manda '' en total: no es un error."""
        r = self._client(self.empleado).post(
            reverse('documentos:documento-list'),
            {
                'tipo': 'garantia-accesorios', 'formato': 'pos80', 'total': '',
                'cliente': '', 'referencia': '',
                'archivo': SimpleUploadedFile('t.pdf', b'x', content_type='application/pdf'),
            },
            format='multipart',
        )
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(DocumentoGenerado.objects.get(pk=r.data['id']).total)

    # --- Visibilidad ------------------------------------------------------

    def test_cada_empleado_ve_solo_lo_suyo_y_el_admin_ve_todo(self):
        self._registrar(self.empleado, cliente='Cliente del empleado')
        self._registrar(self.otro, cliente='Cliente del otro')

        propio = self._client(self.empleado).get(reverse('documentos:documento-list'))
        self.assertEqual(propio.data['total'], 1)
        self.assertEqual(propio.data['resultados'][0]['cliente'], 'Cliente del empleado')
        self.assertFalse(propio.data['puede_ver_todo'])
        self.assertNotIn('usuarios', propio.data)

        todo = self._client(self.admin).get(reverse('documentos:documento-list'))
        self.assertEqual(todo.data['total'], 2)
        self.assertTrue(todo.data['puede_ver_todo'])
        self.assertEqual(set(todo.data['usuarios']), {'empdocs', 'otrodocs'})

    def test_filtros_y_busqueda(self):
        self._registrar(self.admin, tipo='compraventa', cliente='Juan Perez')
        self._registrar(self.admin, tipo='sena', formato='xlsx', cliente='Ana Gomez')
        url = reverse('documentos:documento-list')
        client = self._client(self.admin)

        self.assertEqual(client.get(url, {'tipo': 'sena'}).data['total'], 1)
        self.assertEqual(client.get(url, {'formato': 'xlsx'}).data['total'], 1)
        self.assertEqual(client.get(url, {'q': 'gomez'}).data['total'], 1)
        self.assertEqual(client.get(url, {'q': '1234'}).data['total'], 2)
        self.assertEqual(client.get(url, {'usuario': 'admdocs'}).data['total'], 2)
        self.assertEqual(client.get(url, {'desde': '2000-01-01'}).data['total'], 2)
        self.assertEqual(client.get(url, {'hasta': '2000-01-01'}).data['total'], 0)

    def test_resumen_en_la_primera_pagina(self):
        self._registrar(self.admin)
        r = self._client(self.admin).get(reverse('documentos:documento-list'))
        self.assertEqual(r.data['resumen']['hoy'], 1)
        self.assertEqual(r.data['resumen']['total'], 1)
        self.assertEqual(r.data['sucursales'], ['Salta'])

    # --- Descarga ---------------------------------------------------------

    def test_descarga_autenticada_del_propio_documento(self):
        doc_id = self._registrar(self.empleado).data['id']
        url = reverse('documentos:documento-archivo', args=[doc_id])

        r = self._client(self.empleado).get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertIn('inline', r['Content-Disposition'])
        self.assertEqual(b''.join(r.streaming_content), b'%PDF-1.4 fake')

        r = self._client(self.empleado).get(url, {'descargar': '1'})
        self.assertIn('attachment', r['Content-Disposition'])

    def test_un_empleado_no_baja_el_documento_de_otro(self):
        doc_id = self._registrar(self.otro).data['id']
        url = reverse('documentos:documento-archivo', args=[doc_id])
        self.assertEqual(self._client(self.empleado).get(url).status_code, 404)
        self.assertEqual(self._client(self.admin).get(url).status_code, 200)

    def test_sin_sesion_no_se_baja_nada(self):
        doc_id = self._registrar(self.empleado).data['id']
        r = APIClient().get(reverse('documentos:documento-archivo', args=[doc_id]))
        self.assertIn(r.status_code, (401, 403))

    # --- Borrado ----------------------------------------------------------

    def test_solo_el_admin_elimina_y_el_borrado_es_logico(self):
        doc_id = self._registrar(self.empleado).data['id']
        url = reverse('documentos:documento-detail', args=[doc_id])

        self.assertEqual(self._client(self.empleado).delete(url).status_code, 403)
        self.assertEqual(self._client(self.admin).delete(url).status_code, 204)

        self.assertFalse(DocumentoGenerado.objects.filter(pk=doc_id).exists())
        doc = DocumentoGenerado.todos.get(pk=doc_id)
        self.assertTrue(doc.borrado)
        self.assertEqual(doc.borrado_por, self.admin)
        self.assertTrue(doc.archivo.storage.exists(doc.archivo.name))

    # --- Auditoria --------------------------------------------------------

    def test_la_generacion_queda_en_auditoria(self):
        self._registrar(self.empleado)
        registro = RegistroAuditoria.objects.filter(app='documentos').first()
        self.assertIsNotNone(registro)
        self.assertEqual(registro.accion, 'crear')
        self.assertEqual(registro.usuario_username, 'empdocs')
        self.assertIn('Compra / Venta', registro.objeto)
        self.assertIn('Juan Perez', registro.objeto)


@override_settings(MEDIA_ROOT=MEDIA_TEMPORAL)
class ClienteDelDocumentoTests(TestCase):
    """El cliente del papel entra a la misma base que factura y venta.

    Identidad: manda el documento y, si no hay, el telefono. Sin ninguno de los
    dos no se registra (no habria como reconocerlo despues).
    """

    def setUp(self):
        self.empleado = Usuario.objects.create_user(
            email='doc-cli@celtuc.ar', username='doccli', password='x',
            rol=Rol.objects.get(nombre='Empleado'),
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.empleado)

    def _registrar(self, **campos):
        cuerpo = {
            'tipo': 'compraventa',
            'tipo_nombre': 'Compra / Venta',
            'formato': 'pdf',
            'nombre_archivo': 'compraventa-1.pdf',
            'sucursal': 'Salta',
            'cliente': 'Juan Perez',
            'datos': json.dumps(DATOS_CV),
            'archivo': SimpleUploadedFile('c.pdf', b'%PDF-1.4 fake', content_type='application/pdf'),
        }
        cuerpo.update(campos)
        return self.cliente.post(reverse('documentos:documento-list'), cuerpo, format='multipart')

    def test_con_dni_da_de_alta_el_cliente(self):
        r = self._registrar(cliente_documento='30111222')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.data['cliente_registrado']['nuevo'])

        cliente = Cliente.objects.get(doc_numero='30111222')
        self.assertEqual(cliente.nombre, 'Juan Perez')
        self.assertEqual(cliente.doc_tipo, 'DNI')
        self.assertEqual(cliente.creado_por, self.empleado)

    def test_el_mismo_dni_no_se_duplica_ni_con_puntos(self):
        self._registrar(cliente_documento='30111222')
        r = self._registrar(cliente='Juan Perez Lopez', cliente_documento='30.111.222')

        self.assertFalse(r.data['cliente_registrado']['nuevo'])
        self.assertEqual(Cliente.objects.filter(doc_numero='30111222').count(), 1)
        # El nombre mas nuevo pisa al viejo; el documento sigue siendo el mismo.
        self.assertEqual(Cliente.objects.get(doc_numero='30111222').nombre, 'Juan Perez Lopez')

    def test_sin_documento_identifica_por_telefono(self):
        r = self._registrar(tipo='sena', cliente='Ana Gomez', cliente_telefono='3815551234')
        self.assertEqual(r.status_code, 201)

        cliente = Cliente.objects.get(telefono='3815551234')
        self.assertEqual(cliente.nombre, 'Ana Gomez')
        self.assertEqual(cliente.doc_numero, '')

    def test_sin_documento_ni_telefono_no_registra_nada(self):
        r = self._registrar(tipo='reparacion', cliente='Cliente de paso')
        self.assertEqual(r.status_code, 201)
        self.assertNotIn('cliente_registrado', r.data)
        self.assertEqual(Cliente.objects.count(), 0)

    def test_un_numero_que_no_es_documento_no_se_usa_como_identidad(self):
        r = self._registrar(cliente_documento='123')
        self.assertNotIn('cliente_registrado', r.data)
        self.assertEqual(Cliente.objects.count(), 0)

    def test_el_documento_se_archiva_igual_si_el_cliente_falla(self):
        with patch('facturacion.clientes.registrar_cliente', side_effect=RuntimeError('boom')):
            r = self._registrar(cliente_documento='30111222')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(DocumentoGenerado.objects.filter(pk=r.data['id']).exists())
        self.assertNotIn('cliente_registrado', r.data)


class AutocompletadoClientesTests(TestCase):
    """El buscador de clientes del formulario: acotado y sin datos de mas."""

    def setUp(self):
        self.empleado = Usuario.objects.create_user(
            email='doc-ac@celtuc.ar', username='docac', password='x',
            rol=Rol.objects.get(nombre='Empleado'),
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.empleado)
        self.url = reverse('documentos:documento-clientes')
        Cliente.objects.create(nombre='Juan Perez', doc_numero='30111222',
                               telefono='3815551234', email='juan@mail.com')
        Cliente.objects.create(nombre='Ana Gomez', doc_numero='27999888')

    def test_busca_por_nombre_documento_y_telefono(self):
        for termino, esperado in (('juan', 'Juan Perez'), ('30.111', 'Juan Perez'),
                                  ('5551234', 'Juan Perez'), ('gomez', 'Ana Gomez')):
            r = self.cliente.get(self.url, {'buscar': termino})
            self.assertEqual(r.status_code, 200, termino)
            self.assertEqual([c['nombre'] for c in r.data], [esperado], termino)

    def test_devuelve_solo_datos_de_contacto(self):
        r = self.cliente.get(self.url, {'buscar': 'juan'})
        self.assertEqual(
            set(r.data[0]), {'id', 'nombre', 'doc_numero', 'telefono', 'email'},
        )

    def test_sin_termino_no_lista_la_base(self):
        self.assertEqual(self.cliente.get(self.url).data, [])
        self.assertEqual(self.cliente.get(self.url, {'buscar': 'a'}).data, [])

    def test_pide_sesion(self):
        self.assertEqual(APIClient().get(self.url).status_code, 401)
