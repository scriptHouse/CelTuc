"""Importacion de la lista de precios de service desde un .xlsx.

Esta pensado para que **el archivo que baja «Exportar» vuelva a entrar**: se
descarga la lista, se corrige en Excel y se vuelve a subir. Por eso el lector
entiende el formato del exportador (titulo arriba, renglon de grupo por
seccion, subtotales y TOTAL abajo, y una segunda hoja "Cómo se generó") y los
saltea solo.

Tres ideas ordenan el diseño:

1. **Las columnas no estan fijas.** El exportador deja elegir cuales bajar, asi
   que aca se reconoce cada dato por su rotulo y se trabaja con las que haya:
   con Ítem y un precio alcanza. Lo que no se reconoce se ignora, y quien
   importa puede corregir a mano de que columna sale cada dato.
2. **Celda vacia NO es cero.** Un precio que la planilla no informa no se toca.
3. **El precio en dolares manda.** Los pesos los calcula el sistema con el
   dolar del negocio; importarlos los congelaria (dejarian de seguir la
   cotizacion), asi que por defecto NO entran. La excepcion es la fila que no
   trae dolares: ahi los pesos son el unico precio que hay y si entran.

Igual que en Inventario, el analisis es de SOLO LECTURA: devuelve el diff fila
por fila y quien importa decide, item por item, que aplicar.
"""
import difflib
import math
import re
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max

from comun.planillas import (
    CENTAVO,
    celda_de,
    con_eleccion,
    encabezado_visible,
    hojas_de,
    normalizar,
    numeros_de,
)
from comun.planillas import precio as precio_planilla
from comun.planillas import texto_de as _texto

from .models import (
    ConfiguracionService,
    ItemService,
    PrecioItemService,
    SeccionService,
    VarianteSeccion,
    resolver_precios,
)

# Parecido minimo (0-1) para aceptar una coincidencia aproximada.
UMBRAL_APROXIMADA = 0.86
# Cuantas filas del principio de una hoja se miran buscando el encabezado.
FILAS_ENCABEZADO = 40

# Los datos que la planilla puede aportar. `etiqueta` es el unico imprescindible
# (sin el no hay contra que cruzar) y por eso no se puede apagar.
CAMPOS = ('etiqueta', 'seccion', 'variante', 'lista_usd', 'cash_usd', 'lista_ars', 'cash_ars')
CAMPOS_OBLIGATORIOS = ('etiqueta',)
CAMPOS_PRECIO = ('lista_usd', 'cash_usd', 'lista_ars', 'cash_ars')

# Rotulos exactos que reconoce cada dato (ya normalizados). El primero de cada
# lista es el que escribe el exportador del sistema.
ROTULOS = {
    'etiqueta': ('item', 'items', 'etiqueta', 'modelo', 'servicio', 'producto', 'productos', 'fila'),
    'seccion': ('seccion', 'secciones', 'categoria', 'grupo', 'bloque'),
    'variante': ('variante', 'variantes', 'calidad', 'calidades', 'tipo'),
    'lista_usd': ('lista usd', 'precio de lista usd', 'precio lista usd', 'lista u s', 'usd'),
    'cash_usd': ('cash usd', 'precio cash usd', 'cash u s', 'efectivo usd'),
    'lista_ars': ('lista', 'lista ars', 'lista pesos', 'precio de lista', 'precio lista', 'precio'),
    'cash_ars': ('cash', 'cash ars', 'cash pesos', 'efectivo', 'efectivo pesos'),
}

# Lo que el exportador escribe en la primera columna de las filas que NO son
# datos (el subtotal de cada grupo y el total del final).
TOTALES = ('subtotal', 'total')


# ===== Encabezado =====

