from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from inventario.models import Sucursal
from usuarios.models import Rol, Usuario

from .models import Empleado


class SucursalUnificadaTests(TestCase):
    """La sucursal es UNA sola tabla (inventario) para stock y empleados."""

    def test_seed_unificado(self):
        # Las migraciones dejan los tres locales definitivos con su CP...
        self.assertEqual(Sucursal.objects.get(nombre='Solar YB').codigo_postal, '4107')
        self.assertEqual(Sucursal.objects.get(nombre='Central YB').codigo_postal, '4107')
        self.assertEqual(Sucursal.objects.get(nombre='Salta').codigo_postal, '4000')
        # ...y no queda ningún resto de los nombres viejos de las dos tablas.
        self.assertFalse(
            Sucursal.todos.filter(nombre__in=['Solar', 'Centro', 'YB', 'La Salta']).exists()
        )

    def test_empleado_apunta_a_la_sucursal_de_inventario(self):
        suc = Sucursal.objects.get(nombre='Salta')
        emp = Empleado.objects.create(nombre='Juan', sucursal=suc)
        self.assertEqual(emp.sucursal.codigo_postal, '4000')
        self.assertIn(emp, suc.empleados.all())

    def test_los_dos_endpoints_exponen_la_misma_tabla(self):
        admin = Usuario.objects.create_superuser(
            email='admin@celtuc.ar', username='admin', password='clave-segura-123',
        )
        client = APIClient()
        client.force_authenticate(admin)
        de_empleados = client.get(reverse('empleados:sucursales')).data
        de_inventario = client.get(reverse('inv-sucursales')).data
        self.assertEqual(
            {(s['id'], s['nombre']) for s in de_empleados},
            {(s['id'], s['nombre']) for s in de_inventario},
        )
        # El de empleados trae el código postal (para documentos y sesión).
        por_nombre = {s['nombre']: s for s in de_empleados}
        self.assertEqual(por_nombre['Salta']['codigo_postal'], '4000')

    def test_sucursal_nueva_va_al_final_del_orden(self):
        admin = Usuario.objects.create_superuser(
            email='admin@celtuc.ar', username='admin', password='clave-segura-123',
        )
        client = APIClient()
        client.force_authenticate(admin)
        r = client.post(
            reverse('empleados:sucursales'),
            {'nombre': 'Depósito', 'codigo_postal': '4000'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        creada = Sucursal.objects.get(pk=r.data['id'])
        self.assertEqual(creada.orden, Sucursal.todos.exclude(pk=creada.pk).order_by('-orden').first().orden + 1)


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

    def test_con_permiso_ver_empleados_puede_leer_pero_no_escribir(self):
        # El rol "Empleado" (sembrado por migracion) trae el permiso ver_empleados.
        rol = Rol.objects.get(nombre='Empleado')
        regular = Usuario.objects.create_user(
            email='r@celtuc.ar', username='regular', password='clave-segura-123', rol=rol,
        )
        self._auth(regular)
        self.assertEqual(self.client.get(reverse('empleados:list')).status_code, 200)
        r = self.client.post(reverse('empleados:list'), {'nombre': 'X'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_sin_permiso_ver_empleados_no_puede_leer(self):
        # Rol sin el permiso del modulo: ni siquiera puede listar.
        rol = Rol.objects.create(nombre='Limitado')
        regular = Usuario.objects.create_user(
            email='lim@celtuc.ar', username='limitado', password='clave-segura-123', rol=rol,
        )
        self._auth(regular)
        self.assertEqual(self.client.get(reverse('empleados:list')).status_code, 403)

    def test_dar_acceso_asigna_rol_empleado_por_defecto(self):
        self._auth()
        emp = self.client.post(reverse('empleados:list'), {'nombre': 'Ana'}, format='json').data
        self.client.put(
            reverse('empleados:acceso', args=[emp['id']]),
            {'username': 'ana', 'email': 'ana@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        u = Usuario.objects.get(username='ana')
        self.assertIsNotNone(u.rol)
        self.assertEqual(u.rol.nombre, 'Empleado')
