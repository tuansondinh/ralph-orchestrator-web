import { useState } from 'react'

interface SignInPageProps {
  errorMessage: string | null
  isSubmitting: boolean
  onSubmit: (credentials: { email: string; password: string }) => Promise<void>
}

export function SignInPage({
  errorMessage,
  isSubmitting,
  onSubmit
}: SignInPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const disabled =
    isSubmitting || email.trim().length === 0 || password.trim().length === 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/80">
          Cloud Workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-50">
          Sign In to Ralph
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Use your Supabase email and password to access your cloud projects.
        </p>

        <form
          className="mt-8 space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit({
              email,
              password
            })
          }}
        >
          <label className="block text-sm font-medium text-zinc-200" htmlFor="cloud-auth-email">
            Email address
          </label>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400"
            id="cloud-auth-email"
            onChange={(event) => {
              setEmail(event.target.value)
            }}
            type="email"
            value={email}
          />

          <label className="block text-sm font-medium text-zinc-200" htmlFor="cloud-auth-password">
            Password
          </label>
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400"
            id="cloud-auth-password"
            onChange={(event) => {
              setPassword(event.target.value)
            }}
            type="password"
            value={password}
          />

          {errorMessage ? (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
            disabled={disabled}
            type="submit"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
