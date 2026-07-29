"""WSAA: autenticacion ante ARCA.

Para usar cualquier Web Service de ARCA primero hay que obtener un "Ticket de
Acceso" (TA): se arma un pedido (TRA), se lo firma con el certificado y la clave
privada del emisor en formato CMS/PKCS#7, se lo manda al WSAA y ARCA devuelve un
``token`` y un ``sign`` que valen ~12 h.

Cacheamos el TA en la tabla ``facturacion_tickets_acceso`` para reusarlo: si se
pide uno nuevo teniendo otro vigente, ARCA responde con error.

``cryptography`` se importa dentro de las funciones para que la app se pueda
importar/migrar aunque la libreria todavia no este instalada.
"""
import base64
import xml.etree.ElementTree as ET
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from .constantes import SERVICIO_WSFE, WSAA_WSDL
from .errores import ErrorARCA


def obtener_ta(emisor) -> tuple[str, str]:
    """Devuelve ``(token, sign)`` para el emisor, reusando el TA cacheado.

    El TA de ARCA vale para el **CUIT** (no para el punto de venta): ARCA entrega
    un solo TA por CUIT+servicio y rechaza pedir otro teniendo uno vigente. Por eso,
    si otro emisor con el MISMO CUIT (p. ej. dos puntos de venta de un mismo
    Responsable Inscripto) ya tiene un TA vigente, lo reusamos en vez de re-loguear.
    Si no hay TA vigente (o cambio el ambiente), autentica de nuevo. El login se
    serializa por CUIT (lock de filas) para que dos workers no pidan dos TA a la vez.
    """
    from ..models import Emisor, TicketAcceso

    ta = _ta_vigente_de_cuit(emisor)
    if ta:
        return ta.token, ta.sign

    with transaction.atomic():
        # Lock de TODOS los emisores de este CUIT: serializa el login concurrente,
        # incluidos los otros puntos de venta del mismo contribuyente.
        list(Emisor.objects.select_for_update().filter(cuit=emisor.cuit).order_by('pk'))

        ta = _ta_vigente_de_cuit(emisor)
        if ta:
            return ta.token, ta.sign

        token, sign, expiracion = _login(emisor)
        TicketAcceso.objects.update_or_create(
            emisor=emisor,
            servicio=SERVICIO_WSFE,
            defaults={
                'token': token,
                'sign': sign,
                'expiracion': expiracion,
                'produccion': emisor.produccion,
                'generado': timezone.now(),
            },
        )
        return token, sign


def _ta_vigente_de_cuit(emisor):
    """TA vigente de CUALQUIER emisor con el mismo CUIT y ambiente, o ``None``.

    Compartir el TA entre los puntos de venta de un mismo contribuyente evita el
    error de ARCA "el CEE ya posee un TA valido para el acceso al WSN solicitado".
    """
    from ..models import TicketAcceso

    tas = TicketAcceso.objects.filter(
        emisor__cuit=emisor.cuit,
        servicio=SERVICIO_WSFE,
        produccion=emisor.produccion,
    )
    for ta in tas:
        if ta.vigente():
            return ta
    return None


def _login(emisor) -> tuple[str, str, datetime]:
    """Autentica contra el WSAA y devuelve ``(token, sign, expiracion)``."""
    if not emisor.tiene_credenciales:
        raise ErrorARCA('El emisor no tiene certificado y/o clave privada cargados.')

    tra = _armar_tra(SERVICIO_WSFE)
    cms = _firmar_cms(tra, emisor.certificado, emisor.clave_privada)

    try:
        import zeep
        from zeep.exceptions import Fault
        from zeep.transports import Transport
    except ImportError as exc:
        raise ErrorARCA('Falta instalar la dependencia "zeep" en el backend.') from exc

    wsdl = WSAA_WSDL[bool(emisor.produccion)]
    try:
        cliente = _cliente_wsaa(wsdl)
        respuesta = cliente.service.loginCms(in0=cms)
    except Fault as exc:
        # Caso tipico: ya hay un TA vigente que no teniamos cacheado.
        raise ErrorARCA('ARCA rechazo la autenticacion (WSAA).', detalle=str(exc)) from exc
    except Exception as exc:  # red, TLS, timeout, WSDL caido...
        raise ErrorARCA('No se pudo conectar con el WSAA de ARCA.', detalle=str(exc)) from exc

    return _parsear_respuesta(respuesta)


def _armar_tra(servicio: str) -> str:
    """Arma el XML del pedido de ticket (TRA) con una ventana de +/- 10 min."""
    ahora = timezone.localtime()
    unique_id = int(ahora.timestamp())
    generacion = (ahora - timezone.timedelta(minutes=10)).isoformat()
    expiracion = (ahora + timezone.timedelta(minutes=10)).isoformat()
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<loginTicketRequest version="1.0">'
        '<header>'
        f'<uniqueId>{unique_id}</uniqueId>'
        f'<generationTime>{generacion}</generationTime>'
        f'<expirationTime>{expiracion}</expirationTime>'
        '</header>'
        f'<service>{servicio}</service>'
        '</loginTicketRequest>'
    )


def _firmar_cms(tra: str, certificado_pem: str, clave_pem: str) -> str:
    """Firma el TRA en CMS/PKCS#7 (DER) y lo devuelve en base64."""
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.serialization import (
            load_pem_private_key,
            pkcs7,
        )
        from cryptography.hazmat.primitives.serialization import Encoding
    except ImportError as exc:
        raise ErrorARCA('Falta instalar la dependencia "cryptography" en el backend.') from exc

    try:
        certificado = x509.load_pem_x509_certificate(certificado_pem.encode('utf-8'))
        clave = load_pem_private_key(clave_pem.encode('utf-8'), password=None)
    except Exception as exc:
        raise ErrorARCA(
            'El certificado o la clave privada no son validos (formato PEM).',
            detalle=str(exc),
        ) from exc

    try:
        firmado = (
            pkcs7.PKCS7SignatureBuilder()
            .set_data(tra.encode('utf-8'))
            .add_signer(certificado, clave, hashes.SHA256())
            .sign(Encoding.DER, [pkcs7.PKCS7Options.Binary])
        )
    except Exception as exc:
        raise ErrorARCA('No se pudo firmar el pedido de autenticacion.', detalle=str(exc)) from exc

    return base64.b64encode(firmado).decode('ascii')


def _parsear_respuesta(xml_texto: str) -> tuple[str, str, datetime]:
    """Extrae token, sign y expiracion del loginTicketResponse."""
    try:
        raiz = ET.fromstring(xml_texto)
        token = raiz.findtext('credentials/token')
        sign = raiz.findtext('credentials/sign')
        expiracion_txt = raiz.findtext('header/expirationTime')
        expiracion = datetime.fromisoformat(expiracion_txt)
    except Exception as exc:
        raise ErrorARCA('Respuesta inesperada del WSAA de ARCA.', detalle=str(exc)) from exc

    if not token or not sign:
        raise ErrorARCA('El WSAA no devolvio token/sign.')
    return token, sign, expiracion


def _cliente_wsaa(wsdl: str):
    """Cliente zeep del WSAA, con TLS compatible con ARCA y cacheado (ver arca.soap)."""
    from .soap import cliente
    return cliente(wsdl)
