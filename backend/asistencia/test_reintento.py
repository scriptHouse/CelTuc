"""El botón «reintentar la conexión» del panel, del lado del servidor.

CelTuc no puede probar el reloj: está en la LAN de la sucursal y solo la
notebook lo alcanza. Lo único que puede hacer el servidor es dejar una marca de
tiempo que viaja en la config del heartbeat; el agente la ve y reintenta.

Lo que se cuida acá es que esa marca efectivamente llegue al agente (o sea, que
cambie la versión de la config, porque si no el agente ni se entera) y que no
rompa a un agente viejo que no la conoce.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from inventario.models import Sucursal
from usuarios.models import Usuario

from .models import Agente, Dispositivo


class ReintentarConexionTests(TestCase):
    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=self.sucursal, nombre='Reloj Salta', host='192.168.1.31'
        )

    def _agente(self, *, en_linea=True, nombre='salta-notebook-01'):
        agente = Agente(dispositivo=self.dispositivo, nombre=nombre)
        agente.asignar_token()
        if en_linea:
            agente.ultimo_heartbeat = timezone.now()
        agente.save()
        return agente

    def _reintentar(self):
        return self.cliente.post(
            reverse('asistencia:dispositivo-reintentar', args=[self.dispositivo.id])
        )

    # --- Lo básico ---------------------------------------------------------

    def test_deja_la_marca_de_tiempo(self):
        self._agente()
        antes = timezone.now()

        respuesta = self._reintentar()

        self.assertEqual(respuesta.status_code, 200)
        self.dispositivo.refresh_from_db()
        self.assertIsNotNone(self.dispositivo.reintento_pedido)
        self.assertGreaterEqual(self.dispositivo.reintento_pedido, antes)

    def test_la_marca_viaja_en_la_config_del_agente(self):
        agente = self._agente()
        self._reintentar()
        self.dispositivo.refresh_from_db()

        config = Agente.objects.get(pk=agente.pk).config_remota()

        self.assertEqual(
            config['reintento_pedido'],
            int(self.dispositivo.reintento_pedido.timestamp()),
        )

    def test_sin_pedidos_la_marca_es_cero(self):
        """Un reloj recién creado no tiene que arrastrar ningún pedido."""
        agente = self._agente()
        self.assertEqual(agente.config_remota()['reintento_pedido'], 0)

    def test_la_config_que_baja_al_agente_cambia(self):
        """Es lo que hace que el botón sirva para algo.

        El agente compara la config recibida contra la que tenía y solo la
        aplica si es distinta. Si el pedido no cambiara el payload, el agente
        ni se enteraría de que le apretaron el botón.

        Ojo con la `version`: es el segundo del último cambio, así que dos
        pedidos dentro del mismo segundo la dejan igual. Lo que salva el caso
        es que el agente compara el diccionario ENTERO, y ahí la marca de
        tiempo del pedido siempre difiere.
        """
        agente = self._agente()
        antes = agente.config_remota()

        self._reintentar()
        despues = Agente.objects.get(pk=agente.pk).config_remota()

        self.assertNotEqual(antes, despues, 'el agente no vería ninguna diferencia')
        self.assertNotEqual(antes['reintento_pedido'], despues['reintento_pedido'])

    def test_dos_pedidos_seguidos_se_distinguen(self):
        """Apretar dos veces tiene que verse como dos pedidos, no como uno."""
        agente = self._agente()

        self._reintentar()
        primero = Agente.objects.get(pk=agente.pk).config_remota()['reintento_pedido']

        Dispositivo.objects.filter(pk=self.dispositivo.pk).update(
            reintento_pedido=timezone.now() - timedelta(minutes=5)
        )
        self._reintentar()
        segundo = Agente.objects.get(pk=agente.pk).config_remota()['reintento_pedido']

        self.assertGreater(segundo, primero - 1)

    def test_la_marca_va_suelta_y_no_adentro_de_device(self):
        """El agente filtra `device` por claves conocidas y descartaría una nueva.

        Yendo suelta, un agente viejo la ignora sin romperse y uno nuevo la usa.
        """
        agente = self._agente()
        self._reintentar()
        config = Agente.objects.get(pk=agente.pk).config_remota()

        self.assertIn('reintento_pedido', config)
        self.assertNotIn('reintento_pedido', config['device'])

    # --- Lo que le contesta a quien apretó el botón ------------------------

    def test_avisa_cuando_la_notebook_esta_reportando(self):
        self._agente(en_linea=True)
        datos = self._reintentar().data

        self.assertTrue(datos['hay_agente_en_linea'])
        self.assertIn('segundos', datos['detalle'])

    def test_avisa_cuando_la_notebook_esta_apagada(self):
        """No hay que prometer que va a pasar ya: la notebook puede estar apagada."""
        agente = self._agente(en_linea=False)
        agente.ultimo_heartbeat = timezone.now() - timedelta(hours=3)
        agente.save()

        datos = self._reintentar().data

        self.assertFalse(datos['hay_agente_en_linea'])
        self.assertIn('prenderse', datos['detalle'])

    def test_avisa_cuando_el_reloj_no_tiene_agente(self):
        datos = self._reintentar().data

        self.assertFalse(datos['hay_agente_en_linea'])
        self.assertIn('agente', datos['detalle'])

    def test_el_pedido_queda_guardado_aunque_no_haya_nadie_escuchando(self):
        """Se aplica solo cuando la notebook vuelva: no se pierde el pedido."""
        self._reintentar()

        self.dispositivo.refresh_from_db()
        self.assertIsNotNone(self.dispositivo.reintento_pedido)

    # --- Bordes ------------------------------------------------------------

    def test_el_panel_muestra_el_ultimo_pedido(self):
        self._agente()
        self._reintentar()

        panel = self.cliente.get(reverse('asistencia:panel')).data
        fila = next(d for d in panel['dispositivos'] if d['id'] == self.dispositivo.id)

        self.assertIsNotNone(fila['reintento_pedido'])

    def test_un_reloj_inexistente_da_404(self):
        respuesta = self.cliente.post(
            reverse('asistencia:dispositivo-reintentar', args=[99999])
        )
        self.assertEqual(respuesta.status_code, 404)

    def test_solo_superadmin(self):
        admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)

        respuesta = cliente.post(
            reverse('asistencia:dispositivo-reintentar', args=[self.dispositivo.id])
        )

        self.assertEqual(respuesta.status_code, 403)
        self.dispositivo.refresh_from_db()
        self.assertIsNone(self.dispositivo.reintento_pedido)


class RelojBloqueadoTests(TestCase):
    """El reloj bloqueado NO se puede apurar, y el panel no debe ofrecerlo.

    Esto se agrego despues de romperlo en produccion: el boton desperto al
    agente mientras el reloj estaba bloqueado, el reloj rechazo el intento y
    REINICIO su contador de 30 minutos. Se cierra por dos lados —el servidor no
    guarda el pedido y el agente lo ignoraria igual— porque el costo del error
    es media hora de sucursal sin fichar.
    """

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=self.sucursal, nombre='Reloj Salta', host='192.168.1.31'
        )
        self.agente = Agente(dispositivo=self.dispositivo, nombre='salta-notebook-01')
        self.agente.asignar_token()
        self.agente.ultimo_heartbeat = timezone.now()
        self.agente.save()

    def _bloquear(self, minutos=30):
        self.agente.reloj_alcanzable = False
        self.agente.reloj_bloqueado_hasta = timezone.now() + timedelta(minutes=minutos)
        self.agente.save()

    def _reintentar(self):
        return self.cliente.post(
            reverse('asistencia:dispositivo-reintentar', args=[self.dispositivo.id])
        )

    def test_durante_el_bloqueo_el_pedido_no_se_guarda(self):
        self._bloquear()

        respuesta = self._reintentar()

        self.assertEqual(respuesta.status_code, 409)
        self.assertTrue(respuesta.data['bloqueado'])
        self.dispositivo.refresh_from_db()
        self.assertIsNone(
            self.dispositivo.reintento_pedido,
            'se guardo el pedido: el agente reintentaria y alargaria el bloqueo',
        )

    def test_explica_por_que_no_y_cuanto_falta(self):
        self._bloquear(minutos=12)

        datos = self._reintentar().data

        self.assertIn('reinicia', datos['detalle'])
        self.assertGreater(datos['segundos_de_bloqueo'], 60)

    def test_cuando_se_libera_el_boton_vuelve_a_funcionar(self):
        self.agente.reloj_bloqueado_hasta = timezone.now() - timedelta(minutes=1)
        self.agente.save()

        respuesta = self._reintentar()

        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(respuesta.data['bloqueado'])
        self.dispositivo.refresh_from_db()
        self.assertIsNotNone(self.dispositivo.reintento_pedido)

    def test_el_panel_avisa_del_bloqueo(self):
        self._bloquear()

        panel = self.cliente.get(reverse('asistencia:panel')).data
        fila = next(d for d in panel['dispositivos'] if d['id'] == self.dispositivo.id)

        self.assertTrue(fila['reloj_bloqueado'])
        self.assertGreater(fila['segundos_de_bloqueo'], 0)

    def test_sin_bloqueo_el_panel_no_lo_reporta(self):
        panel = self.cliente.get(reverse('asistencia:panel')).data
        fila = next(d for d in panel['dispositivos'] if d['id'] == self.dispositivo.id)

        self.assertFalse(fila['reloj_bloqueado'])
        self.assertEqual(fila['segundos_de_bloqueo'], 0)

    def test_el_heartbeat_guarda_el_bloqueo_que_informa_el_agente(self):
        cliente = APIClient()
        token = self.agente.asignar_token()
        self.agente.save()
        cliente.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        cliente.post(reverse('asistencia:agente-heartbeat'), {
            'device_reachable': False,
            'device_error': 'El reloj bloqueo el acceso',
            'device_locked_seconds': 1500,
        }, format='json')

        self.agente.refresh_from_db()
        self.assertTrue(self.agente.reloj_bloqueado)
        self.assertGreater(self.agente.segundos_de_bloqueo, 1400)

    def test_un_agente_viejo_que_no_manda_el_dato_sigue_latiendo(self):
        """Compatibilidad: el campo es opcional a proposito."""
        cliente = APIClient()
        token = self.agente.asignar_token()
        self.agente.save()
        cliente.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        respuesta = cliente.post(reverse('asistencia:agente-heartbeat'), {
            'device_reachable': False,
            'device_error': 'algo paso',
        }, format='json')

        self.assertEqual(respuesta.status_code, 200)
        self.agente.refresh_from_db()
        self.assertFalse(self.agente.reloj_bloqueado)

    def test_cuando_el_reloj_vuelve_el_bloqueo_se_limpia(self):
        self._bloquear()
        cliente = APIClient()
        token = self.agente.asignar_token()
        self.agente.save()
        cliente.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        cliente.post(reverse('asistencia:agente-heartbeat'), {
            'device_reachable': True,
            'device_locked_seconds': None,
        }, format='json')

        self.agente.refresh_from_db()
        self.assertFalse(self.agente.reloj_bloqueado)
