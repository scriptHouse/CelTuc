/**
 * Exportador genérico de gestores — el PDF, listo para bajar.
 *
 * La plantilla vive en `pdfDocumento.tsx`; acá solo se la renderiza a un Blob.
 * La separación no es capricho: este módulo se carga con `import()` recién
 * cuando alguien exporta, así @react-pdf (1,4 MB) nunca entra al bundle de las
 * pantallas.
 */
import { pdf } from '@react-pdf/renderer'
import { TablaPdf } from './pdfDocumento'
import type { DatasetTabla } from './datos'

export async function construirPdfTabla<T>(dataset: DatasetTabla<T>): Promise<Blob> {
  return pdf(<TablaPdf dataset={dataset} />).toBlob()
}
