import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'

function resolveRedirectTarget(state: unknown) {
  if (
    state &&
    typeof state === 'object' &&
    'from' in state &&
    typeof state.from === 'string' &&
    state.from.startsWith('/')
  ) {
    return state.from
  }

  return '/'
}

export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTarget = useMemo(
    () => resolveRedirectTarget(location.state),
    [location.state]
  )

  useEffect(() => {
    if (user) {
      navigate(redirectTarget, { replace: true })
    }
  }, [navigate, redirectTarget, user])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await signIn({ email: email.trim(), password })
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Sign-in failed.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6 shadow-2xl shadow-black/30">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-300/80">
            Cloud mode
          </p>
          <h1 className="text-3xl font-semibold text-zinc-50">Sign in</h1>
          <p className="text-sm text-zinc-400">
            Use your Supabase email and password to open the Ralph cloud shell.
          </p>
        </header>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="flex flex-col gap-1 text-sm text-zinc-200">
            Email
            <input
              autoComplete="email"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none transition focus:border-amber-400"
              onChange={(event) => {
                setEmail(event.target.value)
              }}
              type="email"
              value={email}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-200">
            Password
            <input
              autoComplete="current-password"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none transition focus:border-amber-400"
              onChange={(event) => {
                setPassword(event.target.value)
              }}
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? (
            <p className="text-sm text-red-300" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="w-full rounded-md bg-amber-400 px-4 py-2 font-medium text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoading || isSubmitting}
            type="submit"
          >
            {isLoading ? 'Checking session...' : isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  )
}
