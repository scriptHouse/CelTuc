from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import Usuario
from .tokens import decode_token


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

        return (user, payload)