def _campo_de_rotulo(rotulo):
    """Que dato trae una columna, mirando su rotulo. None si no se reconoce.

    Primero se prueba el rotulo exacto y despues, para aguantar rotulos que no
    salieron del exportador ("PRECIO DE LISTA EN DOLARES"), se mira que palabras
    tiene. Asi entra cualquier planilla parecida sin tener que enumerarla.
    """
    limpio = normalizar(rotulo)
    if not limpio:
        return None
    for campo, alias in ROTULOS.items():
        if limpio in alias:
            return campo

    partes = set(limpio.split())
    dolares = bool(partes & {'usd', 'dolar', 'dolares', 'u$s'}) or 'u s' in limpio
    cash = bool(partes & {'cash', 'efectivo', 'contado'})
    if dolares:
        return 'cash_usd' if cash else 'lista_usd'
    if cash:
        return 'cash_ars'
    if partes & {'lista', 'precio', 'precios'}:
        return 'lista_ars'
    if partes & {'seccion', 'secciones', 'categoria', 'grupo'}:
        return 'seccion'
    if partes & {'variante', 'variantes', 'calidad', 'calidades'}:
        return 'variante'
    if partes & {'item', 'items', 'etiqueta', 'modelo', 'servicio', 'producto', 'productos'}:
        return 'etiqueta'
    return None


def _columnas_de(fila):
    """El mapa de columnas de una fila de encabezado, o None si no lo es.

    Para tomarla como encabezado tiene que decir donde esta el ítem y traer al
    menos un precio: si no, es una fila de titulo o de datos.
    """
    columnas = {campo: None for campo in CAMPOS}
    for posicion, celda in enumerate(fila):
        campo = _campo_de_rotulo(celda)
        # La primera columna que aporta un dato se lo queda: si la planilla
        # repite un rotulo, manda la de la izquierda.
        if campo is not None and columnas[campo] is None:
            columnas[campo] = posicion
    if columnas['etiqueta'] is None:
        return None
    if not any(columnas[campo] is not None for campo in CAMPOS_PRECIO):
        return None
    return columnas


def _buscar_encabezado(hojas):
    """`(nombre_hoja, filas, indice, columnas)` de la primera hoja que sirve.

    El exportador agrega una hoja "Cómo se generó" y arriba de la tabla deja el
    titulo, la fecha y los filtros: por eso se recorren todas las hojas y las
    primeras filas de cada una hasta encontrar un encabezado de verdad.
    """
    for nombre, filas in hojas:
        for indice, fila in enumerate(filas[:FILAS_ENCABEZADO]):
            columnas = _columnas_de(fila)
            if columnas is not None:
                return nombre, filas, indice, columnas
    return None, None, None, None


# ===== Lectura =====

def _es_total(texto):
    """La fila del subtotal de un grupo o la del TOTAL del final."""
    limpio = normalizar(texto)
    return any(limpio == t or limpio.startswith(f'{t} ') for t in TOTALES)


# Como escribe el exportador el renglon que abre cada grupo: "Baterías  (35)".
GRUPO = re.compile(r'^(?P<titulo>.+?)\s*\(\s*\d+\s*\)\s*$')


def _titulo_de_grupo(texto):
    """El nombre de la seccion si la fila es un renglon de grupo, o None.

    Se exige el "(N)" que escribe el exportador porque si no toda fila con el
    nombre solo —un item sin precios— se leeria como si abriera una seccion, y
    a partir de ahi las de abajo se buscarian en una seccion que no existe.
    """
    encontrado = GRUPO.match(str(texto or '').strip())
    return encontrado.group('titulo').strip() if encontrado else None


