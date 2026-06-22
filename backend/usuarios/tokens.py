from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed


ACCESS_TOKEN_LIFETIME = timedelta(minutes=60)
REFRESH_TOKEN_LIFETIME = timedelta(days=7)
ALGORITHM = 'HS256'


def create_token(user, token_type: str, lifetime: timedelta) -> str:
    now = timezone.now()
    payload = {
        'type': token_type,
        'sub': str(user.pk),
        'iat': int(now.timestamp()),
        'exp': int((now + lifetime).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_token_pair(user) -> dict:
    return {
        'access': create_token(user, 'access', ACCESS_TOKEN_LIFETIME),
        'refresh': create_token(user, 'refresh', REFRESH_TOKEN_LIFETIME),
    }


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationFailed('El token expiro.') from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationFailed('Token invalido.') from exc

    if payload.get('type') != expected_type:
        raise AuthenticationFailed('Tipo de token invalido.')
    return payload
