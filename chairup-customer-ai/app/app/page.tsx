'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Page() {
  const router = useRouter()
  const [locLoading, setLocLoading] = useState(false)

  function useMyLocation() {
    if (!('geolocation' in navigator)) return alert('Location not supported on this device.')
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        router.push(`/app?lat=${latitude}&lng=${longitude}`)
      },
      (err) => {
        console.error(err)
        alert('Could not get location. Please allow permissions and try again.')
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-slate-900 to-slate-700" />
        <div className="relative px-6 md:px-10 py-12 md:py-16 text-white">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Find a barber nearby.<br />Book in seconds.
          </h1>
          <p className="mt-3 max-w-2xl text-white/80">
            ChairUp learns your style, shows real availability, and sends a calendar invite.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app" className="btn bg-white text-black">Start booking</Link>
            <button onClick={useMyLocation} className="btn" disabled={locLoading}>
              {locLoading ? 'Locating…' : 'Use my location'}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
              AI style matcher
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
              Live availability
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
              Calendar invite
            </span>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold">Describe your cut</h3>
          <p className="text-sm text-slate-600 mt-1">
            Tell our AI “mid-skin fade, textured top” — we’ll suggest the right service instantly.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold">Pick your barber</h3>
          <p className="text-sm text-slate-600 mt-1">
            Browse barbers near you and see exactly when they’re free.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold">Book & go</h3>
          <p className="text-sm text-slate-600 mt-1">
            Confirm in one click, pay if needed, and get an .ics invite.
          </p>
        </div>
      </section>
    </div>
  )
}