def leer_planilla(archivo, elegidas=None):
    """`(filas, hoja)`: las filas de precio de la planilla y como se leyo.

    Cada fila es un dict con `fila` (el numero real en el Excel), `etiqueta`,
    `seccion` (la de su columna o, si no hay, la del renglon de grupo),
    `variante` y los cuatro precios que haya.

    Con `elegidas` se le dice de que columna sacar cada dato en vez de las que
    detecto sola; `None` en un dato lo apaga (no se importa de ninguna columna).
    """
    hojas = hojas_de(archivo)
    nombre, crudas, indice, columnas = _buscar_encabezado(hojas)
    if indice is None:
        raise ValidationError(
            'No se encontró el encabezado de la lista. Tiene que haber una fila con '
            'los títulos de las columnas: una que diga "Ítem" (o "Modelo") y al menos '
            'una de precio ("Lista USD", "Lista $"…). Si el archivo salió de '
            '«Exportar», subilo tal cual: se lee solo.'
        )

    detectadas = dict(columnas)
    columnas = con_eleccion(columnas, elegidas, CAMPOS_OBLIGATORIOS)
    hoja = {
        'nombre': nombre,
        'fila_encabezado': indice + 1,
        'encabezado': encabezado_visible(crudas[indice]),
        'columnas': dict(columnas),
        'detectadas': detectadas,
    }

    filas = []
    grupo = ''
    for numero in range(indice + 1, len(crudas)):
        cruda = crudas[numero]
        if not cruda or all(c is None or str(c).strip() == '' for c in cruda):
            continue
        primera = celda_de(cruda, columnas, 'etiqueta')
        etiqueta = str(primera or '').strip()

        # Renglon de grupo / subtotal / TOTAL: el exportador los escribe con la
        # primera celda ocupada y el resto vacio (el grupo va combinado).
        solo_la_primera = all(
            c is None or str(c).strip() == ''
            for i, c in enumerate(cruda)
            if i != (columnas['etiqueta'] or 0)
        )
        if not etiqueta or _es_total(etiqueta):
            continue
        if solo_la_primera:
            titulo = _titulo_de_grupo(etiqueta)
            if titulo:
                # Abre una seccion: manda para las filas de abajo que no traigan
                # la suya. No es una fila de precio.
                grupo = titulo
                continue
            # Un nombre solo, sin nada al lado: no cambia la seccion y entra
            # como fila sin precio, para que se vea que quedo afuera.

        seccion = str(celda_de(cruda, columnas, 'seccion') or '').strip()
        filas.append({
            'fila': numero + 1,
            'etiqueta': etiqueta,
            # La seccion sale de su columna y, si no se exporto, del renglon de
            # grupo: agrupar por seccion es justo lo que hace el exportador.
            'seccion': seccion or grupo,
            'seccion_de_grupo': not seccion and bool(grupo),
            'variante': str(celda_de(cruda, columnas, 'variante') or '').strip(),
            'lista_usd': precio_planilla(celda_de(cruda, columnas, 'lista_usd')),
            'cash_usd': precio_planilla(celda_de(cruda, columnas, 'cash_usd')),
            'lista_ars': precio_planilla(celda_de(cruda, columnas, 'lista_ars')),
            'cash_ars': precio_planilla(celda_de(cruda, columnas, 'cash_ars')),
        })
    return filas, hoja


# ===== El dolar con el que se armo la planilla =====

def _ceil_multiplo(valor, multiplo):
    multiplo = int(multiplo) or 1
    return Decimal(math.ceil(Decimal(valor) / multiplo) * multiplo)


def dolar_de_la_planilla(filas, redondeo):
    """Con que dolar se calcularon los pesos de esta planilla, o None.

    No viene escrito en ningun lado, pero se deduce: para cada fila con los dos
    precios, el dolar tiene que cumplir `ceil(usd x dolar) == pesos`. Se prueban
    los candidatos que salen de las propias filas y gana el que explica mas.
    Sirve para avisar "esta lista esta armada con otro dolar", que es la razon
    por la que los pesos del archivo no van a coincidir con los del sistema.
    """
    pares = [
        (f['lista_usd'], f['lista_ars']) for f in filas
        if f['lista_usd'] and f['lista_ars'] and f['lista_usd'] > 0
    ][:400]
    if len(pares) < 3:
        return None
    candidatos = sorted({(ars / usd).quantize(CENTAVO) for usd, ars in pares})
    mejor, aciertos = None, 0
    for candidato in candidatos:
        cuantos = sum(1 for usd, ars in pares if _ceil_multiplo(usd * candidato, redondeo) == ars)
        if cuantos > aciertos:
            mejor, aciertos = candidato, cuantos
    # Con menos de la mitad de las filas explicadas no es una cotizacion: son
    # precios cargados a mano.
    return mejor if aciertos * 2 >= len(pares) else None


