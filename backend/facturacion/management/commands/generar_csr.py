"""Genera la clave privada (.key) y el pedido de certificado (.csr) de un emisor.

Es el primer paso para dar de alta un emisor en ARCA: ARCA NO genera la clave;
uno genera la clave + el CSR localmente, sube el CSR a ARCA y ARCA devuelve el
certificado (.crt). La clave privada nunca sale de tu poder.

Uso:
    python manage.py generar_csr --cuit 20111111112 --razon-social "CelTuc SRL" --alias celtuc

Genera <alias>.key y <alias>.csr en la carpeta indicada con --salida (por defecto,
la carpeta actual). El asunto (subject) del CSR sigue el formato que pide ARCA:
    C=AR, O=<razon social>, CN=<alias>, serialNumber=CUIT <cuit>
"""
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Genera la clave privada (.key) y el CSR (.csr) de un emisor para ARCA.'

    def add_arguments(self, parser):
        parser.add_argument('--cuit', required=True, help='CUIT del emisor (11 digitos).')
        parser.add_argument('--razon-social', required=True, help='Razon social / nombre (campo O).')
        parser.add_argument('--alias', default='celtuc', help='Alias del certificado (campo CN).')
        parser.add_argument('--salida', default='.', help='Carpeta donde escribir los archivos.')

    def handle(self, *args, **opciones):
        try:
            from cryptography import x509
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import rsa
            from cryptography.x509.oid import NameOID
        except ImportError as exc:
            raise CommandError('Falta la dependencia "cryptography".') from exc

        cuit = re.sub(r'\D', '', opciones['cuit'])
        if len(cuit) != 11:
            raise CommandError('El CUIT debe tener 11 digitos.')

        razon_social = opciones['razon_social'].strip()
        alias = opciones['alias'].strip()
        salida = Path(opciones['salida']).expanduser().resolve()
        salida.mkdir(parents=True, exist_ok=True)

        # Clave privada RSA 2048 (sin password) y CSR firmado con SHA-256.
        clave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, 'AR'),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, razon_social),
            x509.NameAttribute(NameOID.COMMON_NAME, alias),
            x509.NameAttribute(NameOID.SERIAL_NUMBER, f'CUIT {cuit}'),
        ])
        csr = (
            x509.CertificateSigningRequestBuilder()
            .subject_name(subject)
            .sign(clave, hashes.SHA256())
        )

        clave_pem = clave.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
        csr_pem = csr.public_bytes(serialization.Encoding.PEM)

        ruta_key = salida / f'{alias}.key'
        ruta_csr = salida / f'{alias}.csr'
        ruta_key.write_bytes(clave_pem)
        ruta_csr.write_bytes(csr_pem)

        self.stdout.write(self.style.SUCCESS('Archivos generados:'))
        self.stdout.write(f'  Clave privada: {ruta_key}')
        self.stdout.write(f'  Pedido (CSR):  {ruta_csr}')
        self.stdout.write('')
        self.stdout.write('Subject del CSR: C=AR, O=%s, CN=%s, serialNumber=CUIT %s' % (razon_social, alias, cuit))
        self.stdout.write('')
        self.stdout.write('Proximos pasos en ARCA (homologacion, con tu Clave Fiscal):')
        self.stdout.write('  1. Entra a WSASS homologacion: https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx')
        self.stdout.write('  2. "Nuevo Certificado": pega el contenido del .csr; ARCA te devuelve el .crt.')
        self.stdout.write('  3. "Crear Autorizacion a Servicio": autoriza el servicio "wsfe" para ese certificado.')
        self.stdout.write('  4. En el panel (Nueva cuenta), pega el .crt y este .key, deja Homologacion y proba la conexion.')
        self.stdout.write('')
        self.stdout.write('--- CONTENIDO DEL CSR (podes copiarlo y pegarlo en ARCA) ---')
        self.stdout.write(csr_pem.decode('ascii'))
        self.stdout.write(self.style.WARNING(
            'IMPORTANTE: guarda el .key en lugar seguro. Si lo perdes, hay que generar todo de nuevo.'
        ))
