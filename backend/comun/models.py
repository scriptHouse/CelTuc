"""Modelos base reutilizables por todas las apps del proyecto.

`ModeloBase` le da a cualquier tabla, sin repetir codigo:

- Auditoria: cuando se creo / edito y que usuario lo hizo.
- Borrado logico: en vez de eliminar la fila, se marca `borrado=True` y se guarda
  la fecha (y quien). Asi no se pierde informacion y todo se puede restaurar.

El manager por defecto (`objects`) OCULTA los registros borrados; `todos` los
incluye (para auditoria o para restaurarlos). Por eso el codigo existente que usa
`Modelo.objects...` deja de ver, sin tocar nada, lo que se borro logicamente.

Nota sobre `creado`/`actualizado`: usan `default=timezone.now` (en vez de
`auto_now_add`/`auto_now`) para que agregar estos campos a tablas que YA tienen
datos no pida un valor a mano al migrar. `actualizado` se refresca en cada
guardado via `save()`.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class ModeloBaseQuerySet(models.QuerySet):
    """QuerySet con operaciones de borrado logico en lote."""

    def borrar(self, usuario=None):
        """Borrado logico en lote (no elimina fisicamente las filas)."""
        return self.update(
            borrado=True,
            fecha_borrado=timezone.now(),
            borrado_por=usuario,
        )

    def restaurar(self):
        """Revierte el borrado logico en lote."""
        return self.update(borrado=False, fecha_borrado=None, borrado_por=None)

    def vivos(self):
        return self.filter(borrado=False)

    def borrados(self):
        return self.filter(borrado=True)


# Manager base con los metodos del queryset disponibles tambien en el manager.
_ManagerBase = models.Manager.from_queryset(ModeloBaseQuerySet)


class ManagerVivos(_ManagerBase):
    """Manager por defecto: oculta los registros borrados logicamente."""

    def get_queryset(self):
        return super().get_queryset().filter(borrado=False)


class ManagerTodos(_ManagerBase):
    """Manager sin filtro: incluye los borrados (auditoria / restauracion)."""


def _fk_usuario(verbose_name):
    """FK opcional al usuario, sin relacion inversa (se repite en cada tabla).

    Usa `related_name='+'` para no ensuciar el modelo Usuario con un accessor
    inverso por cada tabla del sistema (y evitar choques de nombres).
    """
    return models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name=verbose_name,
    )


class ModeloBase(models.Model):
    """Base abstracta con auditoria y borrado logico para todas las tablas."""

    creado = models.DateTimeField('fecha de alta', default=timezone.now, editable=False)
    actualizado = models.DateTimeField('ultima edicion', default=timezone.now, editable=False)
    creado_por = _fk_usuario('creado por')
    actualizado_por = _fk_usuario('ultima edicion por')

    borrado = models.BooleanField('borrado', default=False, db_index=True)
    fecha_borrado = models.DateTimeField('fecha de borrado', null=True, blank=True)
    borrado_por = _fk_usuario('borrado por')

    objects = ManagerVivos()   # por defecto, solo registros vivos
    todos = ManagerTodos()     # incluye los borrados logicamente

    class Meta:
        abstract = True
        ordering = ('-creado',)

    def save(self, *args, **kwargs):
        # Refresca `actualizado` en cada guardado (equivalente a auto_now). Si el
        # guardado limita columnas (`update_fields`), incluimos `actualizado`.
        self.actualizado = timezone.now()
        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = {*update_fields, 'actualizado'}
        super().save(*args, **kwargs)

    def delete(self, using=None, keep_parents=False, *, usuario=None, fisico=False):
        """Borrado logico por defecto. `fisico=True` elimina la fila de verdad.

        Asi un `instance.delete()` normal (incluido el de las vistas DRF) marca el
        registro como borrado en lugar de perderlo. Para borrar de verdad (por
        ejemplo al reemplazar filas hijas) se pasa `fisico=True`.
        """
        if fisico:
            return super().delete(using=using, keep_parents=keep_parents)
        self.borrado = True
        self.fecha_borrado = timezone.now()
        if usuario is not None:
            self.borrado_por = usuario
        self.save(update_fields=['borrado', 'fecha_borrado', 'borrado_por'])
        return (1, {self._meta.label: 1})

    def restaurar(self):
        """Revierte el borrado logico de este registro."""
        self.borrado = False
        self.fecha_borrado = None
        self.borrado_por = None
        self.save(update_fields=['borrado', 'fecha_borrado', 'borrado_por'])
