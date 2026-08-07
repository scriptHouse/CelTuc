import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ConfirmOptions, ConfirmResult } from '@/components/ui/ConfirmDialog'

/**
 * Reemplazo de `window.confirm` con el modal de la app:
 *   const confirm = useConfirm()
 *   const ok = await confirm({ title: '¿Eliminar?', tone: 'danger' })
 *   if (!ok) return
 *
 * Con `secundariaLabel` aparece un tercer botón y la promesa puede resolver
 * `'secundaria'`. Sin esa opción nunca se devuelve ese valor.
 */

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [open, setOpen] = useState(false)
  const resolverRef = useRef<((value: ConfirmResult) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((nextOptions) => {
    resolverRef.current?.(false)
    setOptions(nextOptions)
    setOpen(true)
    return new Promise<ConfirmResult>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const resolve = useCallback((result: ConfirmResult) => {
    setOpen(false)
    resolverRef.current?.(result)
    resolverRef.current = null
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog open={open} options={options ?? undefined} onResolve={resolve} />
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>.')
  return ctx
}
