"""Importacion de stock por sucursal desde la planilla del negocio (.xlsx).

Cada sucursal completa la columna STOCK de la MISMA planilla maestra (la que
ya dio origen al catalogo) y la sube. Aca se lee, se cruza contra el catalogo
y se devuelve un DIFF fila por fila (antes -> despues). Nada se escribe: el
analisis es de solo lectura y quien importa decide, item por item, que aplicar.

Dos cuidados que definen el diseño:

1. **Celda vacia NO es cero.** Si la planilla no informa cantidad, la fila se
   marca `sin_valor` y no se toca el stock. Sin esta regla, importar una
   planilla a medio llenar pondria en cero medio inventario.
2. **La hoja cambia de forma en el medio.** MODULOS vuelve a escribir el
   encabezado con las columnas corridas y reparte las calidades (CC / CO / CA)
   EN COLUMNAS: cada modelo es un renglon con tres precios y tres stocks. Cada
   encabezado nuevo manda desde su fila hacia abajo y cada calidad sale como su
   propia fila ("11 PRO" + "Calidad certificada"). Si ese bloque llega sin encabezado
   (una planilla vieja), sigue valiendo la red de siempre: se detecta que la
   columna STOCK esta ocupada por precios y esas filas quedan afuera con el
   motivo a la vista, en vez de meter un precio como si fuera un conteo.

El matcheo contra el catalogo va de lo seguro a lo dudoso: nombre exacto (con
las variantes que arma la planilla: "Fuente 20W - CO" es nombre + calidad),
desempate por precio de lista cuando hay varios candidatos y, recien ahi,
parecido de texto. Lo que no cierra se marca `revisar` en vez de adivinar.
"""
import difflib
import re
import unicodedata
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max

from productos.models import CategoriaProducto, Producto

from .models import MovimientoStock, StockProducto, aplicar_ajuste

# Un conteo de mostrador nunca llega a esto: lo que lo supera es un precio o un
# error de tipeo, no unidades.
MAX_UNIDADES = 9999
# Parecido minimo (0-1) para aceptar una coincidencia aproximada.
UMBRAL_APROXIMADA = 0.84
# Diferencia minima de puntaje para desempatar entre dos candidatos.
MARGEN_DESEMPATE = 0.02
# Techo de filas a procesar (la planilla real ronda las 1.500).
MAX_FILAS = 20000

# Abreviaturas de calidad que usa la planilla y el catalogo guarda completas.
ALIAS_CALIDAD = {
    'co': 'calidad original',
    'ao': 'apple original',
    'cc': 'calidad china',
    'org': 'original',
    'orginal': 'original',
    'orig': 'original',
}

ENCABEZADO_PRODUCTO = 'productos'
ENCABEZADO_STOCK = 'stock'
ENCABEZADO_MINIMO = 'stock minimo'
ENCABEZADO_LISTA = 'precio de lista usd'

# Las calidades que la planilla reparte EN COLUMNAS (hoy solo MODULOS): arriba
# va el titulo del grupo combinado sobre las tres (STOCK, PRECIO DE LISTA USD)
# y abajo el sub-encabezado que las nombra. El catalogo no las guarda en el
# nombre sino en la calidad del producto: "11 PRO" + "Calidad certificada".
CALIDADES_EN_COLUMNA = {
    'cc': 'Calidad certificada',
    'co': 'Calidad original',
    'ca': 'Calidad Apple',
}
# Lo que escribe la planilla cuando esa calidad no existe para ese modelo.
SIN_DATO_PLANILLA = ('-', '--', 'n/a', 's/d')


# ===== Normalizacion =====

def normalizar(texto):
    """Minusculas, sin acentos y sin puntuacion: la base para comparar."""
    texto = unicodedata.normalize('NFKD', str(texto if texto is not None else ''))
    texto = ''.join(c for c in texto if not unicodedata.combining(c)).lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', texto)).strip()


def clave(texto):
    """Normaliza y expande las abreviaturas de calidad (CO, AO, ORG)."""
    return ' '.join(ALIAS_CALIDAD.get(t, t) for t in normalizar(texto).split())


def _numeros(texto):
    """Los numeros que aparecen en un nombre, en orden.

    En este catalogo los numeros son el dato: "256GB" y "512GB" son productos
    distintos por mucho que el resto del nombre sea identico. Se usan para
    vetar coincidencias aproximadas que solo difieren en un numero.
    """
    return sorted(re.findall(r'\d+', normalizar(texto)))


