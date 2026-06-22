from django.test import TestCase
from django.urls import reverse

from .models import Usuario


class UsuarioModelTests(TestCase):
    def test_create_user_normaliza_email_y_hashea_password(self):
        user = Usuario.objects.create_user(
            email='Vendedor@CelTuc.AR', password='clave-segura-123', nombre='Ana',
        )
        self.assertEqual(user.email, 'vendedor@celtuc.ar')
        self.assertTrue(user.check_password('clave-segura-123'))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.rol, Usuario.Rol.VENDEDOR)

    def test_create_superuser_es_admin(self):
        admin = Usuario.objects.create_superuser(
            email='jefe@celtuc.ar', password='clave-segura-123', nombre='Jefe',
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(admin.rol, Usuario.Rol.ADMINISTRADOR)

    def test_documento_vacio_se_guarda_como_null(self):
        user = Usuario.objects.create_user(
            email='sindoc@celtuc.ar', password='clave-segura-123', nombre='Sin',
        )
        self.assertIsNone(user.documento)


class AuthFlowTests(TestCase):
    def setUp(self):
        self.user = Usuario.objects.create_user(
            email='ana@celtuc.ar', password='clave-segura-123', nombre='Ana',
        )

    def test_login_devuelve_tokens_y_usuario(self):
        resp = self.client.post(
            reverse('usuarios:login'),
            {'email': 'ana@celtuc.ar', 'password': 'clave-segura-123'},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn('access', body)
        self.assertIn('refresh', body)
        self.assertEqual(body['user']['email'], 'ana@celtuc.ar')

    def test_login_con_password_incorrecta_falla(self):
        resp = self.client.post(
            reverse('usuarios:login'),
            {'email': 'ana@celtuc.ar', 'password': 'incorrecta'},
            content_type='application/json',
        )
        # DRF responde 401 ante AuthenticationFailed (lleva header WWW-Authenticate).
        self.assertEqual(resp.status_code, 401)

    def test_me_requiere_autenticacion(self):
        self.assertEqual(self.client.get(reverse('usuarios:me')).status_code, 401)

    def test_me_con_token_devuelve_al_usuario(self):
        login = self.client.post(
            reverse('usuarios:login'),
            {'email': 'ana@celtuc.ar', 'password': 'clave-segura-123'},
            content_type='application/json',
        ).json()
        resp = self.client.get(
            reverse('usuarios:me'),
            HTTP_AUTHORIZATION=f'Bearer {login["access"]}',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['email'], 'ana@celtuc.ar')
