/**
 * Post-procesado del XLSX que arma ExcelJS, para que el archivo salga 100 %
 * válido según el esquema OOXML (verificado con el validador oficial de
 * Microsoft, DocumentFormat.OpenXml: 0 errores).
 *
 * ¿Por qué hace falta? ExcelJS 4.4 escribe tres cosas fuera de norma que el
 * Excel de escritorio perdona pero un visor estricto (Excel para la web, que
 * es lo que usa el negocio) puede castigar «reparando» el libro y dejando la
 * hoja vacía:
 *
 *  · En `styles.xml`, los hijos de cada `<font>` van fuera de orden
 *    (`<sz>` después de `<color>`; el esquema exige b, i, …, sz, color, name).
 *  · En los drawings, `<xdr:oneCellAnchor editAs="…">`: ese atributo no existe
 *    en `oneCellAnchor` (es de `twoCellAnchor`).
 *  · En `workbook.xml`, las áreas de impresión con la fila relativa
 *    (`$A1:$G52`); Excel las escribe absolutas (`$A$1:$G$52`).
 *
 * Este módulo abre el zip ya generado, corrige esas tres cosas con cirugía de
 * texto (los XML de ExcelJS son estables) y lo vuelve a armar. Si algo no
 * matchea, deja la parte como estaba: nunca puede romper un archivo sano.
 */
import JSZip from 'jszip'

/** El orden que exige CT_Font para los hijos de `<font>` (ECMA-376 §18.8.22). */
const ORDEN_FONT = [
  'b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow',
  'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme',
]

/** Reordena los hijos de cada `<font>` de styles.xml al orden del esquema. */
export function ordenarFuentes(xml: string): string {
  return xml.replace(/<font>([\s\S]*?)<\/font>/g, (todo, inner: string) => {
    const hijos = inner.match(/<[^>]+?\/>/g)
    // Si el contenido no son solo nodos hoja (caso inesperado), no se toca.
    if (!hijos || hijos.join('') !== inner) return todo
    const rango = (hoja: string) => {
      const m = /^<(\w+)/.exec(hoja)
      const i = m ? ORDEN_FONT.indexOf(m[1]) : -1
      return i === -1 ? ORDEN_FONT.length : i
    }
    const ordenados = hijos
      .map((hoja, i) => [rango(hoja), i, hoja] as const)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .map((x) => x[2])
    return `<font>${ordenados.join('')}</font>`
  })
}

/** Saca el atributo `editAs` de los `<xdr:oneCellAnchor>` (no existe ahí). */
export function quitarEditAsInvalido(xml: string): string {
  return xml.replace(/(<xdr:oneCellAnchor)\s+editAs="[^"]*"/g, '$1')
}

/** `$A1:$G52` → `$A$1:$G$52` en las áreas de impresión de workbook.xml. */
export function absolutizarImpresion(xml: string): string {
  return xml.replace(
    /(<definedName name="_xlnm\.Print_(?:Area|Titles)"[^>]*>)([^<]+)(<\/definedName>)/g,
    (_todo, abre: string, ref: string, cierra: string) =>
      abre + ref.replace(/\$([A-Z]+)(\d+)/g, '$$$1$$$2') + cierra,
  )
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Aplica las tres correcciones sobre el buffer que devolvió ExcelJS. */
export async function sanearXlsx(datos: ArrayBuffer | Uint8Array): Promise<Blob> {
  const zip = await JSZip.loadAsync(datos)

  const editar = async (ruta: string, transformar: (xml: string) => string) => {
    const entrada = zip.file(ruta)
    if (!entrada) return
    zip.file(ruta, transformar(await entrada.async('string')))
  }

  await editar('xl/styles.xml', ordenarFuentes)
  await editar('xl/workbook.xml', absolutizarImpresion)
  for (const ruta of Object.keys(zip.files)) {
    if (/^xl\/drawings\/drawing\d+\.xml$/.test(ruta)) {
      await editar(ruta, quitarEditAsInvalido)
    }
  }

  const salida = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  // La copia fija el tipo a Uint8Array<ArrayBuffer> (BlobPart estricto de TS).
  return new Blob([new Uint8Array(salida)], { type: MIME_XLSX })
}
