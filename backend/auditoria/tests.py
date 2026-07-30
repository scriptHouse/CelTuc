"""Tests del historial de auditoria.

Cubren dos cosas: el ACCESO (el endpoint es solo del superadministrador) y la
ESCRITURA automatica (las acciones de la API dejan registro con su antes y
despues, sin ruido de infraestructura).
"""
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from usuarios.models import Rol, Usuario

from .models import RegistroAuditoria
from .registro import MASCARA


class AccesoAuditoriaTests(TestCase):
    """El historial es SOLO del superadministrador: ni un admin comun lo ve."""

    def setUp(self):
        cache.clear()
        self.url = reverse('auditoria:list')

    def test_requiere_autenticacion(self):
        self.assertEqual(APIClient().get(self.url).status_code, 401)

    def test_admin_comun_no_accede(self):
        admin = Usuario.objects.create_user(
            email='a@celtuc.ar', username='adminc', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )
        client = APIClient()
        client.force_authenticate(admin)
        self.assertEqual(client.get(self.url).status_code, 403)

    def test_usuario_regular_no_accede(self):
        regular = Usuario.objects.create_user(
            email='r@celtuc.ar', username='regular', password='x',
        )
        client = APIClient()
        client.force_authenticate(regular)
        self.assertEqual(client.get(self.url).status_code, 403)

    def test_superadmin_accede(self):
        sup = Usuario.objects.create_superuser(
            email='s@celtuc.ar', username='sup', password='x',
        )
        client = APIClient()
        client.force_authenticate(sup)
        r = client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertIn('resultados', r.data)
        self.assertIn('resumen', r.data)


class EscrituraAuditoriaTests(TestCase):
    """Las acciones de la API dejan su registro con quien, que y los cambios."""

    def setUp(self):
        cache.clear()
        self.sup = Usuario.objects.create_superuser(
            email='sup@celtuc.ar', username='sup', password='clave-segura-123',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.sup)

    def test_crear_usuario_queda_registrado(self):
        r = self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'vendedor', 'email': 'v@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        reg = RegistroAuditoria.objects.get(accion='crear', modelo='usuario')
        self.assertEqual(reg.usuario_username, 'sup')
        self.assertEqual(reg.objeto, 'vendedor')
        self.assertEqual(reg.app, 'usuarios')

    def test_editar_usuario_guarda_antes_y_despues(self):
        objetivo = Usuario.objects.create_user(
            email='viejo@celtuc.ar', username='objetivo', password='x',
        )
        r = self.client.patch(
            reverse('usuarios_gestion:detail', args=[objetivo.id]),
            {'email': 'nuevo@celtuc.ar'}, format='json',
        )
        self.assertEqual(r.status_code, 200)
        reg = RegistroAuditoria.objects.get(accion='editar')
        self.assertIn(
            {'antes': 'viejo@celtuc.ar', 'despues': 'nuevo@celtuc.ar'},
            list(reg.cambios.values()),
        )

    def test_cambio_de_password_queda_enmascarado(self):
        objetivo = Usuario.objects.create_user(
            email='o@celtuc.ar', username='objetivo', password='vieja-clave',
        )
        self.client.patch(
            reverse('usuarios_gestion:detail', args=[objetivo.id]),
            {'password': 'nueva-clave-123'}, format='json',
        )
        reg = RegistroAuditoria.objects.get(accion='editar')
        self.assertIn({'antes': MASCARA, 'despues': MASCARA}, list(reg.cambios.values()))

    def test_eliminar_usuario_queda_registrado(self):
        objetivo = Usuario.objects.create_user(
            email='o@celtuc.ar', username='objetivo', password='x',
        )
        self.client.delete(reverse('usuarios_gestion:detail', args=[objetivo.id]))
        reg = RegistroAuditoria.objects.get(accion='eliminar')
        self.assertEqual(reg.objeto, 'objetivo')

    def test_login_queda_registrado_como_ingreso(self):
        APIClient().post(
            reverse('usuarios:login'),
            {'identifier': 'sup', 'password': 'clave-segura-123'},
            format='json',
        )
        reg = RegistroAuditoria.objects.get(accion='ingreso')
        self.assertEqual(reg.usuario_username, 'sup')
        self.assertEqual(reg.modelo, 'sesion')

    def test_lecturas_y_heartbeat_no_generan_registros(self):
        self.client.get(reverse('usuarios_gestion:list'))
        self.client.post(reverse('usuarios:heartbeat'))
        self.assertEqual(RegistroAuditoria.objects.count(), 0)

    def test_alta_seguida_de_retoques_es_un_solo_registro(self):
        # Crear cuenta + empleado en el mismo request: un registro por objeto
        # nuevo, sin "ediciones" fantasma por los retoques posteriores al alta.
        self.client.post(
            reverse('usuarios_gestion:list'),
            {
                'username': 'conempleado', 'email': 'ce@celtuc.ar', 'password': 'clave-123',
                'empleado': {'nombre': 'Caro', 'apellido': 'Diaz'},
            },
            format='json',
        )
        self.assertEqual(RegistroAuditoria.objects.filter(accion='editar').count(), 0)
        self.assertEqual(RegistroAuditoria.objects.filter(accion='crear').count(), 2)

    def test_cambiar_permisos_de_rol_registra_la_lista(self):
        rol = Rol.objects.create(nombre='Cajero')
        RegistroAuditoria.objects.all().delete()  # solo interesa el cambio M2M
        r = self.client.patch(
            reverse('roles:detail', args=[rol.id]),
            {'permisos': ['ver_panel']}, format='json',
        )
        self.assertEqual(r.status_code, 200)
        reg = RegistroAuditoria.objects.get(accion='editar', modelo='rol')
        self.assertIn('permisos', reg.cambios)
        self.assertEqual(reg.cambios['permisos']['antes'], [])
        self.assertEqual(len(reg.cambios['permisos']['despues']), 1)

    def test_filtros_por_accion_y_usuario(self):
        self.client.post(
            reverse('usuarios_gestion:list'),
            {'username': 'uno', 'email': 'u@celtuc.ar', 'password': 'clave-123'},
            format='json',
        )
        url = reverse('auditoria:list')
        por_accion = self.client.get(url, {'accion': 'crear'}).data
        self.assertEqual(por_accion['total'], 1)
        vacio = self.client.get(url, {'usuario': 'nadie'}).data
        self.assertEqual(vacio['total'], 0)
        por_usuario = self.client.get(url, {'usuario': 'sup'}).data
        self.assertEqual(por_usuario['total'], 1)
