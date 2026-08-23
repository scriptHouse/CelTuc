"""Endpoints de ARCA y tablas de codigos del Web Service de Facturacion (WSFEv1).

Las URLs y los codigos son los oficiales de ARCA (ex AFIP). Se separan los
ambientes de homologacion (testing) y produccion: el emisor elige con su flag
``produccion`` cual usar.
"""

# Servicio que pedimos al WSAA (Facturacion Electronica).
SERVICIO_WSFE = 'wsfe'

# WSDL del WSAA (autenticacion). Indexado por produccion (True/False).
WSAA_WSDL = {
    False: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
    True: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
}

# WSDL del WSFEv1 (facturacion electronica). Indexado por produccion.
WSFEV1_WSDL = {
    False: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
    True: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
}

# Tiempo maximo (segundos) para las llamadas SOAP a ARCA.
TIMEOUT = 30

# --- Tablas de codigos -------------------------------------------------------

# Tipo de comprobante (CbteTipo) segun la letra, para cada clase. ARCA numera
# por separado cada (punto de venta, CbteTipo): la Factura B y la Nota de credito
# B llevan contadores distintos.
TIPO_CBTE = {
    'A': 1,    # Factura A
    'B': 6,    # Factura B
    'C': 11,   # Factura C
}
TIPO_CBTE_NC = {
    'A': 3,    # Nota de credito A
    'B': 8,    # Nota de credito B
    'C': 13,   # Nota de credito C
}


def codigo_comprobante(clase: str, letra: str) -> int:
    """CbteTipo de ARCA para una clase ('factura' / 'nota_credito') y su letra."""
    tabla = TIPO_CBTE_NC if clase == 'nota_credito' else TIPO_CBTE
    return tabla[letra]

# Tipo de documento del receptor (DocTipo).
DOC_TIPO = {
    'CUIT': 80,
    'CUIL': 86,
    'DNI': 96,
    'CF': 99,   # Consumidor Final (sin identificar)
}

# Condicion del receptor frente al IVA (CondicionIVAReceptorId, RG 5616).
# Obligatorio en todos los comprobantes.
COND_IVA_RECEPTOR = {
    'responsable_inscripto': 1,
    'exento': 4,
    'consumidor_final': 5,
    'monotributista': 6,
}

# Id de alicuota de IVA segun el porcentaje (Iva[].Id del WSFEv1).
IVA_ALICUOTA_ID = {
    '0': 3,
    '10.5': 4,
    '21': 5,
    '27': 6,
    '5': 8,
    '2.5': 9,
}

# Moneda: por ahora siempre pesos.
MONEDA_PESOS = 'PES'