# ===== Indice del catalogo =====

class IndiceService:
    """La lista de service preparada para cruzar contra la planilla."""

    def __init__(self):
        self.config = ConfiguracionService.obtener()
        self.secciones = list(
            SeccionService.objects.filter(activo=True).prefetch_related('variantes')
        )
        self.por_seccion = {normalizar(s.nombre): s for s in self.secciones}
        self.variantes = defaultdict(list)
        for seccion in self.secciones:
            for variante in seccion.variantes.all():
                self.variantes[seccion.id].append(variante)

        self.items = list(
            ItemService.objects.filter(activo=True, seccion__activo=True)
            .select_related('seccion')
            .prefetch_related('precios__variante')
        )
        self.por_clave = defaultdict(list)
        for item in self.items:
            self.por_clave[(item.seccion_id, normalizar(item.etiqueta))].append(item)
        self.claves_por_seccion = defaultdict(list)
        for (seccion_id, clave), _ in self.por_clave.items():
            self.claves_por_seccion[seccion_id].append(clave)

    # --- secciones ---

    def buscar_seccion(self, nombre):
        """La seccion que nombra la planilla (exacta o parecida), o None."""
        if not nombre:
            return None
        clave = normalizar(nombre)
        seccion = self.por_seccion.get(clave)
        if seccion is not None:
            return seccion
        cercanas = difflib.get_close_matches(clave, list(self.por_seccion), n=1, cutoff=0.80)
        return self.por_seccion[cercanas[0]] if cercanas else None

    def descuento(self, seccion):
        """El descuento cash de esa seccion: el propio o el global."""
        propio = seccion.descuento_cash_pct if seccion is not None else None
        return propio if propio is not None else self.config.descuento_cash_pct

    # --- items ---

    def buscar_item(self, etiqueta, seccion):
        """`(item, confianza, candidatos)` para una fila de la planilla.

        Con la seccion conocida se busca solo ahi (es lo normal); sin seccion se
        busca en toda la lista y, si el mismo nombre esta en dos secciones,
        vuelve como candidatos para que lo resuelva quien importa.
        """
        clave = normalizar(etiqueta)
        if not clave:
            return None, None, []

        if seccion is not None:
            candidatos = list(self.por_clave.get((seccion.id, clave), ()))
        else:
            candidatos = [
                item for (_, otra), items in self.por_clave.items() if otra == clave
                for item in items
            ]
        if len(candidatos) == 1:
            return candidatos[0], 'exacta', []
        if len(candidatos) > 1:
            return None, None, candidatos

        # Sin coincidencia exacta: parecido de texto dentro de la seccion. Dos
        # nombres que solo difieren en un numero (11 vs 12) NO son el mismo.
        claves = (
            self.claves_por_seccion[seccion.id] if seccion is not None
            else [c for _, c in self.por_clave]
        )
        numeros = numeros_de(etiqueta)
        for cercana in difflib.get_close_matches(clave, claves, n=5, cutoff=UMBRAL_APROXIMADA):
            if numeros_de(cercana) != numeros:
                continue
            if seccion is not None:
                parecidos = list(self.por_clave.get((seccion.id, cercana), ()))
            else:
                parecidos = [
                    item for (_, otra), items in self.por_clave.items() if otra == cercana
                    for item in items
                ]
            if len(parecidos) == 1:
                return parecidos[0], 'aproximada', []
            if parecidos:
                return None, None, parecidos
        return None, None, []

    # --- variantes ---

    def buscar_variante(self, item, nombre):
        """`(variante, candidatas)`: contra que calidad de la seccion va la fila.

        Sin nombre y con una sola variante, es esa (asi exporta el sistema las
        secciones simples). Con varias hay que elegir: vuelven como candidatas.
        """
        variantes = self.variantes.get(item.seccion_id, [])
        if not variantes:
            return None, []
        if nombre:
            clave = normalizar(nombre)
            exacta = [v for v in variantes if normalizar(v.nombre) == clave]
            if len(exacta) == 1:
                return exacta[0], []
            cercanas = difflib.get_close_matches(
                clave, [normalizar(v.nombre) for v in variantes], n=1, cutoff=0.80,
            )
            if cercanas:
                for variante in variantes:
                    if normalizar(variante.nombre) == cercanas[0]:
                        return variante, []
            return None, variantes
        if len(variantes) == 1:
            return variantes[0], []
        # Sin nombre pero con un solo precio cargado, es ese: el exportador deja
        # la variante vacia justamente cuando el item tiene uno solo.
        precios = list(item.precios.all())
        if len(precios) == 1:
            return precios[0].variante, []
        return None, variantes

    def precio_de(self, item, variante):
        """El `PrecioItemService` de ese cruce, o None si todavia no existe."""
        for precio in item.precios.all():
            if precio.variante_id == variante.id:
                return precio
        return None


