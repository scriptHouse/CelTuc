"""Cartelera de comunicacion interna (se muestra en el Panel).

Tres tablas, todas heredando de ``ModeloBase`` (auditoria + borrado logico, asi
el historial nunca pierde informacion):

- ``comunicados`` -> :class:`Comunicado`: el mensaje que publica un
  administrador. Solo los administradores escriben; todos los usuarios lo ven.
- ``comunicados_archivos`` -> :class:`ArchivoComunicado`: los adjuntos del
  mensaje (imagenes, videos, planillas, lo que haga falta). Se sirven por un
  endpoint AUTENTICADO (no hay URL publica de media).
- ``comunicados_lecturas`` -> :class:`LecturaComunicado`: quien marco el
  mensaje como visto; el ``creado`` de ModeloBase es la fecha y hora exacta de
  la lectura.
"""
from django.conf import settings
from django.db import models

from comun.models import ModeloBase


def ruta_adjunto(instance, filename):
    """Los adjuntos se agrupan por comunicado: media/comunicados/<id>/<archivo>."""
    return f'comunicados/{instance.comunicado_id}/{filename}'


class Comunicado(ModeloBase):
    """Un mensaje de la cartelera. ``creado_por`` es quien lo publico."""

    titulo = models.CharField('titulo', max_length=160)
    cuerpo = models.TextField('cuerpo', blank=True)
    fijado = models.BooleanField(
        'fijado', default=False,
        help_text='Un comunicado fijado queda arriba de la cartelera.',
    )

    class Meta:
        db_table = 'comunicados'
        verbose_name = 'comunicado'
        verbose_name_plural = 'comunicados'
        ordering = ('-fijado', '-creado', '-id')

    def __str__(self):
        return self.titulo


class ArchivoComunicado(ModeloBase):
    """Un adjunto de un comunicado. El ``tipo`` se infiere del content-type al
    subirlo y le dice al front como mostrarlo (imagen inline, video, o chip de
    descarga para planillas/PDF/lo demas)."""

    class Tipo(models.TextChoices):
        IMAGEN = 'imagen', 'Imagen'
        VIDEO = 'video', 'Video'
        ARCHIVO = 'archivo', 'Archivo'

    comunicado = models.ForeignKey(
        Comunicado,
        on_delete=models.CASCADE,
        related_name='archivos',
        verbose_name='comunicado',
    )
    archivo = models.FileField('archivo', upload_to=ruta_adjunto, max_length=300)
    nombre = models.CharField('nombre original', max_length=200)
    tipo = models.CharField(
        'tipo', max_length=10, choices=Tipo.choices, default=Tipo.ARCHIVO,
    )
    content_type = models.CharField('content type', max_length=100, blank=True)
    tamanio = models.PositiveBigIntegerField('tamaño (bytes)', default=0)

    class Meta:
        db_table = 'comunicados_archivos'
        verbose_name = 'archivo de comunicado'
        verbose_name_plural = 'archivos de comunicados'
        ordering = ('id',)

    def __str__(self):
        return self.nombre


class LecturaComunicado(ModeloBase):
    """Constancia de lectura: el usuario marco el comunicado como visto.

    La fecha y hora de la lectura es el ``creado`` de ModeloBase. Una sola
    lectura viva por usuario y comunicado (marcar de nuevo es idempotente).
    """

    comunicado = models.ForeignKey(
        Comunicado,
        on_delete=models.CASCADE,
        related_name='lecturas',
        verbose_name='comunicado',
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='+',
        verbose_name='usuario',
    )

    class Meta:
        db_table = 'comunicados_lecturas'
        verbose_name = 'lectura de comunicado'
        verbose_name_plural = 'lecturas de comunicados'
        ordering = ('creado', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=('comunicado', 'usuario'),
                condition=models.Q(borrado=False),
                name='uniq_lectura_comunicado_usuario_viva',
            ),
        ]

    def __str__(self):
        return f'{self.usuario} leyo "{self.comunicado}" ({self.creado:%d/%m %H:%M})'