def _a_decimal(valor):
    if valor is None or valor == '':
        return None
    try:
        return Decimal(str(valor))
    except (InvalidOperation, ValueError, TypeError):
        return None


# ===== Lectura de la planilla =====

def _columnas_de(fila):
    """Las columnas de una fila de encabezado, o None si no lo es.

    Alcanza con que esten PRODUCTOS y STOCK; el minimo y el precio de lista son
    opcionales. Se usa dos veces —para encontrar el encabezado de arriba y para
    reconocer el que MODULOS vuelve a escribir en el medio de la hoja— asi que
    ninguna posicion queda fija: cada bloque dice donde tiene lo suyo.
    """
    rotulos = [normalizar(c) for c in fila]
    if ENCABEZADO_PRODUCTO not in rotulos or ENCABEZADO_STOCK not in rotulos:
        return None
    return {
        'producto': rotulos.index(ENCABEZADO_PRODUCTO),
        'stock': rotulos.index(ENCABEZADO_STOCK),
        'minimo': rotulos.index(ENCABEZADO_MINIMO) if ENCABEZADO_MINIMO in rotulos else None,
        'lista': rotulos.index(ENCABEZADO_LISTA) if ENCABEZADO_LISTA in rotulos else None,
    }


def _indice_encabezado(filas):
    """La fila que tiene los rotulos (PRODUCTOS ... STOCK) y sus columnas."""
    for i, fila in enumerate(filas):
        columnas = _columnas_de(fila)
        if columnas is not None:
            return i, columnas
    return None, None


def _calidades_desde(fila, inicio):
    """Las calidades rotuladas a partir de `inicio`, en columnas consecutivas."""
    if inicio is None:
        return []
    encontradas = []
    for salto in range(len(CALIDADES_EN_COLUMNA)):
        posicion = inicio + salto
        if posicion >= len(fila):
            break
        calidad = CALIDADES_EN_COLUMNA.get(normalizar(fila[posicion]))
        if calidad is None:
            break
        encontradas.append((calidad, salto))
    # Una sola etiqueta no es un reparto sino un rotulo suelto: con ese piso, un
    # "CO" perdido en una celda no se confunde con la matriz de MODULOS.
    return encontradas if len(encontradas) > 1 else []


def _calidades_de_subencabezado(fila, columnas):
    """El reparto de calidades en columnas de un sub-encabezado, o [].

    La planilla combina el titulo de cada grupo sobre sus tres columnas y rotula
    abajo CC / CO / CA. Alcanza con encontrar UN grupo rotulado: los
    desplazamientos son los mismos para todos, asi que el que sale del precio de
    lista sirve igual para STOCK, que en el archivo del negocio no repite las
    etiquetas.
    """
    for cual in ('stock', 'lista', 'minimo'):
        encontradas = _calidades_desde(fila, columnas.get(cual))
        if encontradas:
            return encontradas
    return []


def _informa(valor):
    """Si la celda dice algo: la planilla marca con un guion lo que no existe."""
    if valor is None:
        return False
    if isinstance(valor, str):
        texto = valor.strip()
        return bool(texto) and texto.lower() not in SIN_DATO_PLANILLA
    return True


