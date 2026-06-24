from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import Usuario
from .tokens import decode_token


# Cada cuenta anota actividad a lo sumo una vez por minuto: aunque haga muchas
# peticiones seguidas, es 1 sola escritura por minuto (no sobrecarga la DB).
INTERVALO_ACTIVIDAD = timedelta(seconds=60)


class JWTAuthentication(BaseAuthentication):
    keyword = 'Bearer'

    def authenticate_header(self, request):
        return self.keyword

    def authenticate(self, request):
        header = get_authorization_header(request).decode('utf-8')
        if not header:
            return None

        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            raise AuthenticationFailed('Header de autenticacion invalido.')

        payload = decode_token(parts[1], expected_type='access')
        user = Usuario.objects.filter(pk=payload.get('sub'), is_active=True).first()
        if user is None:
            raise AuthenticationFailed('Usuario no encontrado o inactivo.')

        self._registrar_actividad(user)
        return (user, payload)

    @staticmethod
    def _registrar_actividad(user):
        """Marca `ultima_actividad`, con throttle de 1 escritura por minuto.

        Usa un UPDATE directo de una sola columna (sin signals ni save()), así es
        barato. Nunca rompe la autenticacion si la escritura falla.
        """
        ahora = timezone.now()
        previa = user.ultima_actividad
        if previa and ahora - previa < INTERVALO_ACTIVIDAD:
            return
        try:
            Usuario.objects.filter(pk=user.pk).update(ultima_actividad=ahora)
            user.ultima_actividad = ahora
        except Exception:
            pass
