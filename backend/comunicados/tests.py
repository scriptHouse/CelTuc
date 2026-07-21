"""Tests de la cartelera: permisos, adjuntos, lecturas y descarga autenticada."""
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from usuarios.models import Rol, Usuario

from .models import Comunicado, LecturaComunicado

MEDIA_TEMPORAL = tempfile.mkdtemp(prefix='celtuc-test-media-')


@override_settings(MEDIA_ROOT=MEDIA_TEMPORAL)
class CarteleraTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            email='adm@celtuc.ar', username='admcart', password='x',
            rol=Rol.objects.get(nombre='Administrador'),
        )
        rol_empleado = Rol.objects.get(nombre='Empleado')
        self.empleado = Usuario.objects.create_user(
            email='emp@celtuc.ar', username='empcart', password='x', rol=rol_empleado,
        )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def _publicar(self, con_archivo=True):
        datos = {'titulo': 'Nuevo horario', 'cuerpo': 'Desde el lunes abrimos 9 a 18.'}
        if con_archivo:
            datos['archivos'] = [
                SimpleUploadedFile('horarios.xlsx', b'contenido-xlsx', content_type='application/vnd.ms-excel'),
                SimpleUploadedFile('foto.png', b'png-bytes', content_type='image/png'),
            ]
        return self._client(self.admin).post(
            reverse('comunicados:comunicado-list'), datos, format='multipart',
        )

    def test_admin_publica_con_archivos(self):
        r = self._publicar()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['titulo'], 'Nuevo horario')
        self.assertEqual(r.data['publicado_por'], 'admcart')
        tipos = {a['nombre']: a['tipo'] for a in r.data['archivos']}
        self.assertEqual(tipos['horarios.xlsx'], 'archivo')
        self.assertEqual(tipos['foto.png'], 'imagen')

    def test_empleado_no_publica_pero_si_lee(self):
        r = self._client(self.empleado).post(
            reverse('comunicados:comunicado-list'), {'titulo': 'Hola'}, format='multipart',
        )
        self.assertEqual(r.status_code, 403)
        self._publicar(con_archivo=False)
        r = self._client(self.empleado).get(reverse('comunicados:comunicado-list'))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertFalse(r.data[0]['leido_por_mi'])

    def test_sin_titulo_es_400(self):
        r = self._client(self.admin).post(
            reverse('comunicados:comunicado-list'), {'cuerpo': 'sin titulo'}, format='multipart',
        )
        self.assertEqual(r.status_code, 400)

    def test_marcar_visto_guarda_fecha_y_es_idempotente(self):
        self._publicar(con_archivo=False)
        comunicado = Comunicado.objects.get()
        url = reverse('comunicados:comunicado-visto', args=[comunicado.id])
        cliente = self._client(self.empleado)

        r = cliente.post(url)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['leido'])
        fecha_primera = r.data['fecha']
        self.assertEqual(r.data['total_lecturas'], 1)

        # Marcar de nuevo no duplica ni cambia la fecha original.
        r = cliente.post(url)
        self.assertEqual(r.data['fecha'], fecha_primera)
        self.assertEqual(LecturaComunicado.objects.count(), 1)

        # El historial muestra quien leyo y cuando.
        r = cliente.get(reverse('comunicados:comunicado-list'))
        self.assertTrue(r.data[0]['leido_por_mi'])
        self.assertEqual(r.data[0]['lecturas'][0]['usuario'], 'empcart')
        self.assertEqual(r.data[0]['lecturas'][0]['fecha'], fecha_primera)

    def test_descarga_autenticada_y_bloqueada_sin_sesion(self):
        r = self._publicar()
        archivo_id = r.data['archivos'][0]['id']
        url = reverse('comunicados:archivo-descarga', args=[archivo_id])

        r = self._client(self.empleado).get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b''.join(r.streaming_content), b'contenido-xlsx')

        self.assertEqual(APIClient().get(url).status_code, 401)

    def test_eliminar_es_borrado_logico(self):
        self._publicar(con_archivo=False)
        comunicado = Comunicado.objects.get()
        r = self._client(self.admin).delete(
            reverse('comunicados:comunicado-detail', args=[comunicado.id]),
        )
        self.assertEqual(r.status_code, 204)
        self.assertEqual(Comunicado.objects.count(), 0)     # oculto
        self.assertEqual(Comunicado.todos.count(), 1)       # pero no se pierde

    def test_archivo_muy_pesado_es_400(self):
        pesado = SimpleUploadedFile('video.mp4', b'x' * (19 * 1024 * 1024 + 1),
                                    content_type='video/mp4')
        r = self._client(self.admin).post(
            reverse('comunicados:comunicado-list'),
            {'titulo': 'Video', 'archivos': [pesado]},
            format='multipart',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('19 MB', r.data['detail'])
