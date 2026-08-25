from datetime import timedelta

from django.core.cache import cache
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import RegistroAuditoria
from empleados.models import Empleado

from .models import Permiso, Rol, TicketImpersonacion, Usuario
from .tokens import create_token, create_token_pair, decode_token


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
        # simulador, cotizaciones, precios_service, productos, ficha de
        # equipo, dolar y caja) y los roles base.
        self.assertEqual(Permiso.objects.count(), 11)
        self.assertTrue(Rol.objects.get(nombre='Administrador').es_admin)
        empleado = Rol.objects.get(nombre='Empleado')
        self.assertFalse(empleado.es_admin)
        self.assertEqual(empleado.permisos.count(), 11)

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
    """Jerarquia: cualquier administrador puede CREAR administradores (alta o
    promocion), pero editar/eliminar a otro administrador y gestionar roles de
    administrador queda reservado al superadmin (is_superuser)."""

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

    def test_admin_si_crea_administradores(self):
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'nuevoadmin', 'email': 'na@celtuc.ar', 'password': 'clave-123', 'is_staff': True},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        u = Usuario.objects.get(username='nuevoadmin')
        self.assertTrue(u.is_staff)
        self.assertFalse(u.is_superuser)

    def test_admin_si_crea_usuarios_regulares(self):
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'nuevoreg', 'email': 'nr@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)

    def test_admin_si_promueve_a_administrador(self):
        r = self.client.patch(
            reverse('usuarios_gestion:detail', args=[self.regular.id]),
            {'is_staff': True}, format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.regular.refresh_from_db()
        self.assertTrue(self.regular.es_administrador)

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


class ImpersonacionTests(TestCase):
    """El boton "Impersonar" del admin y el canje del pase (ver impersonacion.py)."""

    def setUp(self):
        cache.clear()
        self.superadmin = Usuario.objects.create_superuser(
            email='dueno@celtuc.ar', username='dueno', password='clave-segura-123',
        )
        self.empleado = Usuario.objects.create_user(
            email='noe@celtuc.ar', username='noe', password='clave-segura-123',
        )
        self.client = Client()

    # --- Helpers -------------------------------------------------------------

    def _url(self, usuario):
        return reverse('admin:usuarios_usuario_impersonar', args=[usuario.pk])

    def _pase_de(self, respuesta) -> str:
        """El pase que viaja en el fragmento de la URL de redireccion."""
        return respuesta['Location'].split('#ticket=')[1]

    def _impersonar(self, objetivo=None):
        """Flujo completo: boton del admin + canje. Devuelve el cuerpo del canje."""
        self.client.force_login(self.superadmin)
        redir = self.client.post(self._url(objetivo or self.empleado))
        canje = APIClient().post(
            reverse('usuarios:impersonar-canjear'),
            {'ticket': self._pase_de(redir)},
            format='json',
        )
        self.assertEqual(canje.status_code, 200)
        return canje.json()

    # --- El boton en el admin ------------------------------------------------

    def test_el_listado_muestra_el_boton_al_superadmin(self):
        self.client.force_login(self.superadmin)
        html = self.client.get(reverse('admin:usuarios_usuario_changelist')).content.decode()
        self.assertIn('Impersonar', html)
        self.assertIn(self._url(self.empleado), html)

    def test_un_staff_que_no_es_superadmin_no_puede_impersonar(self):
        staff = Usuario.objects.create_user(
            email='staff@celtuc.ar', username='staff', password='clave-segura-123', is_staff=True,
        )
        self.client.force_login(staff)
        html = self.client.get(reverse('admin:usuarios_usuario_changelist')).content.decode()
        self.assertNotIn(self._url(self.empleado), html)
        self.assertEqual(self.client.post(self._url(self.empleado)).status_code, 403)
        self.assertEqual(TicketImpersonacion.objects.count(), 0)

    def test_anonimo_no_puede_impersonar(self):
        resp = self.client.post(self._url(self.empleado))
        self.assertEqual(resp.status_code, 302)  # al login del admin
        self.assertIn('/admin/login/', resp['Location'])
        self.assertEqual(TicketImpersonacion.objects.count(), 0)

    def test_el_get_solo_muestra_la_confirmacion(self):
        """Una accion con efectos NUNCA cuelga de un simple link (GET)."""
        self.client.force_login(self.superadmin)
        resp = self.client.get(self._url(self.empleado))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'noe')
        self.assertEqual(TicketImpersonacion.objects.count(), 0)

    def test_el_post_emite_el_pase_y_redirige_al_frontend(self):
        self.client.force_login(self.superadmin)
        resp = self.client.post(self._url(self.empleado))
        self.assertEqual(resp.status_code, 302)
        self.assertTrue(resp['Location'].startswith('/impersonar#ticket='))
        ticket = TicketImpersonacion.objects.get()
        self.assertEqual(ticket.actor, self.superadmin)
        self.assertEqual(ticket.objetivo, self.empleado)
        self.assertIsNone(ticket.usado)
        # Lo que se guarda es el hash, nunca el pase en claro.
        self.assertNotIn(ticket.token_hash, resp['Location'])
        self.assertEqual(ticket.token_hash, TicketImpersonacion.hashear(self._pase_de(resp)))

    def test_el_inicio_queda_en_la_auditoria(self):
        self.client.force_login(self.superadmin)
        self.client.post(self._url(self.empleado))
        registro = RegistroAuditoria.objects.get(accion='impersonar')
        self.assertEqual(registro.usuario_username, 'dueno')
        self.assertEqual(registro.objeto, 'noe')

    def test_no_se_puede_impersonar_a_otro_superadministrador(self):
        otro = Usuario.objects.create_superuser(
            email='socio@celtuc.ar', username='socio', password='clave-segura-123',
        )
        self.client.force_login(self.superadmin)
        self.assertContains(self.client.get(self._url(otro)), 'No se puede impersonar')
        self.assertEqual(self.client.post(self._url(otro)).status_code, 302)
        self.assertEqual(TicketImpersonacion.objects.count(), 0)

    def test_no_se_puede_impersonar_a_uno_mismo(self):
        self.client.force_login(self.superadmin)
        self.client.post(self._url(self.superadmin))
        self.assertEqual(TicketImpersonacion.objects.count(), 0)

    def test_no_se_puede_impersonar_una_cuenta_inactiva(self):
        self.empleado.is_active = False
        self.empleado.save(update_fields=['is_active'])
        self.client.force_login(self.superadmin)
        self.client.post(self._url(self.empleado))
        self.assertEqual(TicketImpersonacion.objects.count(), 0)

    # --- El canje del pase ---------------------------------------------------

    def test_el_canje_devuelve_la_sesion_de_la_cuenta_impersonada(self):
        cuerpo = self._impersonar()
        self.assertEqual(cuerpo['user']['username'], 'noe')
        self.assertEqual(cuerpo['impersonacion']['actor']['username'], 'dueno')
        me = APIClient().get(
            reverse('usuarios:me'), HTTP_AUTHORIZATION=f"Bearer {cuerpo['access']}",
        )
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()['username'], 'noe')

    def test_el_pase_sirve_una_sola_vez(self):
        self.client.force_login(self.superadmin)
        pase = self._pase_de(self.client.post(self._url(self.empleado)))
        url = reverse('usuarios:impersonar-canjear')
        self.assertEqual(APIClient().post(url, {'ticket': pase}, format='json').status_code, 200)
        self.assertEqual(APIClient().post(url, {'ticket': pase}, format='json').status_code, 400)

    def test_el_pase_vencido_no_sirve(self):
        self.client.force_login(self.superadmin)
        pase = self._pase_de(self.client.post(self._url(self.empleado)))
        TicketImpersonacion.objects.update(expira=timezone.now() - timedelta(seconds=1))
        resp = APIClient().post(
            reverse('usuarios:impersonar-canjear'), {'ticket': pase}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_un_pase_inventado_no_sirve(self):
        resp = APIClient().post(
            reverse('usuarios:impersonar-canjear'), {'ticket': 'a' * 43}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_si_desactivan_la_cuenta_entre_medio_el_canje_falla(self):
        self.client.force_login(self.superadmin)
        pase = self._pase_de(self.client.post(self._url(self.empleado)))
        self.empleado.is_active = False
        self.empleado.save(update_fields=['is_active'])
        resp = APIClient().post(
            reverse('usuarios:impersonar-canjear'), {'ticket': pase}, format='json',
        )
        self.assertEqual(resp.status_code, 403)

    # --- La sesion impersonada -----------------------------------------------

    def test_la_sesion_impersonada_no_marca_presencia(self):
        """Impersonar no puede hacer figurar "en linea" a quien no esta usando el sistema."""
        cuerpo = self._impersonar()
        APIClient().get(reverse('usuarios:me'), HTTP_AUTHORIZATION=f"Bearer {cuerpo['access']}")
        self.empleado.refresh_from_db()
        self.assertIsNone(self.empleado.ultima_actividad)
        self.assertIsNone(self.empleado.last_login)

    def test_el_refresh_conserva_la_marca_de_impersonacion(self):
        cuerpo = self._impersonar()
        r = APIClient().post(
            reverse('usuarios:refresh'), {'refresh': cuerpo['refresh']}, format='json',
        )
        self.assertEqual(r.status_code, 200)
        payload = decode_token(r.json()['access'], expected_type='access')
        self.assertEqual(payload['act'], str(self.superadmin.pk))
        self.assertEqual(payload['imp_exp'], decode_token(cuerpo['access'], 'access')['imp_exp'])

    def test_si_el_actor_deja_de_ser_superadmin_la_sesion_muere(self):
        cuerpo = self._impersonar()
        self.superadmin.is_superuser = False
        self.superadmin.save(update_fields=['is_superuser'])
        me = APIClient().get(
            reverse('usuarios:me'), HTTP_AUTHORIZATION=f"Bearer {cuerpo['access']}",
        )
        self.assertEqual(me.status_code, 401)
        r = APIClient().post(
            reverse('usuarios:refresh'), {'refresh': cuerpo['refresh']}, format='json',
        )
        self.assertEqual(r.status_code, 401)

    def test_la_impersonacion_caduca_a_las_dos_horas_aunque_se_renueve(self):
        """`imp_exp` es un tope ABSOLUTO: no se estira renovando tokens."""
        vencido = int((timezone.now() - timedelta(minutes=1)).timestamp())
        extra = {'act': str(self.superadmin.pk), 'imp_exp': vencido}
        access = create_token(self.empleado, 'access', timedelta(hours=1), extra)
        refresh = create_token(self.empleado, 'refresh', timedelta(hours=7), extra)
        self.assertEqual(
            APIClient().get(
                reverse('usuarios:me'), HTTP_AUTHORIZATION=f'Bearer {access}',
            ).status_code,
            401,
        )
        self.assertEqual(
            APIClient().post(
                reverse('usuarios:refresh'), {'refresh': refresh}, format='json',
            ).status_code,
            401,
        )

    def test_la_auditoria_guarda_quien_estaba_realmente_detras(self):
        """Lo hecho impersonando queda a nombre de la cuenta, con el actor anotado."""
        self.empleado.is_staff = True
        self.empleado.save(update_fields=['is_staff'])
        cuerpo = self._impersonar()
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {cuerpo['access']}")
        r = api.post(
            reverse('usuarios_gestion:list'),
            {'username': 'nuevo', 'email': 'nuevo@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        registro = RegistroAuditoria.objects.filter(accion='crear').latest('creado')
        self.assertEqual(registro.usuario_username, 'noe')
        self.assertEqual(registro.actor_username, 'dueno')

    def test_una_sesion_normal_no_lleva_marcas_de_impersonacion(self):
        access = create_token_pair(self.empleado)['access']
        payload = decode_token(access, expected_type='access')
        self.assertNotIn('act', payload)
        self.assertNotIn('imp_exp', payload)