# ===== Analisis =====

class _PrecioVacio:
    """Un precio que todavia no existe: todo en None (asi se compara igual)."""

    precio_lista_usd = precio_cash_usd = precio_lista_ars = precio_cash_ars = None


def _formula(lista_usd, config, descuento):
    """Los tres precios que el sistema deriva de una lista en dolares."""
    factor = (Decimal('100') - Decimal(descuento)) / Decimal('100')
    if lista_usd is None:
        return {'cash_usd': None, 'lista_ars': None, 'cash_ars': None}
    cash_usd = (lista_usd * factor).quantize(CENTAVO, rounding=ROUND_HALF_UP)
    lista_ars = _ceil_multiplo(lista_usd * config.dolar, config.redondeo_ars)
    return {
        'cash_usd': cash_usd,
        'lista_ars': lista_ars,
        'cash_ars': _ceil_multiplo(lista_ars * factor, config.redondeo_ars),
    }


def _precio_de_fila(cruda, precio, seccion, indice, con_pesos):
    """El antes -> despues de los cuatro precios de una fila.

    La lista en dolares se escribe tal cual. Los otros tres son OVERRIDES: se
    guardan solo cuando la planilla dice algo distinto de lo que da la formula,
    y se BORRAN cuando vuelven a coincidir (asi el precio vuelve a seguir al
    dolar y al descuento de su seccion).

    Los pesos ademas necesitan permiso (`con_pesos`), porque son un valor
    derivado: si la planilla se armo con otro dolar, importarlos congelaria toda
    la lista. La excepcion es la fila que no trae dolares: ahi los pesos son el
    unico precio que hay, y entran siempre.
    """
    descuento = indice.descuento(seccion)
    config = indice.config
    actual = resolver_precios(precio, config, descuento)

    lista_usd = cruda['lista_usd'] if cruda['lista_usd'] is not None else precio.precio_lista_usd
    solo_pesos = cruda['lista_usd'] is None and precio.precio_lista_usd is None
    pesos = con_pesos or solo_pesos

    derivado = _formula(lista_usd, config, descuento)
    objetivo = {'precio_lista_usd': lista_usd}

    # cash USD: no depende del dolar, asi que entra siempre que la planilla lo traiga.
    if cruda['cash_usd'] is not None:
        objetivo['precio_cash_usd'] = (
            None if cruda['cash_usd'] == derivado['cash_usd'] else cruda['cash_usd']
        )
    else:
        objetivo['precio_cash_usd'] = precio.precio_cash_usd

    if pesos and cruda['lista_ars'] is not None:
        objetivo['precio_lista_ars'] = (
            None if cruda['lista_ars'] == derivado['lista_ars'] else cruda['lista_ars']
        )
    else:
        objetivo['precio_lista_ars'] = precio.precio_lista_ars

    # El cash en pesos sale del lista en pesos que quede, no del de antes.
    lista_ars_final = objetivo['precio_lista_ars'] or derivado['lista_ars']
    factor = (Decimal('100') - Decimal(descuento)) / Decimal('100')
    cash_ars_derivado = (
        _ceil_multiplo(lista_ars_final * factor, config.redondeo_ars)
        if lista_ars_final is not None else None
    )
    if pesos and cruda['cash_ars'] is not None:
        objetivo['precio_cash_ars'] = (
            None if cruda['cash_ars'] == cash_ars_derivado else cruda['cash_ars']
        )
    else:
        objetivo['precio_cash_ars'] = precio.precio_cash_ars

    aplicar = {
        campo: valor for campo, valor in objetivo.items()
        if getattr(precio, campo) != valor
    }
    despues = resolver_precios(
        type('_Objetivo', (), {k: v for k, v in objetivo.items()})(), config, descuento,
    )
    ignorados = [
        campo for campo in ('lista_ars', 'cash_ars')
        if not pesos and cruda[campo] is not None and cruda[campo] != actual[campo]
    ]
    return {
        'antes': {k: _texto(v) for k, v in actual.items()},
        'despues': {k: _texto(v) for k, v in despues.items()},
        'planilla': {campo: _texto(cruda[campo]) for campo in CAMPOS_PRECIO},
        # Los precios que quedan fijados a mano (no salen de la formula).
        'fijados': [
            campo.replace('precio_', '') for campo in
            ('precio_cash_usd', 'precio_lista_ars', 'precio_cash_ars')
            if objetivo[campo] is not None
        ],
        # Precios en pesos que la planilla trae distintos y NO se van a importar.
        'ignorados': ignorados,
        'cambia': bool(aplicar),
        'aplicar': {k: _texto(v) for k, v in aplicar.items()} or None,
    }


