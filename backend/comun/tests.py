"""Tests de las preferencias globales: permisos, claves validas y upsert."""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from usuarios.models import Rol, Usuario

from .models import Preferencia

CLAVE = 'facturacion.mensaje_whatsapp'


class PreferenciasTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            email='adm@celtuc.ar', username='admpref', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )

    def _client(self, user=None):
        c = APIClient()
        if user is not None:
            c.force_authenticate(user)
        return c

    def _url(self, clave=CLAVE):
        return reverse('comun:preferencia', args=[clave])

    def test_sin_autenticar_no_accede(self):
        r = self._client().get(self._url())
        self.assertIn(r.status_code, (401, 403))

    def test_sin_personalizar_devuelve_vacio(self):
        r = self._client(self.admin).get(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, {'clave': CLAVE, 'valor': ''})

    def test_guardar_y_leer(self):
        cliente = self._client(self.admin)
        r = cliente.put(self._url(), {'valor': 'Hola {cliente}, tu factura.'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['valor'], 'Hola {cliente}, tu factura.')

        r = cliente.get(self._url())
        self.assertEqual(r.data['valor'], 'Hola {cliente}, tu factura.')

        # Upsert: guardar de nuevo actualiza la misma fila (no duplica).
        cliente.put(self._url(), {'valor': 'Otro texto'}, format='json')
        self.assertEqual(Preferencia.objects.filter(clave=CLAVE).count(), 1)
        self.assertEqual(Preferencia.objects.get(clave=CLAVE).valor, 'Otro texto')

    def test_vaciar_restaura_el_default(self):
        cliente = self._client(self.admin)
        cliente.put(self._url(), {'valor': 'Personalizado'}, format='json')
        r = cliente.put(self._url(), {'valor': ''}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['valor'], '')

    def test_clave_desconocida_es_404(self):
        cliente = self._client(self.admin)
        self.assertEqual(cliente.get(self._url('otra.clave')).status_code, 404)
        self.assertEqual(
            cliente.put(self._url('otra.clave'), {'valor': 'x'}, format='json').status_code, 404,
        )

    def test_valor_no_texto_es_400(self):
        cliente = self._client(self.admin)
        self.assertEqual(cliente.put(self._url(), {}, format='json').status_code, 400)
        self.assertEqual(
            cliente.put(self._url(), {'valor': 123}, format='json').status_code, 400,
        )

    def test_empleado_sin_permiso_no_accede(self):
        empleado = Usuario.objects.create_user(
            email='emp@celtuc.ar', username='emppref', password='x',
            rol=Rol.objects.get(nombre='Empleado'),
        )
        cliente = self._client(empleado)
        if 'ver_facturacion' in empleado.codigos_permisos():
            # El rol Empleado del seed incluye facturacion: entonces SI accede.
            self.assertEqual(cliente.get(self._url()).status_code, 200)
        else:
            self.assertEqual(cliente.get(self._url()).status_code, 403)
            self.assertEqual(
                cliente.put(self._url(), {'valor': 'x'}, format='json').status_code, 403,
            )