/**
 * Checkbox con etiqueta al lado, para los flags de los editores de catálogo
 * («A pedido», «Producto nuevo», «No detallar en la factura»…).
 */
export function CampoBooleano({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string
  valor: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line-strong accent-ink-950"
      />
      {etiqueta}
    </label>
  )
}
