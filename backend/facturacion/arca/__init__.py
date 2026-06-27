"""Integracion directa con los Web Services de ARCA (ex AFIP).

Submodulos:

- ``constantes``: endpoints (homologacion/produccion) y tablas de codigos AFIP.
- ``errores``: la excepcion ``ErrorARCA`` que usan las vistas para devolver un
  mensaje claro al frontend.
- ``wsaa``: autenticacion. Firma el "Ticket de Acceso" (TRA) con el certificado y
  la clave del emisor (CMS/PKCS#7) y obtiene token + sign, cacheados 12 h.
- ``wsfev1``: facturacion electronica (ultimo numero, solicitud de CAE, estado).
- ``qr``: arma la URL del codigo QR obligatorio de la factura.
- ``servicio``: orquesta la emision de un comprobante y la prueba de conexion.

Las dependencias pesadas (``zeep``, ``cryptography``, ``qrcode``) se importan
dentro de cada funcion, no al cargar el modulo: asi la app se puede importar,
migrar y chequear aunque todavia no esten instaladas.
"""
