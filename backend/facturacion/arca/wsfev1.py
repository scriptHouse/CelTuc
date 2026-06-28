"""WSFEv1: facturacion electronica de ARCA.

Tres operaciones que usamos:

- ``FEDummy``: estado de los servidores de ARCA (no requiere autenticacion).
- ``FECompUltimoAutorizado``: ultimo numero autorizado para (punto de venta, tipo).
- ``FECAESolicitar``: solicita el CAE de un comprobante y lo autoriza.

Todas (salvo FEDummy) reciben el ``Auth`` con el token/sign del WSAA mas el CUIT.
"""
from .constantes import WSFEV1_WSDL
from .errores import ErrorARCA


def estado_servidor(produccion: bool) -> dict:
    """Estado de ARCA (FEDummy): app, base de datos y autenticacion."""
    try:
        cliente = _cliente(produccion)
        r = cliente.service.FEDummy()
    except Exception as exc:
        raise ErrorARCA('No se pudo conectar con el WSFEv1 de ARCA.', detalle=str(exc)) from exc
    return {
        'app': getattr(r, 'AppServer', None),
        'base': getattr(r, 'DbServer', None),
        'auth': getattr(r, 'AuthServer', None),
    }


def ultimo_autorizado(produccion, cuit, token, sign, punto_venta, cbte_tipo) -> int:
    """Ultimo numero autorizado para ese punto de venta y tipo (0 si no hay)."""
    try:
        cliente = _cliente(produccion)
        r = cliente.service.FECompUltimoAutorizado(
            Auth=_auth(cuit, token, sign),
            PtoVta=int(punto_venta),
            CbteTipo=int(cbte_tipo),
        )
    except Exception as exc:
        raise ErrorARCA('No se pudo consultar el ultimo comprobante en ARCA.', detalle=str(exc)) from exc
    _chequear_errores(r)
    return int(getattr(r, 'CbteNro', 0) or 0)


def solicitar_cae(produccion, cuit, token, sign, punto_venta, cbte_tipo, detalle) -> dict:
    """Solicita el CAE de un comprobante. Lanza ErrorARCA si ARCA lo rechaza."""
    pedido = {
        'FeCabReq': {
            'CantReg': 1,
            'PtoVta': int(punto_venta),
            'CbteTipo': int(cbte_tipo),
        },
        'FeDetReq': {'FECAEDetRequest': [detalle]},
    }
    try:
        cliente = _cliente(produccion)
        r = cliente.service.FECAESolicitar(Auth=_auth(cuit, token, sign), FeCAEReq=pedido)
    except Exception as exc:
        raise ErrorARCA('No se pudo solicitar el CAE a ARCA.', detalle=str(exc)) from exc

    _chequear_errores(r)

    detalles = getattr(getattr(r, 'FeDetResp', None), 'FECAEDetResponse', None) or []
    if not detalles:
        raise ErrorARCA('ARCA no devolvio el detalle del comprobante.')
    resp = detalles[0]

    resultado = getattr(resp, 'Resultado', None)
    if resultado != 'A':
        raise ErrorARCA(
            'ARCA rechazo el comprobante.',
            detalle=_texto_observaciones(resp) or f'Resultado: {resultado}',
        )

    return {
        'cae': str(resp.CAE),
        'cae_vencimiento': str(resp.CAEFchVto),   # 'aaaammdd'
        'numero': int(resp.CbteDesde),
        'resultado': resultado,
        'observaciones': _texto_observaciones(resp),
    }


# --- Auxiliares --------------------------------------------------------------

def _auth(cuit, token, sign) -> dict:
    return {'Token': token, 'Sign': sign, 'Cuit': int(cuit)}


def _chequear_errores(respuesta):
    """Lanza ErrorARCA si la respuesta trae errores de negocio."""
    errores = getattr(respuesta, 'Errors', None)
    lista = getattr(errores, 'Err', None) if errores else None
    if lista:
        mensajes = '; '.join(f'{e.Code}: {e.Msg}' for e in lista)
        raise ErrorARCA('ARCA devolvio errores.', detalle=mensajes)


def _texto_observaciones(resp) -> str:
    observaciones = getattr(resp, 'Observaciones', None)
    lista = getattr(observaciones, 'Obs', None) if observaciones else None
    if not lista:
        return ''
    return '; '.join(f'{o.Code}: {o.Msg}' for o in lista)


def _cliente(produccion: bool):
    """Cliente zeep del WSFEv1, con TLS compatible con ARCA y cacheado (ver arca.soap)."""
    from .soap import cliente
    return cliente(WSFEV1_WSDL[bool(produccion)])
