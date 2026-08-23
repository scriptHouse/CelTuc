"""Envio por email de un documento ya archivado (opcional y aislado).

Corre SOLO cuando alguien aprieta «Enviar» en el modulo Documentos. Si el
servidor no tiene SMTP configurado (`EMAIL_HOST` vacio) lanza
``EmailNoConfigurado`` y el endpoint lo informa: generar, descargar y archivar
siguen funcionando igual sin correo.

A diferencia de facturacion —donde el PDF lo arma el front y viaja en base64—
aca el archivo YA esta guardado en el servidor (`DocumentoGenerado.archivo`),
asi que se adjunta exactamente el mismo archivo que se descargo y se entrego en
el mostrador. El backend no vuelve a generar nada.
"""
import html
import re
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

# Marca del pie y del asunto. Los papeles ya salen con este encabezado
# (`documentos/content.ts` en el front), asi que el correo dice lo mismo.
EMPRESA = 'CelTuc'


class EmailNoConfigurado(Exception):
    """No hay SMTP configurado en el servidor (falta EMAIL_HOST)."""


class ArchivoNoDisponible(Exception):
    """El archivo del documento ya no esta en el servidor (no se puede adjuntar)."""


def _money(valor) -> str:
    """Decimal -> '1.350.000,00' (formato AR). '' si no es un numero."""
    try:
        crudo = f'{Decimal(valor):,.2f}'  # '1,350,000.00'
    except (TypeError, ValueError, InvalidOperation):
        return ''
    return crudo.replace(',', '\x00').replace('.', ',').replace('\x00', '.')


def _fecha(documento) -> str:
    """Dia en que se genero el documento, en hora local."""
    return timezone.localtime(documento.creado).strftime('%d/%m/%Y')


def _asunto(documento) -> str:
    nombre = documento.nombre_tipo
    if documento.referencia:
        return f'{nombre} N° {documento.referencia} - {EMPRESA}'
    return f'{nombre} - {EMPRESA}'


def _leer_archivo(documento) -> bytes:
    """Bytes del archivo guardado, o ``ArchivoNoDisponible`` si ya no esta."""
    try:
        with documento.archivo.open('rb') as f:
            return f.read()
    except (FileNotFoundError, ValueError, OSError) as exc:
        raise ArchivoNoDisponible(
            'El archivo de este documento ya no esta disponible en el servidor.'
        ) from exc


def enviar_documento(documento, email_destino, mensaje=None):
    """Envia el documento archivado a `email_destino`, con su archivo adjunto.

    `mensaje` es el texto que escribio el usuario (la misma plantilla que usa el
    boton de WhatsApp). Va como cuerpo del correo; el resumen del documento y el
    adjunto los agrega esta funcion.
    """
    if not settings.EMAIL_HOST:
        raise EmailNoConfigurado(
            'El envio de emails no esta configurado en el servidor (falta EMAIL_HOST).'
        )

    contenido = _leer_archivo(documento)
    texto = (mensaje or '').strip() or _texto_por_defecto(documento)

    correo = EmailMultiAlternatives(
        subject=_asunto(documento), body=texto, to=[email_destino],
    )
    correo.attach_alternative(_html(documento, texto), 'text/html')
    correo.attach(documento.nombre_descarga, contenido, documento.content_type_efectivo)
    correo.send(fail_silently=False)


def _texto_por_defecto(documento) -> str:
    """Cuerpo cuando el front no manda mensaje (o quedo vacio)."""
    saludo = f'Hola {documento.cliente},' if documento.cliente.strip() else 'Hola,'
    return (
        f'{saludo}\n\n'
        f'Te compartimos tu {documento.nombre_tipo.lower()} de {EMPRESA}. '
        f'El archivo va adjunto a este correo.\n\n'
        f'{EMPRESA}'
    )


def _parrafos(texto: str) -> str:
    """Texto plano -> parrafos HTML, respetando saltos de linea y *negritas*.

    El mismo mensaje se usa en WhatsApp, donde `*asi*` es negrita: se traduce a
    <strong> para que el correo se lea igual. Se escapa ANTES de tocar nada, asi
    lo que escriba el usuario nunca puede inyectar HTML.
    """
    seguro = html.escape(texto)
    seguro = re.sub(r'\*([^*\n]+)\*', r'<strong>\1</strong>', seguro)
    bloques = [b.strip() for b in re.split(r'\n\s*\n', seguro) if b.strip()]
    return ''.join(
        f'<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#3a3a3a;">'
        f'{b.replace(chr(10), "<br>")}</p>'
        for b in bloques
    )


def _html(documento, texto) -> str:
    """HTML sobrio (tablas + estilos en linea, compatible con Gmail/Outlook)."""
    e = html.escape
    total = _money(documento.total) if documento.total is not None else ''

    def fila(etiqueta, valor, top=True, fuerte=False):
        if not valor:
            return ''
        borde = 'border-top:1px solid #f2f2f3;' if top else ''
        peso = 'font-weight:bold;' if fuerte else ''
        return (
            f'<tr>'
            f'<td style="padding:12px 16px;font-size:13px;color:#6b7280;{borde}">{etiqueta}</td>'
            f'<td align="right" style="padding:12px 16px;font-size:13px;color:#0a0a0b;{peso}{borde}">{valor}</td>'
            f'</tr>'
        )

    filas = (
        fila('Documento', e(documento.nombre_tipo), top=False, fuerte=True)
        + fila('N°', e(documento.referencia))
        + fila('Fecha', _fecha(documento))
        + fila('Cliente', e(documento.cliente))
        + fila('Detalle', e(documento.detalle))
        + fila('Sucursal', e(documento.sucursal))
    )
    if total:
        filas += (
            f'<tr>'
            f'<td style="padding:15px 16px;font-size:15px;color:#0a0a0b;font-weight:bold;'
            f'border-top:1px solid #e6e6e8;">Total</td>'
            f'<td align="right" style="padding:15px 16px;font-size:19px;color:#0a0a0b;'
            f'font-weight:bold;border-top:1px solid #e6e6e8;">$ {total}</td>'
            f'</tr>'
        )

    return f"""\
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e6e6e8;border-radius:14px;">
  <tr><td style="padding:22px 26px;border-bottom:1px solid #eeeeef;">
    <div style="font-size:16px;font-weight:bold;color:#0a0a0b;">{EMPRESA}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:4px;letter-spacing:.08em;">{e(documento.nombre_tipo).upper()}</div>
  </td></tr>
  <tr><td style="padding:24px 26px;">
    {_parrafos(texto)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eeeeef;border-radius:12px;margin-top:8px;">
      {filas}
    </table>
    <p style="margin:22px 0 0;font-size:12px;line-height:1.55;color:#9098a3;">El documento va adjunto a este correo ({e(documento.nombre_descarga)}).</p>
  </td></tr>
  <tr><td style="padding:16px 26px;border-top:1px solid #eeeeef;background:#fafafa;border-radius:0 0 14px 14px;">
    <div style="font-size:11px;color:#a0a6b0;">{EMPRESA} — documento generado electronicamente.</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