def leer_planilla(archivo):
    """Devuelve las filas de producto de la planilla, ya ubicadas por columna.

    Cada fila es un dict con `fila` (numero real en el Excel, para que quien
    revisa pueda ir a buscarla), `seccion`, `nombre`, `nombre_base`, `calidad`,
    `stock_crudo`, `minimo_crudo`, `lista_usd` y `columna_ocupada` (la seccion
    reusa la columna STOCK para otra cosa).

    La hoja puede cambiar de forma en el medio: cada encabezado nuevo manda
    desde su fila hacia abajo y, si abajo reparte las calidades en columnas,
    cada modelo sale como una fila por calidad.
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
        hoja = libro.worksheets[0]
        crudas = []
        for fila in hoja.iter_rows(values_only=True):
            crudas.append(fila)
            if len(crudas) >= MAX_FILAS:
                break
    finally:
        libro.close()

    indice, columnas = _indice_encabezado(crudas)
    if indice is None:
        raise ValidationError(
            'No se encontró el encabezado de la planilla: tiene que haber una fila '
            'con las columnas "PRODUCTOS" y "STOCK".'
        )

    def celda(fila, cual, salto=0):
        pos = columnas[cual]
        if pos is None:
            return None
        pos += salto
        return fila[pos] if pos < len(fila) else None

    base = columnas
    filas = []
    seccion = ''
    columna_ocupada = False
    # El sub-encabezado aparece JUSTO ANTES del titulo de su seccion, asi que
    # su aviso tiene que sobrevivir a ese cambio de seccion (y solo a ese).
    hereda_aviso = False
    # Calidades en columna del bloque activo: [(calidad, desplazamiento)].
    calidades = []
    # Solo se buscan en la fila siguiente a un encabezado nuevo. En el bloque de
    # arriba no se busca nada, que es lo que garantiza que las planillas de
    # siempre se sigan leyendo exactamente igual que antes.
    buscando_calidades = False
    for numero in range(indice + 1, len(crudas)):
        cruda = crudas[numero]
        etiqueta = str(cruda[0] or '').strip() if cruda else ''
        otro_encabezado = _columnas_de(cruda) if cruda else None
        if etiqueta:
            seccion = etiqueta
            # Un titulo nuevo cierra el bloque de calidades y devuelve la hoja a
            # su encabezado de arriba. No cuando el titulo viene en la MISMA
            # fila que el encabezado que abre el bloque: asi lo escribe MODULOS.
            if otro_encabezado is None and calidades:
                columnas, calidades = base, []
            columna_ocupada = hereda_aviso
            hereda_aviso = False
        if otro_encabezado is not None:
            # La hoja vuelve a empezar con otras columnas (asi entra MODULOS):
            # de aca para abajo se lee con este mapa.
            columnas = otro_encabezado
            calidades = []
            buscando_calidades = True
            columna_ocupada = False
            hereda_aviso = False
            continue
        nombre = str(celda(cruda, 'producto') or '').strip()
        if not nombre:
            if buscando_calidades:
                encontradas = _calidades_de_subencabezado(cruda, columnas)
                if encontradas:
                    calidades = encontradas
                    buscando_calidades = False
                    continue
            # Sub-encabezado: la planilla rotula con texto la columna donde
            # deberian ir unidades (MODULOS la usa para los precios CO/AO).
            valor = celda(cruda, 'stock')
            if isinstance(valor, str) and valor.strip():
                columna_ocupada = True
                hereda_aviso = True
            continue
        buscando_calidades = False
        if calidades:
            filas.extend(_filas_por_calidad(cruda, celda, numero, seccion, nombre, calidades))
            continue
        filas.append({
            'fila': numero + 1,
            'seccion': seccion,
            'nombre': nombre,
            'nombre_base': nombre,
            'calidad': '',
            'stock_crudo': celda(cruda, 'stock'),
            'minimo_crudo': celda(cruda, 'minimo'),
            'lista_usd': _a_decimal(celda(cruda, 'lista')),
            'columna_ocupada': columna_ocupada,
        })
    return filas


def _filas_por_calidad(cruda, celda, numero, seccion, nombre, calidades):
    """Una fila de la planilla que trae varias calidades EN COLUMNAS.

    Sale una fila por calidad, cada una con su precio y su stock. La calidad que
    no existe para ese modelo no genera fila: la planilla la deja con un guion y
    sin unidades, y una fila fantasma solo ensuciaria la revision.
    """
    salidas = []
    for calidad, salto in calidades:
        stock = celda(cruda, 'stock', salto)
        lista = _a_decimal(celda(cruda, 'lista', salto))
        if not _informa(stock):
            # El guion es "no existe", no "conte cero": se lee como celda vacia.
            stock = None
            if lista is None:
                continue
        salidas.append({
            'fila': numero + 1,
            'seccion': seccion,
            'nombre': f'{nombre} {calidad}',
            'nombre_base': nombre,
            'calidad': calidad,
            'stock_crudo': stock,
            'minimo_crudo': celda(cruda, 'minimo', salto),
            'lista_usd': lista,
            'columna_ocupada': False,
        })
    return salidas


def _cantidad(valor):
    """(cantidad, motivo). `cantidad` es None si la celda no informa unidades."""
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None, ''
    if isinstance(valor, bool):
        return None, 'El valor no es un número de unidades.'
    if isinstance(valor, str):
        texto = valor.strip().replace('.', '').replace(',', '.')
        try:
            valor = Decimal(texto)
        except (InvalidOperation, ValueError):
            return None, f'"{valor.strip()[:40]}" no es un número de unidades.'
    numero = _a_decimal(valor)
    if numero is None:
        return None, 'El valor no es un número de unidades.'
    if numero != numero.to_integral_value():
        return None, f'{numero} no es un número entero de unidades.'
    entero = int(numero)
    if entero < 0:
        return None, 'La cantidad no puede ser negativa.'
    if entero > MAX_UNIDADES:
        return None, (
            f'{entero:,}'.replace(',', '.') +
            ' es demasiado para un conteo: parece un precio, no unidades.'
        )
    return entero, ''


# ===== Indice del catalogo =====

def _variantes(producto):
    """Los nombres con los que la planilla puede escribir este producto.

    El catalogo parte el renglon de la planilla en columnas: "Fuente 20W - CO"
    se guarda como nombre "Fuente 20W" + calidad "Calidad original". Aca se
    rearma en todas las combinaciones razonables para poder matchear exacto.
    """
    base = producto.nombre
    calidad, nota = producto.calidad, producto.nota
    nombres = {base}
    if calidad:
        nombres.add(f'{base} {calidad}')
    if nota:
        nombres.add(f'{base} {nota}')
    if calidad and nota:
        nombres.add(f'{base} {calidad} {nota}')
    if producto.marca and producto.marca.lower() not in base.lower():
        nombres.add(f'{base} {producto.marca}')
        if calidad:
            nombres.add(f'{base} {producto.marca} {calidad}')
    # Sufijos que en la planilla son texto y en el catalogo son banderas.
    sufijos = set()
    for nombre in nombres:
        if producto.a_pedido:
            sufijos.add(f'{nombre} a pedido')
        if producto.nuevo:
            sufijos.add(f'{nombre} producto nuevo')
    return nombres | sufijos


class IndiceCatalogo:
    """El catalogo preparado para buscar: por nombre exacto y por parecido."""

    def __init__(self):
        self.categorias = {c.id: c for c in CategoriaProducto.objects.all()}
        self.raices = [c for c in self.categorias.values() if c.padre_id is None]
        self.productos = list(
            Producto.objects.filter(activo=True).select_related('categoria')
        )
        self.por_clave = defaultdict(list)
        self.ficha = {}
        self.raiz_de_producto = {}
        for producto in self.productos:
            self.ficha[producto.id] = clave(
                f'{producto.nombre} {producto.calidad} {producto.nota}'
            )
            self.raiz_de_producto[producto.id] = self.raiz(producto.categoria_id).id
            for variante in _variantes(producto):
                self.por_clave[clave(variante)].append(producto)
        self.claves = list(self.por_clave)
        self._cache_seccion = {}

    def raiz(self, categoria_id):
        categoria = self.categorias[categoria_id]
        return self.categorias[categoria.padre_id] if categoria.padre_id else categoria

    def categoria_de_seccion(self, seccion):
        """La categoria raiz que corresponde al titulo de seccion de la planilla.

        Se compara por parecido porque los titulos vienen con erratas de la
        planilla ("CAMRA TRASERA", "POWEBANKS") y en mayusculas.
        """
        if seccion in self._cache_seccion:
            return self._cache_seccion[seccion]
        buscada = normalizar(seccion)
        mejor, puntaje = None, 0.0
        if buscada:
            for categoria in self.raices:
                actual = normalizar(categoria.nombre)
                if not actual:
                    continue
                similitud = difflib.SequenceMatcher(None, buscada, actual).ratio()
                if actual in buscada or buscada in actual:
                    similitud = max(similitud, 0.85)
                if similitud > puntaje:
                    mejor, puntaje = categoria, similitud
        resultado = mejor if puntaje >= 0.6 else None
        self._cache_seccion[seccion] = resultado
        return resultado

    # --- busqueda ---

    def _mismo_precio(self, lista_usd, producto):
        if lista_usd is None or producto.precio_lista_usd is None:
            return 0
        return 1 if abs(lista_usd - producto.precio_lista_usd) < Decimal('0.02') else 0

    def buscar(self, nombre, seccion, lista_usd, calidad=''):
        """(producto, confianza, candidatos).

        `confianza` es 'exacta' o 'aproximada'. Si no se puede decidir, devuelve
        (None, None, candidatos) — con candidatos vacio significa que el
        producto no esta en el catalogo.

        `calidad` solo llega cuando la planilla la dice en una columna (MODULOS).
        Cuando llega, manda: un producto de OTRA calidad no es este por mas
        parecido que sea el nombre. Sin esa regla "11 PRO Calidad Apple" se
        pegaria por parecido a "11 PRO Calidad certificada" —dos productos distintos
        que solo se diferencian en una palabra— y el conteo de uno terminaria
        escrito en el otro.
        """
        buscada = clave(nombre)
        pedida = clave(calidad)
        categoria = self.categoria_de_seccion(seccion)
        candidatos = list(self.por_clave.get(buscada, ()))
        if pedida:
            candidatos = [p for p in candidatos if clave(p.calidad) == pedida]
        # La seccion desempata: si hay candidatos ahi, los de otras secciones
        # sobran. Si no hay ninguno, se aceptan los de afuera (la planilla junta
        # en una seccion cosas que el catalogo separo, ej. cables dentro de
        # "FUENTES DE CARGA").
        if categoria:
            propios = [p for p in candidatos if self.raiz_de_producto[p.id] == categoria.id]
            if propios:
                candidatos = propios
        if len(candidatos) > 1:
            puntuados = sorted(
                (
                    (
                        self._mismo_precio(lista_usd, p),
                        difflib.SequenceMatcher(None, buscada, self.ficha[p.id]).ratio(),
                        -p.id,
                        p,
                    )
                    for p in candidatos
                ),
                reverse=True,
            )
            primero, segundo = puntuados[0], puntuados[1]
            if primero[0] > segundo[0] or primero[1] - segundo[1] >= MARGEN_DESEMPATE:
                candidatos = [primero[3]]
        if len(candidatos) == 1:
            return candidatos[0], 'exacta', []
        if len(candidatos) > 1:
            return None, None, candidatos

        # Sin coincidencia exacta: parecido de texto, con un empujon si la fila
        # cae en la categoria de su seccion o si el precio de lista coincide.
        numeros = _numeros(nombre)
        mejor, puntaje = None, 0.0
        for cercana in difflib.get_close_matches(buscada, self.claves, n=8, cutoff=0.78):
            # Dos nombres que solo difieren en un numero (256GB vs 512GB, 1M vs
            # 2M) NO son el mismo producto por mas parecido que sea el texto.
            if _numeros(cercana) != numeros:
                continue
            base = difflib.SequenceMatcher(None, buscada, cercana).ratio()
            for producto in self.por_clave[cercana]:
                if pedida and clave(producto.calidad) != pedida:
                    continue
                total = base
                if categoria and self.raiz_de_producto[producto.id] == categoria.id:
                    total += 0.10
                total += 0.05 * self._mismo_precio(lista_usd, producto)
                if total > puntaje:
                    mejor, puntaje = producto, total
        if mejor is not None and puntaje >= UMBRAL_APROXIMADA:
            return mejor, 'aproximada', []
        return None, None, []


# ===== Analisis =====

def _detalle(producto):
    partes = [producto.marca, producto.calidad, producto.nota]
    return ' · '.join(p for p in partes if p)


def _resumen_producto(producto, indice):
    return {
        'id': producto.id,
        'nombre': producto.nombre,
        'detalle': _detalle(producto),
        'categoria': indice.raiz(producto.categoria_id).nombre,
    }


def analizar(archivo, sucursal):
    """El diff completo de la planilla contra el stock de una sucursal.

    No escribe nada. Devuelve `{'filas': [...], 'resumen': {...}}` donde cada
    fila dice en que estado quedo y por que, con la cantidad de antes y la de
    despues para que se pueda revisar item por item.
    """
    crudas = leer_planilla(archivo)
    if not crudas:
        raise ValidationError(
            'La planilla no tiene filas de producto. Revisá que sea la planilla '
            'del negocio y que esté guardada con los valores calculados.'
        )

    indice = IndiceCatalogo()
    actuales = {
        fila.producto_id: fila
        for fila in StockProducto.objects.filter(sucursal=sucursal, producto__borrado=False)
    }

    filas = []
    resumen = defaultdict(int)
    unidades_antes = unidades_despues = 0
    for cruda in crudas:
        cantidad, motivo = _cantidad(cruda['stock_crudo'])
        minimo, _ = _cantidad(cruda['minimo_crudo'])
        producto, confianza, candidatos = indice.buscar(
            cruda['nombre'], cruda['seccion'], cruda['lista_usd'], cruda['calidad'],
        )
        categoria = indice.categoria_de_seccion(cruda['seccion'])
        actual = actuales.get(producto.id) if producto is not None else None

        fila = {
            'fila': cruda['fila'],
            'seccion': cruda['seccion'],
            'nombre_planilla': cruda['nombre'],
            # Como se daria de alta si no existe: MODULOS trae la calidad en
            # una columna, asi que el alta es "11 PRO" + "Calidad certificada" y no
            # un producto llamado "11 PRO Calidad certificada".
            'nombre_base': cruda['nombre_base'],
            'calidad': cruda['calidad'],
            'confianza': confianza,
            'producto': producto.id if producto is not None else None,
            'producto_nombre': producto.nombre if producto is not None else '',
            'producto_detalle': _detalle(producto) if producto is not None else '',
            'categoria': (
                indice.raiz(producto.categoria_id).nombre if producto is not None
                else (categoria.nombre if categoria else '')
            ),
            'categoria_id': (
                indice.raiz(producto.categoria_id).id if producto is not None
                else (categoria.id if categoria else None)
            ),
            'cantidad_actual': actual.cantidad if actual else (0 if producto is not None else None),
            'sin_dato_actual': bool(actual.sin_dato and actual.cantidad == 0) if actual else True,
            'cantidad_nueva': cantidad,
            'minimo_actual': actual.stock_minimo if actual else None,
            'minimo_nuevo': minimo,
            'lista_usd': str(cruda['lista_usd']) if cruda['lista_usd'] is not None else None,
            'candidatos': [_resumen_producto(p, indice) for p in candidatos],
            # Otras filas de la planilla que caen en el MISMO producto (se
            # completa al final, cuando ya estan todas leidas).
            'duplicada_con': [],
            'motivo': '',
        }

        if cruda['columna_ocupada']:
            fila['estado'] = 'invalida'
            fila['motivo'] = (
                'En esta sección la planilla usa la columna STOCK para los precios '
                '(CO/AO), no para unidades.'
            )
        elif motivo:
            fila['estado'] = 'invalida'
            fila['motivo'] = motivo
        elif cantidad is None:
            fila['estado'] = 'sin_valor'
            fila['motivo'] = 'La planilla no informa cantidad para esta fila.'
        elif candidatos:
            fila['estado'] = 'revisar'
            fila['motivo'] = (
                f'Hay {len(candidatos)} productos con este nombre: elegí cuál es.'
            )
        elif producto is None:
            fila['estado'] = 'nueva'
            fila['motivo'] = (
                'No está en el catálogo.' if categoria else
                'No está en el catálogo y su sección no coincide con ninguna categoría: '
                'hay que crearlo a mano.'
            )
        elif actual is not None and actual.cantidad == cantidad and not fila['sin_dato_actual'] and (
            minimo is None or actual.stock_minimo == minimo
        ):
            fila['estado'] = 'igual'
        else:
            fila['estado'] = 'actualiza'

        # Marcada por defecto: solo lo que cambia algo y no necesita decision.
        # Lo demas se puede marcar a mano, pero nunca entra solo.
        fila['sugerido'] = fila['estado'] == 'actualiza'
        fila['puede_crear'] = fila['estado'] == 'nueva' and fila['categoria_id'] is not None

        resumen[fila['estado']] += 1
        if fila['estado'] == 'actualiza':
            anterior = fila['cantidad_actual'] or 0
            unidades_antes += anterior
            unidades_despues += cantidad
            if cantidad > anterior:
                resumen['sube'] += 1
            elif cantidad < anterior:
                resumen['baja'] += 1
            else:
                # Misma cantidad, pero deja de figurar "(no informado)".
                resumen['confirma'] += 1
        filas.append(fila)

    # La planilla puede ser mas fina que el catalogo: "8" y "8+" son dos
    # renglones distintos alla y un solo producto "8 / 8+" aca. Si dos filas
    # caen en el mismo producto no se puede aplicar las dos (una pisaria a la
    # otra sin que nadie lo vea): se marcan y las decide quien revisa.
    por_producto = defaultdict(list)
    for fila in filas:
        if fila['producto'] and fila['estado'] in ('actualiza', 'igual'):
            por_producto[fila['producto']].append(fila)
    for hermanas in por_producto.values():
        if len(hermanas) < 2:
            continue
        resumen['duplicada'] += len(hermanas)
        numeros = [f['fila'] for f in hermanas]
        for fila in hermanas:
            otras = [str(n) for n in numeros if n != fila['fila']]
            fila['duplicada_con'] = [n for n in numeros if n != fila['fila']]
            fila['sugerido'] = False
            fila['motivo'] = (
                f'La fila {", ".join(otras)} de la planilla apunta al mismo producto '
                'del catálogo: dejá marcada una sola.'
            )

    matcheados = {f['producto'] for f in filas if f['producto']}
    return {
        'filas': filas,
        'resumen': {
            'filas': len(filas),
            'actualiza': resumen['actualiza'],
            'sube': resumen['sube'],
            'baja': resumen['baja'],
            'confirma': resumen['confirma'],
            'igual': resumen['igual'],
            'nueva': resumen['nueva'],
            'revisar': resumen['revisar'],
            'duplicada': resumen['duplicada'],
            'sin_valor': resumen['sin_valor'],
            'invalida': resumen['invalida'],
            'unidades_antes': unidades_antes,
            'unidades_despues': unidades_despues,
            'catalogo_sin_planilla': max(len(indice.productos) - len(matcheados), 0),
        },
    }


# ===== Aplicacion =====

def _crear_producto(datos, usuario):
    """Da de alta en el catalogo un producto que la planilla trae y no existia.

    Nace con lo unico que la planilla sabe: nombre, categoria de su seccion y
    precio de lista en dolares (los demas precios los deriva el catalogo, como
    con cualquier producto). Se suma la calidad cuando la planilla la trae en
    una columna (MODULOS: CC / CO / CA), porque ahi si la sabe y sin ella los
    tres modulos de un mismo modelo serian el mismo producto. Lo fino —marca,
    notas— se completa despues desde Productos.
    """
    categoria = datos['categoria']
    ultimo = Producto.objects.filter(categoria=categoria).aggregate(m=Max('orden'))['m'] or 0
    return Producto.objects.create(
        categoria=categoria,
        nombre=datos['nombre'][:200],
        calidad=(datos.get('calidad') or '')[:60],
        precio_lista_usd=datos.get('lista_usd'),
        orden=ultimo + 1,
        creado_por=usuario,
        actualizado_por=usuario,
    )


def aplicar(sucursal, items, *, usuario=None, nota=''):
    """Escribe las filas elegidas: crea los productos nuevos y fija el stock.

    Todo o nada (una sola transaccion): si una fila falla no queda media
    planilla aplicada. Cada cambio de cantidad deja su movimiento en el kardex
    con la nota de la importacion, asi despues se puede ver de donde salio.
    """
    nota = (nota or 'Importacion por sucursal')[:200]
    actualizados = creados = sin_cambio = 0
    delta_total = 0
    detalle = []

    with transaction.atomic():
        for item in items:
            producto = item.get('producto')
            if producto is None:
                producto = _crear_producto(item['crear'], usuario)
                creados += 1
            fila, movimiento = aplicar_ajuste(
                producto, sucursal,
                cantidad=item['cantidad'],
                tipo=MovimientoStock.Tipo.AJUSTE,
                nota=nota,
                usuario=usuario,
            )
            if 'stock_minimo' in item:
                fila.stock_minimo = item['stock_minimo']
                fila.actualizado_por = usuario
                fila.save(update_fields=['stock_minimo', 'actualizado_por'])
            if movimiento is not None:
                actualizados += 1
                delta_total += movimiento.delta
            else:
                sin_cambio += 1
            detalle.append({
                'producto': producto.id,
                'nombre': producto.nombre,
                'cantidad': fila.cantidad,
                'delta': movimiento.delta if movimiento else 0,
            })

    return {
        'actualizados': actualizados,
        'creados': creados,
        'sin_cambio': sin_cambio,
        'unidades_delta': delta_total,
        'detalle': detalle,
    }
