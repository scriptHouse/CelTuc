"""Lo comun a TODA importacion de planillas (.xlsx) del sistema.

Aca vive lo que no depende de que se este importando: normalizar texto para
comparar, leer un numero o un precio de una celda que Excel escribio como
quiera, abrir el libro y nombrar las columnas como las nombra Excel.

Cada importador (Inventario, Precios de service) pone encima lo suyo: que
rotulos reconoce, contra que catalogo cruza y que escribe.

La regla que comparten todos: **celda vacia NO es cero**. Si la planilla no
informa un valor, ese dato no se toca.
"""
import re
import unicodedata
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.core.exceptions import ValidationError

# Techo de filas a procesar (la planilla mas grande del negocio ronda las 1.500).
MAX_FILAS = 20000
# Techo de columnas que se ofrecen para elegir a mano.
MAX_COLUMNAS = 40
# Los precios del sistema se guardan con dos decimales y hasta 10 enteros.
CENTAVO = Decimal('0.01')
MAX_PRECIO = Decimal(10) ** 10


# ===== Texto =====

def normalizar(texto):
    """Minusculas, sin acentos y sin puntuacion: la base para comparar.

    "Cámara TRASERA (2-3 días)" y "camara trasera 2 3 dias" son lo mismo.
    """
    texto = unicodedata.normalize('NFKD', str(texto if texto is not None else ''))
    texto = ''.join(c for c in texto if not unicodedata.combining(c)).lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', texto)).strip()


def numeros_de(texto):
    """Los numeros que aparecen en un texto, ordenados.

    En estos catalogos los numeros son el dato: "256GB" y "512GB" son cosas
    distintas por mucho que el resto del nombre sea identico. Sirven para vetar
    coincidencias aproximadas que solo difieren en un numero.
    """
    return sorted(re.findall(r'\d+', normalizar(texto)))


# ===== Numeros =====

def a_decimal(valor):
    """El valor de una celda como Decimal, o None si no es un numero."""
    if valor is None or valor == '':
        return None
    try:
        return Decimal(str(valor))
    except (InvalidOperation, ValueError, TypeError):
        return None


def precio(valor):
    """El precio de una celda, redondeado a los dos decimales que se guardan.

    None cuando la celda no trae un precio usable. Excel calcula en binario y
    devuelve 7.14 como 7.140000000000001: ese sobrante no cambia el precio pero
    SI rompe el alta (el campo guarda dos decimales), asi que se redondea al
    leer y todo lo que viaja hacia adelante habla en centavos.
    """
    numero = a_decimal(valor)
    if numero is None or not numero.is_finite():
        return None
    try:
        redondeado = numero.quantize(CENTAVO, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    # Fuera de rango no es un precio: un negativo, o un numero que no entra en
    # el campo (10 enteros + 2 decimales).
    if redondeado < 0 or redondeado >= MAX_PRECIO:
        return None
    return redondeado


def texto_de(valor):
    """Decimal -> str (o None). Los precios viajan como texto: en JSON un
    Decimal se convierte en float y ahi se pierden centavos."""
    return str(valor) if valor is not None else None


# ===== Columnas =====

def letra_columna(indice):
    """Como nombra Excel a la columna numero `indice` (0 = A, 26 = AA)."""
    letras, numero = '', indice + 1
    while numero:
        numero, resto = divmod(numero - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


def encabezado_visible(fila):
    """Las columnas de un encabezado, para poder elegir a mano de donde sale
    cada dato: `[{'indice': 1, 'letra': 'B', 'rotulo': 'PRODUCTOS'}, ...]`."""
    return [
        {
            'indice': i,
            'letra': letra_columna(i),
            'rotulo': str(celda).strip() if celda is not None else '',
        }
        for i, celda in enumerate(fila[:MAX_COLUMNAS])
    ]


def con_eleccion(columnas, elegidas, obligatorias=()):
    """Las columnas detectadas, pisadas por las que eligio quien importa.

    Es la valvula para cuando la planilla cambia de forma: si el lector agarro
    la columna equivocada, se le puede decir de cual sacar cada dato. `None`
    apaga un dato; las `obligatorias` no se pueden apagar.
    """
    if not elegidas:
        return columnas
    salida = dict(columnas)
    for campo, posicion in elegidas.items():
        if campo not in salida:
            continue
        if posicion is None and campo in obligatorias:
            continue
        salida[campo] = posicion
    return salida


def celda_de(fila, columnas, cual, salto=0):
    """El valor de la columna `cual` en esa fila, o None si no esta."""
    posicion = columnas.get(cual)
    if posicion is None:
        return None
    posicion += salto
    return fila[posicion] if posicion < len(fila) else None


# ===== Lectura del archivo =====

def hojas_de(archivo):
    """`[(nombre, filas)]`: cada hoja del .xlsx como lista de tuplas.

    Lee TODAS las hojas porque no siempre la primera es la que importa: el
    exportador del sistema, por ejemplo, agrega una hoja "Cómo se generó".
    """
    try:
        import openpyxl
    except ImportError as exc:  # pragma: no cover - dependencia declarada
        raise ValidationError(
            'Falta la librería para leer Excel en el servidor (openpyxl).'
        ) from exc

    try:
        libro = openpyxl.load_workbook(archivo, data_only=True, read_only=True)
    except Exception as exc:
        raise ValidationError(
            'No se pudo abrir el archivo. Tiene que ser un Excel .xlsx guardado '
            'desde Excel o Google Sheets.'
        ) from exc

    try:
        salida = []
        for hoja in libro.worksheets:
            filas = []
            for fila in hoja.iter_rows(values_only=True):
                filas.append(fila)
                if len(filas) >= MAX_FILAS:
                    break
            salida.append((hoja.title, filas))
    finally:
        libro.close()
    return salida
