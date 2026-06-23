from django.test import TestCase
from django.urls import reverse

from .models import Usuario


class UsuarioModelTests(TestCase):
    def test_create_user_normaliza_email_y_username(self):
        user = Usuario.objects.create_user(
            email='Vendedor@CelTuc.AR', username='JuanP', password='clave-segura-123',
        )
        self.assertEqual(user.email, 'vendedor@celtuc.ar')
        self.assertEqual(user.username, 'juanp')
        self.assertTrue(user.check_password('clave-segura-123'))
        self.assertFalse(user.is_staff)

    def test_create_superuser(self):
        admin = Usuario.objects.create_superuser(
            email='jefe@celtuc.ar', username='jefe', password='clave-segura-123',
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)


class AuthFlowTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create_user(
            email='ana@celtuc.ar', username='ana', password='clave-segura-123',
        )

    def _login(self, identifier, password='clave-segura-123'):
        return self.client.post(
            reverse('usuarios:login'),
            {'identifier': identifier, 'password': password},
            content_type='application/json',
        )

    def test_login_con_email(self):
        resp = self._login('ana@celtuc.ar')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn('access', body)
        self.assertIn('refresh', body)
        self.assertEqual(body['user']['username'], 'ana')

    def test_login_con_username(self):
        resp = self._login('ana')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['user']['email'], 'ana@celtuc.ar')

    def test_login_es_insensible_a_mayusculas(self):
        self.assertEqual(self._login('ANA@CelTuc.ar').status_code, 200)
        self.assertEqual(self._login('ANA').status_code, 200)

    def test_login_con_password_incorrecta_falla(self):
        # 401 generico (no revela si el usuario existe).
        self.assertEqual(self._login('ana', password='incorrecta').status_code, 401)

    def test_login_usuario_inexistente_falla_igual(self):
        self.assertEqual(self._login('noexiste', password='x').status_code, 401)

    def test_me_requiere_autenticacion(self):
        self.assertEqual(self.client.get(reverse('usuarios:me')).status_code, 401)

    def test_me_con_token_devuelve_al_usuario(self):
        access = self._login('ana').json()['access']
        resp = self.client.get(
            reverse('usuarios:me'),
            HTTP_AUTHORIZATION=f'Bearer {access}',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['username'], 'ana')
