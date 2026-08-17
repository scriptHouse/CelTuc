"""Candado de acceso: Asistencia es SOLO del superadministrador.

Este test no enumera endpoints a mano: recorre `asistencia.urls` y verifica
TODOS. Si mañana alguien agrega una vista y se olvida de `_BaseGestion`, el
test falla solo. Es la red que hace que la regla no dependa de la memoria.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from empleados.models import Empleado
from inventario.models import Sucursal
from usuarios.models import Rol, Usuario

from . import urls as asistencia_urls
from .models import Agente, Dispositivo

# La API de máquinas vive bajo `agente/` (singular). Ojo: NO alcanza con mirar
# el nombre de la ruta — `agente-regenerar-token` cuelga de `agentes/` (plural)
# y es de gestión: la usa el superadministrador para rotarle el token a un
# agente. Por eso clasificamos por la ruta real, que es la distinción de fondo.
RUTA_API_AGENTES = 'agente/'


def _rutas():
    """(nombre, args, es_api_de_agentes) de cada ruta declarada en la app."""
    for patron in asistencia_urls.urlpatterns:
        ruta = str(patron.pattern)
        args = [1] if '<int:pk>' in ruta else []
        yield patron.name, args, ruta.startswith(RUTA_API_AGENTES)


class SoloSuperadministradorTests(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        # Un administrador "comun": staff + rol admin, pero NO superusuario.
        rol_admin = Rol.objects.create(nombre='Administrador prueba', es_admin=True)
        self.admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123',
            is_staff=True, rol=rol_admin,
        )
        self.empleado_usuario = Usuario.objects.create_user(
            email='empleado@celtuc.test', username='empleado', password='clave123'
        )

        sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=sucursal, nombre='Reloj Salta', host='192.168.1.31'
        )
        agente = Agente(dispositivo=self.dispositivo, nombre='salta-notebook-01')
        self.token_agente = agente.asignar_token()
        agente.save()
        Empleado.objects.create(nombre='Nacho', apellido='Pérez')

    def _cliente(self, usuario=None):
        cliente = APIClient()
        if usuario is not None:
            cliente.force_authenticate(usuario)
        return cliente

    def test_todas_las_rutas_de_gestion_rechazan_al_admin_comun(self):
        """El administrador (staff + rol admin) NO entra a ninguna."""
        cliente = self._cliente(self.admin)
        revisadas = 0
        for nombre, args, es_api_agentes in _rutas():
            if es_api_agentes:
                continue
            url = reverse(f'asistencia:{nombre}', args=args)
            for metodo in ('get', 'post', 'patch', 'delete'):
                respuesta = getattr(cliente, metodo)(url, {}, format='json')
                self.assertEqual(
                    respuesta.status_code, 403,
                    f'{metodo.upper()} {nombre} dejó pasar a un admin común '
                    f'(devolvió {respuesta.status_code})',
                )
            revisadas += 1
        self.assertGreaterEqual(revisadas, 15, 'Se revisaron muy pocas rutas: ¿cambió urls.py?')

    def test_todas_las_rutas_de_gestion_rechazan_al_empleado(self):
        cliente = self._cliente(self.empleado_usuario)
        for nombre, args, es_api_agentes in _rutas():
            if es_api_agentes:
                continue
            respuesta = cliente.get(reverse(f'asistencia:{nombre}', args=args))
            self.assertEqual(respuesta.status_code, 403, nombre)

    def test_todas_las_rutas_de_gestion_rechazan_al_anonimo(self):
        cliente = self._cliente()
        for nombre, args, es_api_agentes in _rutas():
            if es_api_agentes:
                continue
            respuesta = cliente.get(reverse(f'asistencia:{nombre}', args=args))
            self.assertIn(respuesta.status_code, (401, 403), nombre)

    def test_el_superadministrador_entra_a_los_listados(self):
        """Contraprueba: el candado no debe trabar al dueño."""
        cliente = self._cliente(self.superadmin)
        listados = [
            'panel', 'fichadas', 'resumen', 'numeros-sin-mapear',
            'dispositivos', 'agentes', 'mapeos', 'turnos', 'asignaciones', 'licencias',
        ]
        for nombre in listados:
            respuesta = cliente.get(reverse(f'asistencia:{nombre}'))
            self.assertEqual(respuesta.status_code, 200, nombre)

    def test_el_token_de_agente_no_abre_la_gestion(self):
        """Un agente comprometido no puede leer ni tocar la configuración."""
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_agente}')
        for nombre, args, es_api_agentes in _rutas():
            if es_api_agentes:
                continue
            respuesta = cliente.get(reverse(f'asistencia:{nombre}', args=args))
            # 401 (no 403) porque la autenticacion por token expone
            # `WWW-Authenticate`; lo que importa es que NO pasa.
            self.assertIn(respuesta.status_code, (401, 403), nombre)

    def test_ninguna_sesion_de_usuario_abre_la_api_de_agentes(self):
        """Ni siquiera el superadministrador: esa API es solo para máquinas."""
        for usuario in (self.superadmin, self.admin, self.empleado_usuario, None):
            cliente = self._cliente(usuario)
            for nombre, args, es_api_agentes in _rutas():
                if not es_api_agentes:
                    continue
                url = reverse(f'asistencia:{nombre}', args=args)
                respuesta = cliente.post(url, {}, format='json')
                self.assertIn(
                    respuesta.status_code, (401, 403),
                    f'{nombre} aceptó una sesión de usuario ({respuesta.status_code})',
                )
