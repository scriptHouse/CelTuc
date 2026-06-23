from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from empleados.models import Empleado

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


class GestionUsuariosTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser(
            email='admin@celtuc.ar', username='admin', password='clave-segura-123',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_requiere_staff(self):
        anon = APIClient()
        self.assertEqual(anon.get(reverse('usuarios_gestion:list')).status_code, 401)
        regular = Usuario.objects.create_user(email='r@celtuc.ar', username='regular', password='x')
        anon.force_authenticate(regular)
        self.assertEqual(anon.get(reverse('usuarios_gestion:list')).status_code, 403)

    def test_listar_incluye_al_admin(self):
        data = self.client.get(reverse('usuarios_gestion:list')).data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['username'], 'admin')
        self.assertTrue(data[0]['is_superuser'])
        self.assertIsNone(data[0]['empleado'])

    def test_crear_usuario_simple_es_regular(self):
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'vendedor1', 'email': 'v1@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        u = Usuario.objects.get(username='vendedor1')
        self.assertFalse(u.is_superuser)
        self.assertFalse(u.is_staff)
        self.assertIsNone(r.data['empleado'])

    def test_crear_usuario_con_empleado_en_conjunto(self):
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {
                'username': 'lgomez',
                'email': 'lucas@celtuc.ar',
                'password': 'clave-123',
                'is_staff': True,
                'empleado': {'nombre': 'Lucas', 'apellido': 'Gómez'},
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['empleado']['nombre_completo'], 'Lucas Gómez')
        u = Usuario.objects.get(username='lgomez')
        self.assertTrue(u.is_staff)
        emp = Empleado.objects.get(usuario=u)
        self.assertEqual(emp.nombre, 'Lucas')

    def test_email_duplicado_falla(self):
        self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'a1', 'email': 'dup@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'a2', 'email': 'dup@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_editar_usuario(self):
        u = Usuario.objects.create_user(email='x@celtuc.ar', username='equis', password='vieja-123')
        r = self.client.patch(
            reverse('usuarios_gestion:detail', args=[u.id]),
            {'email': 'nuevo@celtuc.ar', 'password': 'nueva-clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        u.refresh_from_db()
        self.assertEqual(u.email, 'nuevo@celtuc.ar')
        self.assertTrue(u.check_password('nueva-clave-123'))

    def test_no_puedo_borrarme_a_mi_mismo(self):
        r = self.client.delete(reverse('usuarios_gestion:detail', args=[self.admin.id]))
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Usuario.objects.filter(pk=self.admin.pk).exists())

    def test_no_se_puede_borrar_un_superusuario(self):
        otro = Usuario.objects.create_superuser(email='s2@celtuc.ar', username='super2', password='x')
        r = self.client.delete(reverse('usuarios_gestion:detail', args=[otro.id]))
        self.assertEqual(r.status_code, 400)

    def test_borrar_usuario_deja_al_empleado_sin_login(self):
        u = Usuario.objects.create_user(email='caja@celtuc.ar', username='caja', password='x')
        emp = Empleado.objects.create(nombre='Caja', usuario=u)
        r = self.client.delete(reverse('usuarios_gestion:detail', args=[u.id]))
        self.assertEqual(r.status_code, 204)
        emp.refresh_from_db()
        self.assertIsNone(emp.usuario)
