'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    })
    setLoading(false)
    if (error) return alert(error.message)
    setSent(true)
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-2">Sign in</h1>
      <p className="text-sm text-slate-600 mb-6">
        We’ll send a one-tap magic link to your email. No password needed.
      </p>

      {sent ? (
        <div className="rounded-xl border p-4 bg-slate-50 text-sm">
          <div className="font-medium mb-1">Check your inbox</div>
          A sign-in link was sent to <b>{email}</b>. Open it on this device to continue.
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-3">
          <input
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 w-full"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn w-full" disabled={!email || loading}>
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      )}
    </div>
  )
}
