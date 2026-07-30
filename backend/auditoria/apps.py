from django.apps import AppConfig


class AuditoriaConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'auditoria'
    verbose_name = 'Auditoria'

    def ready(self):
        # Conecta las señales sobre los modelos vigilados (ver registro.AUDITADOS).
        from . import registro
        registro.conectar()
