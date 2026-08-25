from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed


# El access es de vida corta; el front lo renueva con el refresh cuando vence.
# El refresh dura "limite de inactividad (6 h) + vida del access (1 h)": como el
# refresh se rota en cada renovacion, queda una ventana DESLIZANTE: si pasan ~6 h
# sin actividad, el ultimo refresh vence y la sesion muere tambien en el server.
ACCESS_TOKEN_LIFETIME = timedelta(minutes=60)
REFRESH_TOKEN_LIFETIME = timedelta(hours=7)
ALGORITHM = 'HS256'


def create_token(user, token_type: str, lifetime: timedelta, extra: dict | None = None) -> str:
    now = timezone.now()
    payload = {
        'type': token_type,
        'sub': str(user.pk),
        'iat': int(now.timestamp()),
        'exp': int((now + lifetime).timestamp()),
    }
    # `extra` solo lo usa la impersonacion (claims `act` e `imp_exp`); una sesion
    # normal no lleva nada de esto.
    payload.update(extra or {})
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_token_pair(user, extra: dict | None = None) -> dict:
    return {
        'access': create_token(user, 'access', ACCESS_TOKEN_LIFETIME, extra),
        'refresh': create_token(user, 'refresh', REFRESH_TOKEN_LIFETIME, extra),
    }


def claims_impersonacion(payload: dict) -> dict:
    """Las marcas de impersonacion de un token, para arrastrarlas al renovarlo.

    Sin esto, el primer refresh convertiria la sesion impersonada en una sesion
    normal de la cuenta ajena: perderia el rastro del actor Y el limite de 2 h.
    """
    actor = payload.get('act')
    if not actor:
        return {}
    return {'act': str(actor), 'imp_exp': int(payload['imp_exp'])}


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationFailed('El token expiro.') from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationFailed('Token invalido.') from exc

    if payload.get('type') != expected_type:
        raise AuthenticationFailed('Tipo de token invalido.')

    # Sesion impersonada: ademas del `exp` de este token, hay un tope ABSOLUTO
    # para toda la cadena de renovaciones (ver usuarios/impersonacion.py).
    if payload.get('act'):
        limite = payload.get('imp_exp')
        if not limite:
            raise AuthenticationFailed('Token de impersonacion invalido.')
        if timezone.now().timestamp() >= limite:
            raise AuthenticationFailed('La sesion de impersonacion expiro.')
    return payload
