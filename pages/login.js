import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getSessionFromReq } from '../lib/auth'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (res.ok) {
        router.push('/')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Login failed')
      }
    } catch (err) {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 bg-aura px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 via-violet-500/10 to-gold-500/20 font-serif text-sm text-emerald-300">
            SB
          </div>
          <p className="label mb-2">Welcome back</p>
          <h1 className="font-serif text-4xl font-light text-gradient">Second Brain</h1>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-7">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mist-400">Email</label>
            <input
              className="input"
              type="text"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@domain"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mist-400">Password</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full !py-2.5">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-mist-400">
          No account yet?{' '}
          <Link href="/register" className="text-emerald-400 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = getSessionFromReq(context.req)
  if (session) {
    return { redirect: { destination: '/', permanent: false } }
  }
  return { props: {} }
}
