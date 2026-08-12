/**
 * Exportador de Inventario — el PDF, listo para bajar.
 *
 * La plantilla vive en `pdfDocumento.tsx`; acá solo se la renderiza a un Blob.
 * La separación no es capricho: este módulo se carga con `import()` recién
 * cuando alguien exporta, así @react-pdf (1,4 MB) nunca entra al bundle de la
 * pantalla de Inventario.
 */
import { pdf } from '@react-pdf/renderer'
import { InventarioPdf } from './pdfDocumento'
import type { Dataset } from './datos'

export async function construirPdf(dataset: Dataset): Promise<Blob> {
  return pdf(<InventarioPdf dataset={dataset} />).toBlob()
}
