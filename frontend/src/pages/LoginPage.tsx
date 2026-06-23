import { useState } from 'react'
import type { ComponentType } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, TriangleAlert, User } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BrandMark, BrandWordmark } from '@/components/Brand'
import { cn } from '@/lib/utils'

const schema = z.object({
  identifier: z.string().trim().min(1, 'Ingresá tu email o nombre de usuario'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})
type FormValues = z.infer<typeof schema>

/**
 * Login real contra el backend. Un solo campo de identificación acepta el email
 * O el nombre de usuario; el backend resuelve cuál es. Pensado mega-responsive:
 * `100dvh`, inputs de 16px en móvil (evita el zoom de iOS), targets táctiles
 * amplios y áreas seguras (notch).
 */
export function LoginPage() {
  const usuario = useAuth((s) => s.usuario)
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '' },
  })

  // Si ya hay sesión, no mostramos el login.
  if (usuario) return <Navigate to={from} replace />

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      await login(values.identifier, values.password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setFormError('Demasiados intentos. Esperá un momento e intentá de nuevo.')
      } else if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('No se pudo iniciar sesión. Intentá de nuevo.')
      }
    }
  }

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-canvas px-5 py-10 sm:px-6">
      {/* Fondo decorativo, sutil y monocromático. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(80% 60% at 50% 0%, var(--ct-dot), transparent 70%), radial-gradient(circle at 1px 1px, var(--ct-dot) 1px, transparent 0)',
          backgroundSize: 'auto, 28px 28px',
        }}
      />

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Marca */}
        <div className="flex flex-col items-center text-center">
          <BrandMark className="h-16 w-16 rounded-[1.25rem] shadow-[0_18px_45px_rgba(10,10,11,0.25)]" />
          <BrandWordmark showApple={false} className="mt-5 text-[2.4rem] leading-none sm:text-[2.6rem]" />
          <p className="mt-2.5 text-sm text-ink-500">Software de gestión · ingresá a tu cuenta</p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-4 text-left">
          <Field
            id="identifier"
            label="Email o nombre de usuario"
            icon={User}
            error={errors.identifier?.message}
          >
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              placeholder="tu@email.com o tu usuario"
              aria-invalid={!!errors.identifier}
              aria-describedby={errors.identifier ? 'identifier-error' : undefined}
              className="pl-11 text-base sm:text-sm"
              {...register('identifier')}
            />
          </Field>

          <Field
            id="password"
            label="Contraseña"
            icon={Lock}
            error={errors.password?.message}
          >
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className="pl-11 pr-11 text-base sm:text-sm"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </Field>

          {formError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-line-strong bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" strokeWidth={2} />
              <span>{formError}</span>
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingresando…
              </>
            ) : (
              <>
                Ingresar
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>

      <p className="absolute inset-x-0 bottom-6 text-center text-xs text-ink-300">
        CelTuc · Tucumán, Argentina
      </p>
    </div>
  )
}

/** Campo del formulario: etiqueta + ícono a la izquierda + el control + error. */
function Field({
  id,
  label,
  icon: Icon,
  error,
  children,
}: {
  id: string
  label: string
  icon: ComponentType<LucideProps>
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
        {label}
      </label>
      <div className="relative">
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          strokeWidth={1.85}
        />
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} className={cn('mt-1.5 text-xs text-ink-500')}>
          {error}
        </p>
      )}
    </div>
  )
}
