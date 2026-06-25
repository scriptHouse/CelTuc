import { writeFileSync } from 'node:fs'
import ReactPDF from '@react-pdf/renderer'
import { RecepcionPdf } from './documentos/RecepcionPdf'
import { construirRecepcionXlsx } from './documentos/recepcionXlsx'
import type { RecepcionData } from './documentos/types'

const OUT = 'C:/Users/Isaias/AppData/Local/Temp/claude/C--Users-Isaias-Desktop-Proyectos-CelTuc/61984214-9d1b-40db-9012-ad4870d1a71b/scratchpad'

const datos: RecepcionData = {
  cupon: '0123',
  fechaDia: '25',
  fechaMes: '06',
  fechaAnio: '26',
  recibiDe: 'Juan Pérez',
  equipos: 'iPhone 11 negro 128GB',
  falla: 'No enciende, posible falla de placa.',
  fallaExtra: 'Trae cargador y caja.',
  obs: 'Golpe en esquina inferior derecha.',
  recepciono: 'Mauro',
  codDesbloqueo: '1234',
  tel: '381-5551234',
  presupuesto: '45000',
  sena: '20000',
  pendiente: '25000',
  diagnostico: 'Se reemplaza pin de carga y se testea batería.',
}

await ReactPDF.renderToFile(<RecepcionPdf datos={datos} />, `${OUT}/recepcion_test.pdf`)
console.log('PDF OK')

const blob = await construirRecepcionXlsx(datos)
const buf = Buffer.from(await blob.arrayBuffer())
writeFileSync(`${OUT}/recepcion_test.xlsx`, buf)
console.log('XLSX OK', buf.length, 'bytes')
