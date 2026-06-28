"""Cliente SOAP (zeep) con TLS compatible con los servidores de ARCA.

ARCA negocia en el handshake TLS una clave Diffie-Hellman de 1024 bits, que el
OpenSSL moderno (con SECLEVEL=2 por defecto) rechaza con el error
"DH_KEY_TOO_SMALL". Bajamos el nivel de seguridad a SECLEVEL=1 SOLO para las
conexiones a ARCA: se sigue verificando el certificado del servidor; lo unico que
se permite es la clave DH mas corta.

Las dependencias (requests/urllib3/zeep) se importan dentro de las funciones para
no romper la importacion del modulo si aun no estan instaladas.
"""
from functools import lru_cache

from .constantes import TIMEOUT


def _session_afip():
    """Sesion de requests que tolera el TLS viejo de ARCA (SECLEVEL=1)."""
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.ssl_ import create_urllib3_context

    class _AdaptadorAfip(HTTPAdapter):
        def _contexto(self):
            ctx = create_urllib3_context()
            ctx.set_ciphers('DEFAULT@SECLEVEL=1')
            return ctx

        def init_poolmanager(self, *args, **kwargs):
            kwargs['ssl_context'] = self._contexto()
            return super().init_poolmanager(*args, **kwargs)

        def proxy_manager_for(self, *args, **kwargs):
            kwargs['ssl_context'] = self._contexto()
            return super().proxy_manager_for(*args, **kwargs)

    sesion = requests.Session()
    sesion.mount('https://', _AdaptadorAfip())
    return sesion


@lru_cache(maxsize=8)
def cliente(wsdl: str):
    """Cliente zeep cacheado por WSDL, con la sesion TLS compatible con ARCA."""
    import zeep
    from zeep.transports import Transport

    transporte = Transport(session=_session_afip(), timeout=TIMEOUT, operation_timeout=TIMEOUT)
    return zeep.Client(wsdl, transport=transporte)
