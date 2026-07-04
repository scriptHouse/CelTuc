import { DollarSign } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { PageHeader } from '@/components/ui/PageHeader'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaDolar } from '@/components/AyudaContenidos'
import { GestorDolar } from '@/components/GestorDolar'

/**
 * Página del gestor de dólar: el dólar del negocio (el que calcula TODAS las
 * listas) y el blue de DolarAPI como referencia de mercado, lado a lado.
 * Editar es solo para administradores; el resto lo ve en modo lectura.
 */
export function DolarPage() {
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={DollarSign}
        eyebrow="Parámetros"
        title="Dólar"
        subtitle="El dólar del negocio con el que se calculan todas las listas, y el blue como referencia."
        className="ct-rise"
        actions={
          <AyudaInfo titulo="Cómo funciona el dólar">
            <AyudaDolar />
          </AyudaInfo>
        }
      />

      <div className="ct-rise">
        <GestorDolar soloLectura={!admin} />
      </div>
    </div>
  )
}
