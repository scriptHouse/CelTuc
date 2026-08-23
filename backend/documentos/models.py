"""Archivo de los documentos que se generan en el modulo Documentos.

Cada vez que alguien exporta una plantilla (PDF, Excel o ticket POS80) se
guarda UNA fila con el archivo exacto que se descargo, mas los datos con los
que se completo. Asi el historial responde tres preguntas: que se genero,
quien lo genero y como era el papel entregado.

El archivo NO tiene URL publica: se baja por un endpoint autenticado (mismo
criterio que los adjuntos de la cartelera). En produccion `media/` esta
montado como volumen, asi que sobrevive a los redeploys.
"""
import uuid

from django.db import models
from django.utils import timezone

from comun.models import ModeloBase

# Extension y content-type reales de cada formato. Los decide el SERVIDOR: el
# nombre de archivo que manda el navegador se usa solo como etiqueta visible,
# nunca para elegir como se guarda ni como se sirve el contenido.
FORMATOS = {
    'pdf': ('.pdf', 'application/pdf'),
    'xlsx': ('.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    'pos80': ('.pdf', 'application/pdf'),
}

# Nombre visible de cada tipo, por si el front no lo manda (ver `tipo_nombre`).
# El catalogo real vive en el front (`documentos/registry.tsx`); esto es solo
# para que el admin de Django y los registros viejos se lean bien.
TIPOS = {
    'recepcion': 'Recepción de equipo/s',
    'reparacion': 'Garantía / Reparación',
    'compra': 'Compra',
    'compra-mayorista': 'Compra mayorista',
    'extension-garantia': 'Extensión de garantía',
    'sena': 'Seña',
    'compraventa': 'Compra / Venta',
    'garantia-accesorios': 'Garantía de accesorios',
}


def ruta_documento(instance, filename):
    """media/documentos/<aaaa>/<mm>/<tipo>-<uuid><ext>.

    El nombre en disco lo arma el servidor (uuid + extension del formato): el
    `filename` del cliente se ignora a proposito, para que nada de lo que llega
    por la red termine siendo parte de una ruta.
    """
    extension = FORMATOS.get(instance.formato, ('.bin', ''))[0]
    tipo = ''.join(c for c in (instance.tipo or 'doc') if c.isalnum() or c in '-_')[:40]
    ahora = timezone.localtime()
    return f'documentos/{ahora:%Y/%m}/{tipo or "doc"}-{uuid.uuid4().hex}{extension}'


class DocumentoGenerado(ModeloBase):
    """Un documento exportado desde el modulo Documentos.

    Hereda de ``ModeloBase``: `creado` es la fecha y hora de generacion,
    `creado_por` es quien lo genero, y eliminar es borrado logico (el archivo
    sale del historial pero no se pierde).
    """

    class Formato(models.TextChoices):
        PDF = 'pdf', 'PDF'
        XLSX = 'xlsx', 'Excel'
        POS80 = 'pos80', 'Ticket POS80'

    # `tipo` es el id del documento en el catalogo del front ('compraventa',
    # 'sena', ...). A proposito SIN `choices`: sumar una plantilla nueva al
    # front no tiene que pedir una migracion del backend.
    tipo = models.CharField('tipo', max_length=40, db_index=True)
    tipo_nombre = models.CharField('nombre del tipo', max_length=120, blank=True)
    formato = models.CharField(
        'formato', max_length=10, choices=Formato.choices, default=Formato.PDF,
    )

    archivo = models.FileField('archivo', upload_to=ruta_documento, max_length=300)
    nombre_archivo = models.CharField('nombre del archivo', max_length=200, blank=True)
    content_type = models.CharField('content type', max_length=100, blank=True)
    tamanio = models.PositiveBigIntegerField('tamaño (bytes)', default=0)

    # Sucursal del encabezado impreso. Es TEXTO y no una FK a inventario.Sucursal
    # porque es una foto de lo que decia el papel: si mañana se renombra o se da
    # de baja una sucursal, el documento entregado sigue diciendo lo mismo.
    sucursal = models.CharField('sucursal', max_length=60, blank=True)

    # Campos para buscar y para armar el renglon del historial sin abrir el JSON.
    referencia = models.CharField('cupón / N° recibo', max_length=60, blank=True)
    cliente = models.CharField('cliente', max_length=160, blank=True)
    cliente_documento = models.CharField('DNI / documento', max_length=40, blank=True)
    detalle = models.CharField('detalle', max_length=200, blank=True)
    total = models.DecimalField(
        'total', max_digits=14, decimal_places=2, null=True, blank=True,
        help_text='Importe del documento cuando se puede leer del formulario.',
    )

    # Formulario completo tal cual se exporto. Permite reconstruir el documento
    # (o auditar que decia cada campo) aunque el archivo se pierda.
    datos = models.JSONField('datos del formulario', default=dict, blank=True)

    class Meta:
        db_table = 'documentos_generados'
        verbose_name = 'documento generado'
        verbose_name_plural = 'documentos generados'
        ordering = ('-creado', '-id')
        indexes = [
            models.Index(fields=('-creado',), name='doc_gen_creado_idx'),
            models.Index(fields=('tipo', '-creado'), name='doc_gen_tipo_creado_idx'),
        ]

    def __str__(self):
        nombre = self.tipo_nombre or TIPOS.get(self.tipo, self.tipo)
        partes = [nombre]
        if self.referencia:
            partes.append(f'N° {self.referencia}')
        if self.cliente:
            partes.append(self.cliente)
        return ' · '.join(partes)[:300]

    @property
    def extension(self) -> str:
        return FORMATOS.get(self.formato, ('.bin', ''))[0]

    @property
    def nombre_tipo(self) -> str:
        """Nombre visible del tipo, con el catalogo local como respaldo."""
        return self.tipo_nombre or TIPOS.get(self.tipo, self.tipo.replace('-', ' ').capitalize())

    @property
    def nombre_descarga(self) -> str:
        """Nombre con el que se entrega el archivo (descarga o adjunto de email).

        Siempre termina en la extension real del formato: el nombre guardado es
        una etiqueta que puso el navegador y podria venir sin ella.
        """
        nombre = self.nombre_archivo or f'documento-{self.pk}{self.extension}'
        if not nombre.lower().endswith(self.extension):
            nombre = f'{nombre}{self.extension}'
        return nombre

    @property
    def content_type_efectivo(self) -> str:
        """Content-type con el que se sirve, decidido por el formato guardado."""
        return (
            self.content_type
            or FORMATOS.get(self.formato, ('', ''))[1]
            or 'application/octet-stream'
        )
