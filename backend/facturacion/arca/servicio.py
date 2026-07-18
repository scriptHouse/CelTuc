"""Orquestacion de la facturacion: une logica fiscal + WSAA + WSFEv1 + base.

``emitir`` es el punto de entrada: valida, calcula totales, autentica, pide el
numero, solicita el CAE y, recien si ARCA aprueba, guarda el comprobante.
``probar_conexion`` valida credenciales sin emitir nada.
"""
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from ..logica import calcular_totales, tipo_comprobante
from . import qr, wsaa, wsfev1
from .constantes import COND_IVA_RECEPTOR, DOC_TIPO, IVA_ALICUOTA_ID, TIPO_CBTE
from .errores import ErrorARCA


def emitir(emisor, datos: dict, usuario=None):
    """Emite un comprobante para ``emisor`` y lo devuelve ya guardado (con CAE).

    ``datos`` (ya validado por el serializer) trae: cliente_nombre,
    cliente_doc_tipo, cliente_doc_numero, cliente_condicion, concepto, fecha,
    vencimiento, alicuota_iva, observaciones, estado_cobro e items.
    """
    from ..models import Comprobante, Emisor, ItemComprobante

    if not emisor.activo:
        raise ErrorARCA('El emisor esta inactivo.')
    if not emisor.tiene_credenciales:
        raise ErrorARCA('El emisor no tiene certificado y/o clave privada cargados.')

    items = datos['items']
    if not items:
        raise ErrorARCA('El comprobante necesita al menos un item.')

    tipo = tipo_comprobante(emisor.condicion, datos['cliente_condicion'])

    doc_tipo = datos['cliente_doc_tipo']
    doc_numero = (datos.get('cliente_doc_numero') or '').strip()
    if tipo == 'A' and (doc_tipo != 'CUIT' or not doc_numero):
        raise ErrorARCA('La Factura A requiere un cliente Responsable Inscripto con CUIT.')

    concepto = int(datos.get('concepto') or 1)
    alicuota = Decimal(str(datos.get('alicuota_iva') or '21'))
    totales = calcular_totales(items, tipo, alicuota)
    if totales['total'] <= 0:
        raise ErrorARCA('El total del comprobante debe ser mayor a cero.')

    fecha = datos.get('fecha') or timezone.localdate()
    cbte_tipo = TIPO_CBTE[tipo]

    with transaction.atomic():
        # Lock del emisor: serializa la numeracion (ultimo + 1) entre pedidos.
        emisor = Emisor.objects.select_for_update().get(pk=emisor.pk)

        token, sign = wsaa.obtener_ta(emisor)
        ultimo = wsfev1.ultimo_autorizado(
            emisor.produccion, emisor.cuit, token, sign, emisor.punto_venta, cbte_tipo,
        )
        numero = ultimo + 1

        detalle = _construir_detalle(
            tipo=tipo, concepto=concepto, doc_tipo=doc_tipo, doc_numero=doc_numero,
            numero=numero, fecha=fecha, vencimiento=datos.get('vencimiento'),
            totales=totales, alicuota=alicuota, cliente_condicion=datos['cliente_condicion'],
        )
        resultado = wsfev1.solicitar_cae(
            emisor.produccion, emisor.cuit, token, sign, emisor.punto_venta, cbte_tipo, detalle,
        )

        cae_vto = datetime.strptime(resultado['cae_vencimiento'], '%Y%m%d').date()
        url_qr = qr.construir_url(
            fecha=fecha.isoformat(),
            cuit_emisor=emisor.cuit,
            punto_venta=emisor.punto_venta,
            tipo_cbte=cbte_tipo,
            numero=resultado['numero'],
            importe_total=totales['total'],
            tipo_doc_receptor=DOC_TIPO[doc_tipo],
            nro_doc_receptor=doc_numero,
            cae=resultado['cae'],
        )

        comprobante = Comprobante.objects.create(
            emisor=emisor,
            tipo=tipo,
            concepto=concepto,
            punto_venta=emisor.punto_venta,
            numero=resultado['numero'],
            cliente_nombre=datos['cliente_nombre'].strip(),
            cliente_doc_tipo=doc_tipo,
            cliente_doc_numero=doc_numero,
            cliente_condicion=datos['cliente_condicion'],
            cliente_telefono=(datos.get('cliente_telefono') or '').strip(),
            fecha=fecha,
            vencimiento=datos.get('vencimiento'),
            alicuota_iva=alicuota,
            neto=totales['neto'],
            iva=totales['iva'],
            total=totales['total'],
            cae=resultado['cae'],
            cae_vencimiento=cae_vto,
            qr_url=url_qr,
            respuesta_afip={
                'resultado': resultado['resultado'],
                'cae': resultado['cae'],
                'cae_vencimiento': resultado['cae_vencimiento'],
                'observaciones': resultado['observaciones'],
            },
            estado_cobro=datos.get('estado_cobro') or 'pendiente',
            observaciones=(datos.get('observaciones') or '').strip(),
            creado_por=usuario,
            actualizado_por=usuario,
        )
        ItemComprobante.objects.bulk_create([
            ItemComprobante(
                comprobante=comprobante,
                descripcion=item['descripcion'].strip(),
                cantidad=item['cantidad'],
                precio_unitario=item['precio_unitario'],
            )
            for item in items
        ])

    return comprobante


