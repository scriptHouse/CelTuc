from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from usuarios.models import Usuario

from .models import Empleado


class EmpleadoModelTests(TestCase):
    def test_empleado_solo_con_nombre(self):
        emp = Empleado.objects.create(nombre='Juan')
        self.assertEqual(emp.apellido, '')
        self.assertIsNone(emp.usuario)
        self.assertFalse(emp.puede_loguear)
        self.assertEqual(str(emp), 'Juan')

    def test_empleado_con_apellido_y_usuario(self):
        user = Usuario.objects.create_user(
            email='juan@celtuc.ar', username='juanp', password='clave-segura-123',
        )
        emp = Empleado.objects.create(nombre='Juan', apellido='Perez', usuario=user)
        self.assertEqual(emp.nombre_completo, 'Juan Perez')
        self.assertTrue(emp.puede_loguear)
        self.assertEqual(user.empleado, emp)

    def test_un_usuario_no_puede_estar_en_dos_empleados(self):
        from django.db import IntegrityError, transaction

        user = Usuario.objects.create_user(
            email='ana@celtuc.ar', username='ana', password='clave-segura-123',
        )
        Empleado.objects.create(nombre='Ana', usuario=user)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Empleado.objects.create(nombre='Otra', usuario=user)

    def test_borrar_usuario_no_borra_empleado(self):
        user = Usuario.objects.create_user(
            email='caja@celtuc.ar', username='caja', password='clave-segura-123',
        )
        emp = Empleado.objects.create(nombre='Caja', usuario=user)
        user.delete()
        emp.refresh_from_db()
        self.assertIsNone(emp.usuario)


class EmpleadoAPITests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser(
            email='admin@celtuc.ar', username='admin', password='clave-segura-123',
        )
        self.client = APIClient()

    def _auth(self, user=None):
        self.client.force_authenticate(user or self.admin)

    def _login(self, identifier, password):
        return APIClient().post(
            reverse('usuarios:login'),
            {'identifier': identifier, 'password': password},
            format='json',
        )

    def test_requiere_autenticacion(self):
        self.assertEqual(self.client.get(reverse('empleados:list')).status_code, 401)

    def test_crear_y_listar_sin_que_aparezca_el_admin(self):
        self._auth()
        r = self.client.post(reverse('empleados:list'), {'nombre': 'Juan'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['nombre'], 'Juan')
        self.assertIsNone(r.data['usuario'])
        # El admin es superusuario, NO un empleado: la lista trae solo a Juan.
        lista = self.client.get(reverse('empleados:list')).data
        self.assertEqual(len(lista), 1)
        self.assertEqual(lista[0]['nombre'], 'Juan')

    def test_dar_acceso_crea_usuario_regular_y_permite_login(self):
        self._auth()
        emp = self.client.post(reverse('empleados:list'), {'nombre': 'Ana'}, format='json').data
        r = self.client.put(
            reverse('empleados:acceso', args=[emp['id']]),
            {'username': 'ana', 'email': 'ana@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['usuario']['username'], 'ana')
        self.assertTrue(r.data['puede_loguear'])
        # El login del empleado es un usuario REGULAR (diferenciado del admin).
        u = Usuario.objects.get(username='ana')
        self.assertFalse(u.is_superuser)
        self.assertFalse(u.is_staff)
        # Y puede iniciar sesión con username o email.
        self.assertEqual(self._login('ana', 'clave-123').status_code, 200)
        self.assertEqual(self._login('ana@celtuc.ar', 'clave-123').status_code, 200)

    def test_quitar_acceso_borra_la_cuenta(self):
        self._auth()
        emp = self.client.post(reverse('empleados:list'), {'nombre': 'Ana'}, format='json').data
        self.client.put(
            reverse('empleados:acceso', args=[emp['id']]),
            {'username': 'ana', 'email': 'ana@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        r = self.client.delete(reverse('empleados:acceso', args=[emp['id']]))
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data['usuario'])
        self.assertFalse(Usuario.objects.filter(username='ana').exists())

    def test_borrar_empleado_borra_su_acceso(self):
        self._auth()
        emp = self.client.post(reverse('empleados:list'), {'nombre': 'Ana'}, format='json').data
        self.client.put(
            reverse('empleados:acceso', args=[emp['id']]),
            {'username': 'ana', 'email': 'ana@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.client.delete(reverse('empleados:detail', args=[emp['id']]))
        self.assertFalse(Empleado.objects.filter(pk=emp['id']).exists())
        self.assertFalse(Usuario.objects.filter(username='ana').exists())

    def test_username_de_acceso_no_puede_chocar_con_el_admin(self):
        self._auth()
        emp = self.client.post(reverse('empleados:list'), {'nombre': 'Ana'}, format='json').data
        r = self.client.put(
            reverse('empleados:acceso', args=[emp['id']]),
            {'username': 'admin', 'email': 'otro@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_no_staff_puede_leer_pero_no_escribir(self):
        regular = Usuario.objects.create_user(
            email='r@celtuc.ar', username='regular', password='clave-segura-123',
        )
        self._auth(regular)
        self.assertEqual(self.client.get(reverse('empleados:list')).status_code, 200)
        r = self.client.post(reverse('empleados:list'), {'nombre': 'X'}, format='json')
        self.assertEqual(r.status_code, 403)
