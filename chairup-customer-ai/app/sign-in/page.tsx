'use client'
import { supabase } from '@/lib/supabaseClient'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { useEffect } from 'react'
export default function SignInPage() {
  useEffect(()=>{
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((e)=>{
      if(e==='SIGNED_IN') window.location.href='/app'
    })
    return ()=>subscription.unsubscribe()
  },[])
  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-3">Welcome</h1>
      <p className="text-sm text-slate-600 mb-6">Sign up / Sign in with email or magic link.</p>
      <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]} />
    </div>
  )
}