def probar_conexion(emisor) -> dict:
    """Valida conexion y credenciales contra ARCA sin emitir nada."""
    resultado = {
        'servidor': None,
        'autenticacion': None,
        'ultimo_numero': None,
        'ok': False,
        'mensaje': '',
    }
    try:
        resultado['servidor'] = wsfev1.estado_servidor(emisor.produccion)
    except ErrorARCA as exc:
        resultado['mensaje'] = str(exc)
        return resultado

    if not emisor.tiene_credenciales:
        resultado['mensaje'] = 'Falta cargar el certificado y la clave privada para autenticar.'
        return resultado

    try:
        token, sign = wsaa.obtener_ta(emisor)
        resultado['autenticacion'] = 'OK'
        tipo = 'C' if emisor.condicion == 'monotributista' else 'B'
        resultado['ultimo_numero'] = wsfev1.ultimo_autorizado(
            emisor.produccion, emisor.cuit, token, sign, emisor.punto_venta, TIPO_CBTE[tipo],
        )
        resultado['ok'] = True
        resultado['mensaje'] = 'Conexion y credenciales correctas.'
    except ErrorARCA as exc:
        resultado['mensaje'] = str(exc)
    return resultado


def _construir_detalle(*, tipo, concepto, doc_tipo, doc_numero, numero, fecha,
                       vencimiento, totales, alicuota, cliente_condicion) -> dict:
    """Arma el FECAEDetRequest que espera el WSFEv1."""
    detalle = {
        'Concepto': concepto,
        'DocTipo': DOC_TIPO[doc_tipo],
        'DocNro': int(doc_numero or 0),
        'CbteDesde': numero,
        'CbteHasta': numero,
        'CbteFch': fecha.strftime('%Y%m%d'),
        'ImpTotal': float(totales['total']),
        'ImpTotConc': 0,
        'ImpNeto': float(totales['neto']),
        'ImpOpEx': 0,
        'ImpIVA': float(totales['iva']),
        'ImpTrib': 0,
        'MonId': 'PES',
        'MonCotiz': 1,
        'CondicionIVAReceptorId': COND_IVA_RECEPTOR[cliente_condicion],
    }

    # Si se factura servicios, ARCA exige fechas de servicio y vto de pago.
    if concepto in (2, 3):
        f = fecha.strftime('%Y%m%d')
        detalle['FchServDesde'] = f
        detalle['FchServHasta'] = f
        detalle['FchVtoPago'] = (vencimiento or fecha).strftime('%Y%m%d')

    # En Factura C no se discrimina IVA; en A/B se manda el detalle de alicuotas.
    if tipo != 'C':
        detalle['Iva'] = {
            'AlicIva': [{
                'Id': _iva_id(alicuota),
                'BaseImp': float(totales['neto']),
                'Importe': float(totales['iva']),
            }],
        }
    return detalle


def _iva_id(alicuota: Decimal) -> int:
    """Id de alicuota del WSFEv1 segun el porcentaje (default 21 %)."""
    valor = Decimal(str(alicuota))
    for clave, identificador in IVA_ALICUOTA_ID.items():
        if Decimal(clave) == valor:
            return identificador
    return IVA_ALICUOTA_ID['21']
