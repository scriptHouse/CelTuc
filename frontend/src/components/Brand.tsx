import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * Identidad de CelTuc, recreada con tipografía del front (Inter) + el logotipo
 * de Apple en SVG (la marca vende productos Apple). "cel" en fino y "tuc" en
 * negrita, igual que el logo original.
 *
 * Nota: el isotipo de Apple es marca registrada de Apple Inc.
 */

// Silueta clásica del logotipo de Apple (viewBox 0 0 814 1000).
const APPLE_PATH =
  'M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z'

/** Logotipo de Apple suelto (hereda el color del texto vía currentColor). */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 814 1000" className={className} fill="currentColor" aria-hidden="true">
      <path d={APPLE_PATH} />
    </svg>
  )
}

/** Isotipo compacto: mosaico negro con la manzana blanca (favicon / sidebar colapsado). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0a0a0b" />
      <path transform="translate(19 16) scale(0.032)" d={APPLE_PATH} fill="#ffffff" />
    </svg>
  )
}

// "cel" fino + "tuc" negrita.
const PARTES = [
  { ch: 'c', bold: false },
  { ch: 'e', bold: false },
  { ch: 'l', bold: false },
  { ch: 't', bold: true },
  { ch: 'u', bold: true },
  { ch: 'c', bold: true },
]

/**
 * Wordmark "celtuc " — las letras "se escriben" al entrar (respeta
 * reduced-motion). `showApple` permite ocultar la manzana cuando ya se muestra
 * el isotipo al lado (ej. en el login).
 */
export function BrandWordmark({
  className,
  showApple = true,
}: {
  className?: string
  showApple?: boolean
}) {
  return (
    <span
      className={cn('brand-wordmark inline-flex items-center tracking-[-0.04em] text-ink-950', className)}
      aria-label="celtuc"
    >
      {PARTES.map((p, i) => (
        <span
          key={`${p.ch}-${i}`}
          aria-hidden="true"
          style={{ '--letter-index': i } as CSSProperties}
          className={p.bold ? 'font-extrabold' : 'font-light'}
        >
          {p.ch}
        </span>
      ))}
      {showApple && (
        <span
          aria-hidden="true"
          style={{ '--letter-index': PARTES.length } as CSSProperties}
          className="ml-[0.22em]"
        >
          <AppleLogo className="block h-[0.72em] w-auto -translate-y-[0.04em]" />
        </span>
      )}
    </span>
  )
}