def _opcion(item, variante, cruda, indice, con_pesos, seccion=None):
    """Un destino posible para la fila: contra que item y calidad iria.

    Trae ya calculado el antes -> despues de los cuatro precios, asi elegir un
    destino en la revision no necesita volver a preguntarle nada al servidor.
    """
    seccion = seccion or (item.seccion if item is not None else None)
    precio = indice.precio_de(item, variante) if item is not None else None
    return {
        'clave': f'{item.id if item is not None else "nueva"}:{variante.id}',
        'item': item.id if item is not None else None,
        'item_nombre': item.etiqueta if item is not None else '',
        'seccion': seccion.id if seccion is not None else None,
        'seccion_nombre': seccion.nombre if seccion is not None else '',
        'variante': variante.id,
        'variante_nombre': variante.nombre,
        # Si ya hay un precio cargado para ese cruce (si no, se crea).
        'existe': precio is not None,
        'precio': _precio_de_fila(
            cruda, precio or _PrecioVacio(), seccion, indice, con_pesos,
        ),
    }


def _destinos(cruda, item, candidatos, seccion, indice, con_pesos):
    """Todos los destinos posibles de una fila, de lo seguro a lo dudoso.

    Uno solo = la fila esta resuelta. Varios = hay que elegir en la revision.
    Ninguno = el item no esta en la lista (o no hay calidad donde ponerlo).
    """
    if item is not None:
        variante, candidatas = indice.buscar_variante(item, cruda['variante'])
        elegibles = [variante] if variante is not None else list(candidatas)
        return [_opcion(item, v, cruda, indice, con_pesos) for v in elegibles]

    if candidatos:
        salida = []
        for candidato in candidatos:
            variante, candidatas = indice.buscar_variante(candidato, cruda['variante'])
            for v in ([variante] if variante is not None else list(candidatas)):
                salida.append(_opcion(candidato, v, cruda, indice, con_pesos))
        return salida

    # No esta en la lista: los destinos son las calidades de su seccion, y cada
    # uno da de alta el item (por eso van sin `item`).
    if seccion is None:
        return []
    variantes = indice.variantes.get(seccion.id, [])
    if cruda['variante']:
        clave = normalizar(cruda['variante'])
        propias = [v for v in variantes if normalizar(v.nombre) == clave]
        if propias:
            variantes = propias
    return [_opcion(None, v, cruda, indice, con_pesos, seccion=seccion) for v in variantes]


