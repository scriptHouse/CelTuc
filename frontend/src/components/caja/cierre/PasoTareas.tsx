import { PartyPopper } from 'lucide-react'
import type { TareaCierre } from '@/components/caja/cierre/pasos'
import { Tildable } from '@/components/caja/cierre/piezas'

/**
 * Paso «Antes de empezar»: lo que hay que hacer antes de contar la plata (el
 * cierre del posnet si hubo tarjetas, y las tareas que sumó el administrador).
 * Cada tarea se tilda tocándola entera.
 */
export function PasoTareas({
  tareas,
  hechas,
  onToggle,
}: {
  tareas: TareaCierre[]
  hechas: string[]
  onToggle: (clave: string) => void
}) {
  const completas = tareas.every((t) => hechas.includes(t.clave))

  return (
    <div className="space-y-2.5">
      {tareas.map((t, i) => (
        <Tildable
          key={t.clave}
          indice={i}
          hecho={hechas.includes(t.clave)}
          onToggle={() => onToggle(t.clave)}
          titulo={t.titulo}
          detalle={t.detalle}
        />
      ))}

      {completas && (
        <p className="animate-fade-in flex items-center justify-center gap-2 pt-2 text-sm font-medium text-ink-600">
          <PartyPopper className="h-4 w-4 text-ink-400" aria-hidden />
          ¡Todo listo! Ya podés empezar a contar.
        </p>
      )}
    </div>
  )
}
