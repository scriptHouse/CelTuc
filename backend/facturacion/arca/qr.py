"""Codigo QR obligatorio de la factura (especificacion de ARCA).

ARCA exige un QR que apunta a ``https://www.afip.gob.ar/fe/qr/?p=<datos>`` donde
``<datos>`` es el JSON del comprobante codificado en base64. Aca armamos esa URL
y, opcionalmente, generamos la imagen PNG (como data URI) para mostrarla.
"""
import base64
import json
from decimal import Decimal


def construir_url(
    *,
    fecha: str,        # 'aaaa-mm-dd'
    cuit_emisor: str,
    punto_venta: int,
    tipo_cbte: int,
    numero: int,
    importe_total: Decimal,
    tipo_doc_receptor: int,
    nro_doc_receptor: str,
    cae: str,
) -> str:
    """Devuelve la URL del QR segun la especificacion de ARCA."""
    datos = {
        'ver': 1,
        'fecha': fecha,
        'cuit': int(cuit_emisor),
        'ptoVta': int(punto_venta),
        'tipoCmp': int(tipo_cbte),
        'nroCmp': int(numero),
        'importe': float(importe_total),
        'moneda': 'PES',
        'ctz': 1,
        'tipoDocRec': int(tipo_doc_receptor),
        'nroDocRec': int(nro_doc_receptor or 0),
        'tipoCodAut': 'E',          # 'E' = CAE
        'codAut': int(cae),
    }
    crudo = json.dumps(datos, separators=(',', ':')).encode('utf-8')
    p = base64.b64encode(crudo).decode('ascii')
    return f'https://www.afip.gob.ar/fe/qr/?p={p}'


def imagen_data_uri(url: str) -> str | None:
    """PNG del QR como data URI (``data:image/png;base64,...``), o None.

    Importa ``qrcode`` perezosamente: si no esta instalado, devuelve None y la
    factura igual queda emitida (el QR se puede regenerar desde ``qr_url``).
    """
    if not url:
        return None
    try:
        import io

        import qrcode
    except ImportError:
        return None

    img = qrcode.make(url)
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    b64 = base64.b64encode(buffer.getvalue()).decode('ascii')
    return f'data:image/png;base64,{b64}'