def analizar(archivo, columnas=None, con_pesos=False):
    """El diff completo de una lista de precios de service contra el sistema.

    No escribe nada. Devuelve `{'filas': [...], 'columnas': {...},
    'resumen': {...}}`. Cada fila trae sus `opciones` —contra que item y calidad
    podria ir, con el antes -> despues de cada una— y `elegida`, la unica cuando
    no hay dudas. Asi la revision se resuelve sin volver a consultar nada.
    """
    crudas, hoja = leer_planilla(archivo, columnas)
    if not crudas:
        raise ValidationError(
            'La planilla no tiene filas de precio debajo del encabezado. Revisá que '
            'sea la lista de service y que esté guardada con los valores calculados.'
        )

    indice = IndiceService()
    filas = []
    resumen = defaultdict(int)
    vistos = defaultdict(list)

    for cruda in crudas:
        seccion = indice.buscar_seccion(cruda['seccion'])
        item, confianza, candidatos = indice.buscar_item(cruda['etiqueta'], seccion)
        if item is not None:
            seccion = item.seccion
        trae_precio = any(cruda[campo] is not None for campo in CAMPOS_PRECIO)
        opciones = (
            _destinos(cruda, item, candidatos, seccion, indice, con_pesos)
            if trae_precio else []
        )
        unica = opciones[0] if len(opciones) == 1 else None

        fila = {
            'fila': cruda['fila'],
            'etiqueta': cruda['etiqueta'],
            'seccion': cruda['seccion'],
            'seccion_de_grupo': cruda['seccion_de_grupo'],
            'variante': cruda['variante'],
            'confianza': confianza,
            'seccion_id': seccion.id if seccion is not None else None,
            'seccion_nombre': seccion.nombre if seccion is not None else '',
            'planilla': {campo: _texto(cruda[campo]) for campo in CAMPOS_PRECIO},
            'opciones': opciones,
            'elegida': unica['clave'] if unica else None,
            # El alta crea el item: hay que saber la seccion y el nombre.
            'crear': item is None and not candidatos and seccion is not None,
            'duplicada_con': [],
            'motivo': '',
        }

        if not trae_precio:
            fila['estado'] = 'sin_valor'
            fila['motivo'] = 'La planilla no informa ningún precio para esta fila.'
        elif not opciones:
            fila['estado'] = 'revisar'
            fila['motivo'] = (
                'No está en la lista y su sección no coincide con ninguna: creala '
                'primero desde Precios de service.' if seccion is None else
                'La sección no tiene ninguna calidad cargada: no hay dónde poner '
                'el precio.'
            )
        elif len(opciones) > 1:
            fila['estado'] = 'revisar'
            fila['motivo'] = (
                f'Hay {len(opciones)} lugares posibles para este precio: elegí cuál es.'
                if item is not None or candidatos else
                'No está en la lista. Elegí con qué calidad darlo de alta.'
            )
        elif unica['item'] is None:
            fila['estado'] = 'nueva'
            fila['motivo'] = 'No está en la lista: se da de alta.'
        elif unica['precio']['cambia']:
            fila['estado'] = 'actualiza'
        else:
            fila['estado'] = 'igual'

        fila['sugerido'] = fila['estado'] == 'actualiza'
        fila['puede_crear'] = any(o['item'] is None for o in opciones)
        resumen[fila['estado']] += 1
        if unica and unica['precio']['ignorados']:
            resumen['pesos_ignorados'] += 1
        if unica and unica['item'] is not None and fila['estado'] in ('actualiza', 'igual'):
            vistos[(unica['item'], unica['variante'])].append(fila)
        filas.append(fila)

    # Dos filas apuntando al MISMO precio: aplicarlas a las dos dejaria el valor
    # de la ultima, en silencio. Se marcan y decide quien revisa.
    for hermanas in vistos.values():
        if len(hermanas) < 2:
            continue
        resumen['duplicada'] += len(hermanas)
        numeros = [f['fila'] for f in hermanas]
        for fila in hermanas:
            otras = [str(n) for n in numeros if n != fila['fila']]
            fila['duplicada_con'] = [n for n in numeros if n != fila['fila']]
            fila['sugerido'] = False
            fila['motivo'] = (
                f'La fila {", ".join(otras)} de la planilla apunta al mismo precio: '
                'dejá marcada una sola.'
            )

    dolar = dolar_de_la_planilla(crudas, indice.config.redondeo_ars)
    usados = {
        o['item'] for f in filas for o in f['opciones']
        if o['item'] is not None and f['elegida'] == o['clave']
    }
    return {
        'filas': filas,
        'columnas': {
            'hoja': hoja['nombre'],
            'fila': hoja['fila_encabezado'],
            'elegidas': hoja['columnas'],
            'detectadas': hoja['detectadas'],
            'disponibles': hoja['encabezado'],
        },
        'resumen': {
            'filas': len(filas),
            'actualiza': resumen['actualiza'],
            'igual': resumen['igual'],
            'nueva': resumen['nueva'],
            'revisar': resumen['revisar'],
            'sin_valor': resumen['sin_valor'],
            'duplicada': resumen['duplicada'],
            # Filas donde la planilla trae otro precio en pesos que NO se importa.
            'pesos_ignorados': resumen['pesos_ignorados'],
            'con_pesos': con_pesos,
            # Con que dolar se armaron los pesos de la planilla (se deduce).
            'dolar_planilla': _texto(dolar),
            'dolar_negocio': _texto(indice.config.dolar),
            'items_sin_planilla': max(len(indice.items) - len(usados), 0),
        },
    }


