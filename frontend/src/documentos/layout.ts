/**
 * Geometría del documento de Recepción, tomada 1:1 de la grilla del Excel.
 *
 * Las medidas están en "px naturales" (la hoja original mide 498 × 603 px a
 * 96 dpi). Tanto el preview en pantalla como el PDF parten de estos números:
 *  - HTML: se dibuja el papel a tamaño natural y un contenedor lo escala para
 *    ocupar el ancho disponible (ver `PaperScaler`).
 *  - PDF: 1 px natural = 1 pt, así el formulario entra centrado en una A4.
 *
 * Columnas Excel A–J (px = ancho_excel·7 + 5) y altos de fila (px = pt·4/3).
 */

export const NATURAL_W = 498
export const NATURAL_H = 603.3

/** Ancho de cada columna del Excel, en px naturales. */
export const COLS = { A: 11, B: 80, C: 59, D: 85, E: 53, F: 91, G: 31, H: 35, I: 32, J: 21 } as const

/** Márgenes internos del marco (columnas A y J, vacías). */
export const PAD_L = COLS.A
export const PAD_R = COLS.J
/** Ancho útil del contenido (columnas B…I). */
export const CONTENT_W = COLS.B + COLS.C + COLS.D + COLS.E + COLS.F + COLS.G + COLS.H + COLS.I // 466

/** Anchos de sub-zonas usados por el encabezado y las cajas. */
export const LEFT_BOX_W = COLS.B + COLS.C + COLS.D // 224 (RECEPCIONO / COD / TEL)
export const GAP_W = COLS.E // 53 (separación entre las dos cajas)
export const RIGHT_BOX_W = COLS.F + COLS.G + COLS.H + COLS.I // 189 (PRESUPUESTO / SEÑA / PENDIENTE)
export const RIGHT_CLUSTER_W = RIGHT_BOX_W // F…I, cluster de CUPON / FECHA
export const LABEL_F_W = COLS.F // 91 (ancho de la etiqueta CUPON N° / FECHA)
export const DATE_BOX = [COLS.G, COLS.H, COLS.I] as const // 3 cajas de la fecha

/** Altos de cada banda del formulario, en px naturales. */
export const H = {
  title: 26.8, // fila 1
  header: 79.8, // filas 2–6 (logo + datos + cupón/fecha)
  line: 18.8, // cada renglón rellenable (filas 7–10)
  spacer: 18.8, // filas vacías 11, 14, 18
  obsRow: 18.8, // filas 12–13 (OBS, 2 renglones)
  infoRow: 18.8, // filas 15–17
  diagRow: 18.8, // filas 19–20
  gSpacer: 16, // fila 21
  garantiaRow: 20, // filas 22–30
  garantiaLast: 28, // fila 31
  bottom: 9.53, // fila 32 (cierre del marco)
} as const

/** Tamaños de fuente en px naturales (= tamaño en pt del Excel · 4/3). */
export const FONT = {
  title: 18.7, // 14 pt
  celtuc: 21.3, // 16 pt
  address: 10.7, // 8 pt
  social: 12, // 9 pt
  body: 14.7, // 11 pt
  warranty: 9.3, // 7 pt
} as const

/** Grosor de los bordes (px naturales). El Excel usa "medium" en todos. */
export const FRAME = 2
export const BOX = 1.5

/** Logo y dimensiones de su recuadro en el encabezado (≈ 66 px en el Excel). */
export const LOGO = 64
export const SOCIAL_ICON = 14
