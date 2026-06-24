"""Mixins reutilizables para vistas DRF que trabajan sobre modelos `ModeloBase`."""


class AuditoriaMixin:
    """Rellena la auditoria de `ModeloBase` con el usuario de la peticion.

    - Al crear: setea `creado_por` y `actualizado_por`.
    - Al editar: actualiza `actualizado_por`.
    - Al borrar: hace borrado logico registrando `borrado_por`.

    Pensado para vistas basadas en `rest_framework.generics`.
    """

    def _usuario_actual(self):
        usuario = getattr(self.request, 'user', None)
        return usuario if (usuario is not None and usuario.is_authenticated) else None

    def perform_create(self, serializer):
        usuario = self._usuario_actual()
        serializer.save(creado_por=usuario, actualizado_por=usuario)

    def perform_update(self, serializer):
        serializer.save(actualizado_por=self._usuario_actual())

    def perform_destroy(self, instance):
        instance.delete(usuario=self._usuario_actual())
