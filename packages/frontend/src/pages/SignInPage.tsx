import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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

export function SignInPage({ mode = 'sign-in' }: { mode?: 'sign-in' | 'sign-up' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading, signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSignUpMode = mode === 'sign-up'

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
      if (isSignUpMode) {
        await signUp({ email: email.trim(), password })
      } else {
        await signIn({ email: email.trim(), password })
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : isSignUpMode
            ? 'Sign-up failed.'
            : 'Sign-in failed.'
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
          <h1 className="text-3xl font-semibold text-zinc-50">
            {isSignUpMode ? 'Sign up' : 'Sign in'}
          </h1>
          <p className="text-sm text-zinc-400">
            {isSignUpMode
              ? 'Create a Supabase account to access the Ralph cloud shell.'
              : 'Use your Supabase email and password to open the Ralph cloud shell.'}
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
            {isLoading
              ? 'Checking session...'
              : isSubmitting
                ? isSignUpMode
                  ? 'Signing up...'
                  : 'Signing in...'
                : isSignUpMode
                  ? 'Sign up'
                  : 'Sign in'}
          </button>

          <p className="text-center text-sm text-zinc-400">
            {isSignUpMode ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link
              className="text-amber-300 underline underline-offset-4 hover:text-amber-200"
              state={location.state}
              to={isSignUpMode ? '/sign-in' : '/sign-up'}
            >
              {isSignUpMode ? 'Sign in' : 'Sign up'}
            </Link>
          </p>
        </form>
      </section>
    </div>
  )
}
