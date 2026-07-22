import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn, coincideBusqueda, rangosBusqueda } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label?: string
  placeholder?: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  searchable?: boolean
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
}

/** Etiqueta de opción con las coincidencias de la búsqueda resaltadas. */
function EtiquetaResaltada({ label, termino }: { label: string; termino: string }) {
  const rangos = rangosBusqueda(label, termino)
  if (!rangos.length) return <>{label}</>
  const partes: ReactNode[] = []
  let cursor = 0
  rangos.forEach(([inicio, fin], indice) => {
    if (inicio > cursor) partes.push(label.slice(cursor, inicio))
    partes.push(
      <mark key={indice} className="bg-transparent font-semibold text-ink-900">
        {label.slice(inicio, fin)}
      </mark>,
    )
    cursor = fin
  })
  if (cursor < label.length) partes.push(label.slice(cursor))
  return <>{partes}</>
}

/**
 * Select de selección única con buscador opcional. El panel es `absolute`
 * (left-0/right-0), así se adapta al ancho del disparador y es 100% responsive.
 *
 * Teclado: ↓/↑ recorre opciones, Enter selecciona la resaltada, Escape cierra
 * (solo el desplegable: no burbujea al Modal). La búsqueda tolera acentos y
 * palabras en cualquier orden, y resalta las coincidencias.
 */
export function Select({
  label,
  placeholder = 'Seleccionar',
  options,
  value,
  onChange,
  searchable = false,
  searchPlaceholder = 'Buscar',
  disabled = false,
  className,
  triggerClassName,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [resaltada, setResaltada] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = useMemo(() => {
    if (!searchable) return options
    const termino = search.trim()
    if (!termino) return options
    return options.filter((option) => coincideBusqueda(option.label, termino))
  }, [options, search, searchable])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      return
    }
    if (!searchable) return
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, searchable])

  // Mantiene visible la opción resaltada al navegar con el teclado (y al
  // abrir, si la seleccionada quedó fuera del área visible de la lista).
  useEffect(() => {
    if (!isOpen || !filteredOptions.length) return
    const activa = listRef.current?.children[resaltada]
    if (activa instanceof HTMLElement) activa.scrollIntoView({ block: 'nearest' })
  }, [isOpen, resaltada, filteredOptions.length])

  // El panel es `absolute`: dentro de un contenedor con scroll (el cuerpo de
  // un modal) puede quedar cortado abajo. Al abrir, se acerca el scroll del
  // contenedor lo justo para que el desplegable se vea entero.
  useEffect(() => {
    if (!isOpen) return
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen])

  function abrir() {
    // Al abrir, el buscador está vacío: las opciones filtradas son todas.
    const indiceSeleccionada = options.findIndex((option) => option.value === value)
    setResaltada(indiceSeleccionada >= 0 ? indiceSeleccionada : 0)
    setIsOpen(true)
  }

  function cerrar() {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function selectValue(next: string) {
    onChange(next)
    cerrar()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (!isOpen) {
      // Enter/Espacio sobre el disparador ya abren vía su click nativo.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        abrir()
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setResaltada((actual) => Math.min(actual + 1, filteredOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setResaltada((actual) => Math.max(actual - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const opcion = filteredOptions[resaltada] ?? filteredOptions[0]
      if (opcion) selectValue(opcion.value)
    } else if (event.key === 'Escape') {
      // Cierra SOLO el desplegable: sin stopPropagation, un Select dentro
      // de un Modal cerraría también el modal.
      event.preventDefault()
      event.stopPropagation()
      cerrar()
    } else if (event.key === 'Tab') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} onKeyDown={handleKeyDown} className={cn('relative min-w-0', className)}>
      {label && (
        <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : abrir())}
        disabled={disabled}
        className={cn(
          'flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-left text-sm text-ink-900 transition-colors hover:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-900/12 disabled:cursor-not-allowed disabled:opacity-50',
          triggerClassName,
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={cn('min-w-0 truncate', !selectedOption && 'text-ink-400')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="ct-dropdown absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_18px_50px_rgba(10,10,11,0.16)]"
        >
          {searchable && (
            <div className="border-b border-line p-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setResaltada(0)
                  }}
                  placeholder={searchPlaceholder}
                  className="h-10 pl-9"
                />
              </div>
            </div>
          )}

          <div ref={listRef} className="max-h-64 overflow-y-auto p-1.5" role="listbox">
            {filteredOptions.length ? (
              filteredOptions.map((option, indice) => {
                const isSelected = option.value === value
                const isActive = indice === resaltada
                return (
                  <button
                    type="button"
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectValue(option.value)}
                    onMouseEnter={() => setResaltada(indice)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      isActive && 'bg-ink-50',
                      isSelected ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-700',
                    )}
                  >
                    <span className="min-w-0 truncate">
                      <EtiquetaResaltada label={option.label} termino={search} />
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-ink-900" />}
                  </button>
                )
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-ink-400">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
