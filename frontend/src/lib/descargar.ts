/**
 * Guardar un Blob en el disco del usuario, con el nombre que corresponde.
 *
 * Es el mismo gesto en todo el módulo Documentos (exportar un PDF, bajar un
 * archivo del historial, adjuntarlo a un WhatsApp), así que vive en un solo
 * lugar: crea la URL temporal, dispara el click y la libera un rato después
 * (revocarla en el acto corta la descarga en algunos navegadores).
 */
export function descargarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
