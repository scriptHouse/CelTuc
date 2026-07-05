"""Envío de comprobantes por email (opcional y aislado del resto del sistema).

Solo se ejecuta cuando el usuario aprieta "Enviar por email". Si el servidor no
tiene SMTP configurado (EMAIL_HOST vacío en settings), lanza `EmailNoConfigurado`
y el endpoint lo informa. Ninguna otra parte de la facturación depende de esto.
"""
from django.conf import settings
from django.core.mail import EmailMessage


class EmailNoConfigurado(Exception):
    """No hay SMTP configurado en el servidor (falta EMAIL_HOST)."""


def enviar_comprobante(comprobante, email_destino, pdf_bytes, mensaje=None):
    """Envía el PDF de un comprobante como adjunto a `email_destino`."""
    if not settings.EMAIL_HOST:
        raise EmailNoConfigurado(
            'El envío de emails no está configurado en el servidor (falta EMAIL_HOST).'
        )

    numero = comprobante.numero_formateado
    emisor = comprobante.emisor.nombre
    asunto = f'Factura {comprobante.tipo} N° {numero} - {emisor}'
    cuerpo = mensaje or (
        f'Hola,\n\n'
        f'Adjuntamos la Factura {comprobante.tipo} N° {numero} por un total de '
        f'${comprobante.total}.\n'
        f'CAE: {comprobante.cae}\n\n'
        f'{emisor}'
    )

    correo = EmailMessage(subject=asunto, body=cuerpo, to=[email_destino])
    correo.attach(f'factura-{comprobante.tipo}-{numero}.pdf', pdf_bytes, 'application/pdf')
    correo.send(fail_silently=False)
