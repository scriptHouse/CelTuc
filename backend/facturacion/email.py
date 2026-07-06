"""Envío de comprobantes por email (opcional y aislado del resto del sistema).

Solo se ejecuta cuando el usuario aprieta "Enviar por email". Si el servidor no
tiene SMTP configurado (EMAIL_HOST vacío en settings), lanza `EmailNoConfigurado`
y el endpoint lo informa. Ninguna otra parte de la facturación depende de esto.

El correo va en HTML (diseño sobrio/monocromático, acorde a la app) con fallback en
texto plano, y adjunta el PDF de la factura.
"""
import html
from decimal import Decimal

from django.conf import settings
from django.core.mail import EmailMultiAlternatives


class EmailNoConfigurado(Exception):
    """No hay SMTP configurado en el servidor (falta EMAIL_HOST)."""


def _money(valor) -> str:
    """1350000.00 -> '1.350.000,00' (formato AR)."""
    crudo = f'{Decimal(valor):,.2f}'  # '1,350,000.00'
    return crudo.replace(',', '\x00').replace('.', ',').replace('\x00', '.')


def _fecha(d) -> str:
    return d.strftime('%d/%m/%Y') if d else '—'


def enviar_comprobante(comprobante, email_destino, pdf_bytes, mensaje=None):
    """Envía el PDF de un comprobante como adjunto a `email_destino` (HTML + texto)."""
    if not settings.EMAIL_HOST:
        raise EmailNoConfigurado(
            'El envío de emails no está configurado en el servidor (falta EMAIL_HOST).'
        )

    numero = comprobante.numero_formateado
    emisor = comprobante.emisor.nombre
    total = _money(comprobante.total)
    asunto = f'Factura {comprobante.tipo} N° {numero} - {emisor}'

    # Fallback en texto plano (clientes sin HTML).
    texto = mensaje or (
        f'Hola,\n\n'
        f'Adjuntamos tu Factura {comprobante.tipo} N° {numero} por un total de $ {total}.\n'
        f'CAE: {comprobante.cae} (vence {_fecha(comprobante.cae_vencimiento)})\n'
        f'El comprobante está adjunto en PDF.\n\n'
        f'{emisor}'
    )

    correo = EmailMultiAlternatives(subject=asunto, body=texto, to=[email_destino])
    correo.attach_alternative(_html(comprobante, emisor, numero, total), 'text/html')
    correo.attach(f'factura-{comprobante.tipo}-{numero}.pdf', pdf_bytes, 'application/pdf')
    correo.send(fail_silently=False)


def _html(comprobante, emisor, numero, total) -> str:
    """HTML sobrio y profesional (tablas + estilos en línea, compatible con Gmail/Outlook)."""
    e = html.escape
    tipo = e(comprobante.tipo)
    nombre_cli = (comprobante.cliente_nombre or '').strip()
    saludo = (
        f'Hola {e(nombre_cli)},'
        if nombre_cli and nombre_cli.lower() != 'consumidor final'
        else 'Hola,'
    )

    def fila(etiqueta, valor, top=True, fuerte=False):
        borde = 'border-top:1px solid #f2f2f3;' if top else ''
        peso = 'font-weight:bold;' if fuerte else ''
        return (
            f'<tr>'
            f'<td style="padding:12px 16px;font-size:13px;color:#6b7280;{borde}">{etiqueta}</td>'
            f'<td align="right" style="padding:12px 16px;font-size:13px;color:#0a0a0b;{peso}{borde}">{valor}</td>'
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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <div style="font-size:16px;font-weight:bold;color:#0a0a0b;">{e(emisor)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;letter-spacing:.08em;">COMPROBANTE ELECTRÓNICO</div>
      </td>
      <td align="right" style="vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td align="center" style="width:42px;height:42px;background:#0a0a0b;color:#ffffff;border-radius:10px;font-size:19px;font-weight:bold;">{tipo}</td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px 26px;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#3a3a3a;">{saludo}</p>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#3a3a3a;">Adjuntamos tu <strong style="color:#0a0a0b;">Factura {tipo} N° {e(numero)}</strong> en formato PDF. Abajo, un resumen del comprobante.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eeeeef;border-radius:12px;">
      {fila('Comprobante', f'Factura {tipo} · {e(numero)}', top=False, fuerte=True)}
      {fila('Fecha de emisión', _fecha(comprobante.fecha))}
      {fila('CAE', e(comprobante.cae or '—'))}
      {fila('Vto. del CAE', _fecha(comprobante.cae_vencimiento))}
      <tr>
        <td style="padding:15px 16px;font-size:15px;color:#0a0a0b;font-weight:bold;border-top:1px solid #e6e6e8;">Total</td>
        <td align="right" style="padding:15px 16px;font-size:19px;color:#0a0a0b;font-weight:bold;border-top:1px solid #e6e6e8;">$ {total}</td>
      </tr>
    </table>
    <p style="margin:22px 0 0;font-size:12px;line-height:1.55;color:#9098a3;">Comprobante autorizado por ARCA (AFIP). Podés verificarlo con su CAE; el PDF con el código QR está adjunto a este correo.</p>
  </td></tr>
  <tr><td style="padding:16px 26px;border-top:1px solid #eeeeef;background:#fafafa;border-radius:0 0 14px 14px;">
    <div style="font-size:11px;color:#a0a6b0;">{e(emisor)} — comprobante generado electrónicamente.</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
