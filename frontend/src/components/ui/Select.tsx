import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn, normalizarBusqueda } from '@/lib/utils'

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

/**
 * Select de selección única con buscador opcional. El panel es `absolute`
 * (left-0/right-0), así se adapta al ancho del disparador y es 100% responsive.
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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = useMemo(() => {
    if (!searchable) return options
    const normalized = normalizarBusqueda(search.trim())
    if (!normalized) return options
    return options.filter((option) => normalizarBusqueda(option.label).includes(normalized))
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

  function selectValue(next: string) {
    onChange(next)
    setIsOpen(false)
  }

  return (
    <div ref={wrapperRef} className={cn('relative min-w-0', className)}>
      {label && (
        <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
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
        <div className="ct-dropdown absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_18px_50px_rgba(10,10,11,0.16)]">
          {searchable && (
            <div className="border-b border-line p-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 pl-9"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1.5" role="listbox">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value
                return (
                  <button
                    type="button"
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectValue(option.value)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-ink-50',
                      isSelected ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-700',
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
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
