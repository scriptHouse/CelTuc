import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Escala un "papel" de tamaño fijo (`naturalW × naturalH`) para que ocupe todo
 * el ancho disponible del contenedor, conservando su proporción. Así el
 * documento se ve grande y nítido en escritorio y se achica en mobile sin
 * scroll horizontal. Los inputs internos siguen siendo funcionales.
 */
export function PaperScaler({
  naturalW,
  naturalH,
  maxScale = 1.9,
  children,
}: {
  naturalW: number
  naturalH: number
  maxScale?: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(Math.min(maxScale, el.clientWidth / naturalW))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [naturalW, maxScale])

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div style={{ height: naturalH * scale, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: naturalW,
            height: naturalH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