# ===== Aplicacion =====

def _crear_item(datos, usuario):
    """Da de alta una fila de la lista que la planilla trae y no existia.

    Nace con lo unico que la planilla sabe: la seccion, el nombre y el precio.
    Los dispositivos a los que aplica —lo que la hace aparecer en el selector de
    la pagina— se completan despues desde Precios de service.
    """
    seccion = datos['seccion']
    ultimo = ItemService.objects.filter(seccion=seccion).aggregate(m=Max('orden'))['m'] or 0
    return ItemService.objects.create(
        seccion=seccion,
        etiqueta=datos['etiqueta'][:200],
        nota=(datos.get('nota') or '')[:200],
        orden=ultimo + 1,
        creado_por=usuario,
        actualizado_por=usuario,
    )


CAMPOS_ESCRIBIBLES = (
    'precio_lista_usd', 'precio_cash_usd', 'precio_lista_ars', 'precio_cash_ars',
)


def aplicar(items, *, usuario=None):
    """Escribe las filas elegidas: crea lo que falta y fija los precios.

    Todo o nada (una sola transaccion): si una fila falla no queda media lista
    aplicada. Cada cambio queda en la auditoria como cualquier edicion de la
    lista de precios.
    """
    actualizados = creados = altas = sin_cambio = 0
    detalle = []

    with transaction.atomic():
        for item in items:
            fila_item = item.get('item')
            variante = item['variante']
            if fila_item is None:
                fila_item = _crear_item(item['crear'], usuario)
                altas += 1

            precio = PrecioItemService.objects.filter(
                item=fila_item, variante=variante,
            ).first()
            valores = {
                campo: item[campo] for campo in CAMPOS_ESCRIBIBLES if campo in item
            }
            if precio is None:
                precio = PrecioItemService.objects.create(
                    item=fila_item, variante=variante,
                    creado_por=usuario, actualizado_por=usuario,
                    **valores,
                )
                creados += 1
            else:
                cambios = {
                    campo: valor for campo, valor in valores.items()
                    if getattr(precio, campo) != valor
                }
                if cambios:
                    for campo, valor in cambios.items():
                        setattr(precio, campo, valor)
                    precio.actualizado_por = usuario
                    precio.save(update_fields=[*cambios, 'actualizado_por'])
                    actualizados += 1
                else:
                    sin_cambio += 1
            detalle.append({
                'item': fila_item.id,
                'etiqueta': fila_item.etiqueta,
                'variante': variante.nombre,
                'lista_usd': _texto(precio.precio_lista_usd),
            })

    return {
        'actualizados': actualizados,
        'creados': creados,
        'altas': altas,
        'sin_cambio': sin_cambio,
        'detalle': detalle,
    }
