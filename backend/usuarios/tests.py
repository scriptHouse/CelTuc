from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from empleados.models import Empleado

from .models import Permiso, Rol, Usuario
from .tokens import create_token_pair


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
        # El throttle de login usa la cache (LocMemCache persiste entre tests):
        # la limpiamos para que el conteo de intentos no se filtre de un test a otro.
        cache.clear()
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

    def test_refresh_renueva_el_par_de_tokens(self):
        refresh = self._login('ana').json()['refresh']
        r = self.client.post(
            reverse('usuarios:refresh'),
            {'refresh': refresh},
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn('access', body)
        self.assertIn('refresh', body)
        # El nuevo access sirve para autenticar.
        me = self.client.get(reverse('usuarios:me'), HTTP_AUTHORIZATION=f"Bearer {body['access']}")
        self.assertEqual(me.status_code, 200)

    def test_refresh_invalido_devuelve_401(self):
        r = self.client.post(
            reverse('usuarios:refresh'),
            {'refresh': 'no-es-un-token-valido'},
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 401)


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


class RolesModelTests(TestCase):
    """Helpers de autorizacion en el modelo Usuario (es_administrador/permisos)."""

    def setUp(self):
        cache.clear()  # throttle de login compartido por cache (ver AuthFlowTests)

    def test_seed_de_roles_y_permisos(self):
        # Las migraciones siembran los permisos de modulo (4 originales +
        # ver_simulador + ver_cotizaciones + ver_precios_service) y los roles base.
        self.assertEqual(Permiso.objects.count(), 7)
        self.assertTrue(Rol.objects.get(nombre='Administrador').es_admin)
        empleado = Rol.objects.get(nombre='Empleado')
        self.assertFalse(empleado.es_admin)
        self.assertEqual(empleado.permisos.count(), 7)

    def test_superusuario_ve_todo_sin_rol(self):
        admin = Usuario.objects.create_superuser(
            email='a@celtuc.ar', username='a', password='x',
        )
        self.assertTrue(admin.es_administrador)
        self.assertEqual(set(admin.codigos_permisos()), {p.codigo for p in Permiso.objects.all()})

    def test_rol_admin_da_acceso_total(self):
        u = Usuario.objects.create_user(
            email='b@celtuc.ar', username='b', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )
        self.assertTrue(u.es_administrador)

    def test_rol_restringido_limita_permisos(self):
        rol = Rol.objects.create(nombre='Cajero')
        rol.permisos.set(Permiso.objects.filter(codigo='ver_facturacion'))
        u = Usuario.objects.create_user(
            email='c@celtuc.ar', username='c', password='x', rol=rol,
        )
        self.assertFalse(u.es_administrador)
        self.assertEqual(u.codigos_permisos(), ['ver_facturacion'])

    def test_sin_rol_no_ve_nada(self):
        u = Usuario.objects.create_user(email='d@celtuc.ar', username='d', password='x')
        self.assertEqual(u.codigos_permisos(), [])

    def test_me_incluye_permisos_y_rol(self):
        rol = Rol.objects.get(nombre='Empleado')
        Usuario.objects.create_user(
            email='e@celtuc.ar', username='e', password='clave-segura-123', rol=rol,
        )
        access = self.client.post(
            reverse('usuarios:login'),
            {'identifier': 'e', 'password': 'clave-segura-123'},
            content_type='application/json',
        ).json()['access']
        body = self.client.get(reverse('usuarios:me'), HTTP_AUTHORIZATION=f'Bearer {access}').json()
        self.assertFalse(body['es_administrador'])
        self.assertEqual(set(body['permisos']), {p.codigo for p in rol.permisos.all()})
        self.assertEqual(body['rol']['nombre'], 'Empleado')


class RolesAPITests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser(
            email='admin@celtuc.ar', username='admin', password='clave-segura-123',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_solo_admin_gestiona_roles(self):
        anon = APIClient()
        self.assertEqual(anon.get(reverse('roles:list')).status_code, 401)
        regular = Usuario.objects.create_user(
            email='r@celtuc.ar', username='regular', password='x',
            rol=Rol.objects.get(nombre='Empleado'),
        )
        anon.force_authenticate(regular)
        self.assertEqual(anon.get(reverse('roles:list')).status_code, 403)

    def test_crear_editar_y_eliminar_rol(self):
        r = self.client.post(
            reverse('roles:list'),
            {'nombre': 'Cajero', 'descripcion': 'Caja', 'permisos': ['ver_facturacion']},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        rid = r.data['id']
        self.assertEqual(r.data['permisos'], ['ver_facturacion'])

        r = self.client.patch(
            reverse('roles:detail', args=[rid]),
            {'permisos': ['ver_panel', 'ver_facturacion']},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.data['permisos']), {'ver_panel', 'ver_facturacion'})

        self.assertEqual(self.client.delete(reverse('roles:detail', args=[rid])).status_code, 204)

    def test_no_se_puede_eliminar_rol_del_sistema(self):
        rol = Rol.objects.get(nombre='Empleado')
        r = self.client.delete(reverse('roles:detail', args=[rol.id]))
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Rol.objects.filter(pk=rol.id).exists())

    def test_nombre_de_rol_no_se_repite(self):
        r = self.client.post(
            reverse('roles:list'),
            {'nombre': 'empleado', 'permisos': []},
            format='json',
        )
        self.assertEqual(r.status_code, 400)


class JerarquiaSuperadminTests(TestCase):
    """Jerarquia: un administrador COMUN no puede crear/editar/eliminar a otros
    administradores ni superadministradores; eso queda reservado al superadmin
    (is_superuser). El admin comun si gestiona usuarios regulares."""

    def setUp(self):
        cache.clear()
        # Admin comun: tiene el rol "Administrador" (es_admin) pero NO es superusuario.
        self.admin = Usuario.objects.create_user(
            email='adminc@celtuc.ar', username='adminc', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )
        # Otro administrador (staff) que actua de "objetivo".
        self.otro_admin = Usuario.objects.create_user(
            email='staff@celtuc.ar', username='staffadmin', password='x',
        )
        self.otro_admin.is_staff = True
        self.otro_admin.save(update_fields=['is_staff'])
        # Un usuario regular (objetivo no-admin).
        self.regular = Usuario.objects.create_user(
            email='reg@celtuc.ar', username='regular', password='x',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_admin_no_crea_administradores(self):
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'nuevoadmin', 'email': 'na@celtuc.ar', 'password': 'clave-123', 'is_staff': True},
            format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_admin_si_crea_usuarios_regulares(self):
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'nuevoreg', 'email': 'nr@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)

    def test_admin_no_promueve_a_administrador(self):
        r = self.client.patch(
            reverse('usuarios_gestion:detail', args=[self.regular.id]),
            {'is_staff': True}, format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_admin_no_edita_a_otro_admin(self):
        r = self.client.patch(
            reverse('usuarios_gestion:detail', args=[self.otro_admin.id]),
            {'email': 'hack@celtuc.ar'}, format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_admin_no_elimina_a_otro_admin(self):
        r = self.client.delete(reverse('usuarios_gestion:detail', args=[self.otro_admin.id]))
        self.assertEqual(r.status_code, 403)

    def test_admin_si_edita_usuario_regular(self):
        r = self.client.patch(
            reverse('usuarios_gestion:detail', args=[self.regular.id]),
            {'email': 'reg2@celtuc.ar'}, format='json',
        )
        self.assertEqual(r.status_code, 200)

    def test_admin_no_crea_rol_de_administrador(self):
        r = self.client.post(
            reverse('roles:list'),
            {'nombre': 'OtroAdmin', 'es_admin': True, 'permisos': []}, format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_superadmin_si_gestiona_administradores(self):
        sup = Usuario.objects.create_superuser(email='sup@celtuc.ar', username='sup', password='x')
        c = APIClient()
        c.force_authenticate(sup)
        crear_admin = c.post(
            reverse('usuarios_gestion:list'),
            {'username': 'adminok', 'email': 'ao@celtuc.ar', 'password': 'clave-123', 'is_staff': True},
            format='json',
        )
        self.assertEqual(crear_admin.status_code, 201)
        crear_rol = c.post(
            reverse('roles:list'),
            {'nombre': 'RolAdmin', 'es_admin': True, 'permisos': []}, format='json',
        )
        self.assertEqual(crear_rol.status_code, 201)


class PresenciaTests(TestCase):
    """Auditoria: ultimo inicio de sesion y 'ultima vez activo' / en linea."""

    def setUp(self):
        cache.clear()  # throttle de login compartido por cache (ver AuthFlowTests)
        self.user = Usuario.objects.create_user(
            email='p@celtuc.ar', username='puser', password='clave-segura-123',
        )

    def _bearer(self, user):
        return {'HTTP_AUTHORIZATION': 'Bearer ' + create_token_pair(user)['access']}

    def test_login_registra_last_login_y_actividad(self):
        self.assertIsNone(self.user.last_login)
        self.assertIsNone(self.user.ultima_actividad)
        self.client.post(
            reverse('usuarios:login'),
            {'identifier': 'puser', 'password': 'clave-segura-123'},
            content_type='application/json',
        )
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)
        self.assertIsNotNone(self.user.ultima_actividad)
        self.assertTrue(self.user.en_linea)

    def test_heartbeat_requiere_autenticacion(self):
        self.assertEqual(self.client.post(reverse('usuarios:heartbeat')).status_code, 401)
        r = self.client.post(reverse('usuarios:heartbeat'), **self._bearer(self.user))
        self.assertEqual(r.status_code, 204)

    def test_request_autenticado_actualiza_actividad_vieja(self):
        vieja = timezone.now() - timedelta(minutes=10)
        Usuario.objects.filter(pk=self.user.pk).update(ultima_actividad=vieja)
        self.client.post(reverse('usuarios:heartbeat'), **self._bearer(self.user))
        self.user.refresh_from_db()
        self.assertGreater(self.user.ultima_actividad, vieja)
        self.assertTrue(self.user.en_linea)

    def test_throttle_no_reescribe_actividad_reciente(self):
        reciente = timezone.now() - timedelta(seconds=10)
        Usuario.objects.filter(pk=self.user.pk).update(ultima_actividad=reciente)
        self.client.get(reverse('usuarios:me'), **self._bearer(self.user))
        self.user.refresh_from_db()
        # Dentro del intervalo de 1 min: no se reescribe (1 sola escritura/min).
        self.assertLess(abs((self.user.ultima_actividad - reciente).total_seconds()), 1)

    def test_en_linea_es_falso_sin_actividad_reciente(self):
        Usuario.objects.filter(pk=self.user.pk).update(
            ultima_actividad=timezone.now() - timedelta(minutes=10),
        )
        self.user.refresh_from_db()
        self.assertFalse(self.user.en_linea)

    def test_serializer_admin_expone_presencia(self):
        admin = Usuario.objects.create_superuser(
            email='a@celtuc.ar', username='a', password='x',
        )
        client = APIClient()
        client.force_authenticate(admin)
        fila = [u for u in client.get(reverse('usuarios_gestion:list')).data if u['username'] == 'puser'][0]
        self.assertIn('last_login', fila)
        self.assertIn('ultima_actividad', fila)
        self.assertIn('en_linea', fila)
