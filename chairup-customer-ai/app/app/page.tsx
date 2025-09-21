'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Shop = { id: string; name: string; city: string | null; lat: number | null; lng: number | null }
type Barber = { id: string; user_id: string; shop_id: string }
type ProfileLite = { id: string; full_name: string | null; email: string | null }
type Service = {
  id: string; shop_id: string; barber_id: string | null;
  name: string; minutes: number; price_cents: number; active: boolean; payment_link_url?: string | null
}
type WorkingHours = { id: string; shop_id: string; dow: number; open_min: number; close_min: number }

/** FIX: Supabase join may return the nested `service` as an array (if relationship not inferred).
 *  Allow both shapes and normalize later. */
type BookingRow = {
  id: string
  starts_at: string
  service?: { minutes: number } | { minutes: number }[] | null
}

function haversineKm(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI/180
  const dLng = (b.lng - a.lng) * Math.PI/180
  const la1 = a.lat * Math.PI/180
  const la2 = b.lat * Math.PI/180
  const sinDLat = Math.sin(dLat/2), sinDLng = Math.sin(dLng/2)
  const h = sinDLat*sinDLat + Math.cos(la1)*Math.cos(la2)*sinDLng*sinDLng
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export default function CustomerApp() {
  const qs = useSearchParams()
  const qsLat = qs.get('lat'), qsLng = qs.get('lng')

  const [profileId, setProfileId] = useState('')
  const [shops, setShops] = useState<Record<string, Shop>>({})
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [services, setServices] = useState<Service[]>([])
  const [hours, setHours] = useState<Record<string, WorkingHours[]>>({}) // key = shop_id

  const [coords, setCoords] = useState<{lat:number; lng:number} | null>(null)

  const [barber, setBarber] = useState('')    // barber.id
  const [service, setService] = useState('')  // service.id
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [slots, setSlots] = useState<string[]>([])
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')

  // AI bits (optional)
  const [aiText, setAiText] = useState('')
  const [aiReply, setAiReply] = useState<{summary?:string, notes?:string} | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)

  // Load data
  useEffect(() => {
    ;(async () => {
      const { data:{ user } } = await supabase.auth.getUser()
      setProfileId(user?.id || '')

      const sj = await supabase.from('shops').select('id,name,city,lat,lng')
      const shopMap: Record<string, Shop> = {}
      ;(sj.data || []).forEach((s: any) => { shopMap[s.id] = s })
      setShops(shopMap)

      const bj = await supabase.from('barbers').select('*')
      const bs = (bj.data as Barber[]) || []
      setBarbers(bs)

      if (bs.length) {
        const ids = bs.map((b) => b.user_id)
        const pq = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
        const rec: Record<string, ProfileLite> = {}
        ;(pq.data || []).forEach((p: any) => { rec[p.id] = p })
        setProfiles(rec)
      }

      const sv = await supabase.from('services').select('*').eq('active', true)
      setServices((sv.data as Service[]) || [])
    })()
  }, [])

  // Preselect by distance if query has lat/lng
  useEffect(() => {
    if (qsLat && qsLng) setCoords({ lat: parseFloat(qsLat), lng: parseFloat(qsLng) })
  }, [qsLat, qsLng])

  // When barber changes: load that shop's working hours and pick first service
  useEffect(() => {
    (async () => {
      if (!barber) return
      const b = barbers.find((x) => x.id === barber)
      if (!b) return
      if (!hours[b.shop_id]) {
        const wh = await supabase.from('working_hours').select('*').eq('shop_id', b.shop_id).order('dow')
        setHours((prev) => ({ ...prev, [b.shop_id]: (wh.data || []) as any }))
      }
      const sv = services.filter((s) => s.barber_id === barber)
      setService(sv[0]?.id || '')
      setTime('')
    })()
  }, [barber, services]) // eslint-disable-line

  // Compute slots when service/barber/date changes
  useEffect(() => {
    (async () => {
      setSlots([])
      setTime('')
      if (!barber || !service) return
      const b = barbers.find((x) => x.id === barber)
      const s = services.find((x) => x.id === service)
      if (!b || !s) return

      const dow = selectedDate.getDay()
      const wh = hours[b.shop_id] || []
      const row = wh.find((r) => r.dow === dow)
      const openMin = row ? row.open_min : 9 * 60
      const closeMin = row ? row.close_min : 18 * 60
      const serviceMin = s.minutes

      // get bookings for that day (with minutes from joined service)
      const startISO = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).toISOString()
      const endISO = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1).toISOString()
      const { data: bk } = await supabase
        .from('bookings')
        .select('id, starts_at, service:services(minutes)')
        .eq('barber_id', b.id)
        .gte('starts_at', startISO)
        .lt('starts_at', endISO)
        .order('starts_at', { ascending: true })

      // FIX: normalize `service` whether it arrives as object or array
      const rows: BookingRow[] = (bk ?? []) as any[]
      const existing: { start: number; end: number }[] = rows.map((r) => {
        const st = new Date(r.starts_at).getTime()
        const minutes = Array.isArray(r.service)
          ? (r.service[0]?.minutes ?? 0)
          : (r.service?.minutes ?? 0)
        return { start: st, end: st + minutes * 60000 }
      })

      // build candidate slots (15-min granularity)
      const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime()
      const now = Date.now()
      const out: string[] = []
      for (let m = openMin; m + serviceMin <= closeMin; m += 15) {
        const st = dayStart + m * 60000
        const en = st + serviceMin * 60000
        // don't show past times (if today)
        if (selectedDate.toDateString() === new Date().toDateString() && st < now) continue
        // conflict?
        const clash = existing.some((ex) => !(en <= ex.start || st >= ex.end))
        if (!clash) {
          const hh = String(Math.floor(m / 60)).padStart(2, '0')
          const mm = String(m % 60).padStart(2, '0')
          out.push(`${hh}:${mm}`)
        }
      }
      setSlots(out)
    })()
  }, [barber, service, selectedDate, hours, barbers, services])

  // Sorted barbers (by distance if coords + shop lat/lng available)
  const sortedBarbers = useMemo(() => {
    if (!coords) return barbers
    return [...barbers].sort((a, b) => {
      const sa = shops[a.shop_id], sb = shops[b.shop_id]
      const da = (sa?.lat != null && sa?.lng != null) ? haversineKm(coords, { lat: sa.lat!, lng: sa.lng! }) : 1e9
      const db = (sb?.lat != null && sb?.lng != null) ? haversineKm(coords, { lat: sb.lat!, lng: sb.lng! }) : 1e9
      return da - db
    })
  }, [barbers, shops, coords])

  // Mini calendar for next 14 days
  const days = useMemo(() => {
    const a: Date[] = []
    const base = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      a.push(d)
    }
    return a
  }, [])

  function isClosed(d: Date): boolean {
    if (!barber) return false
    const b = barbers.find((x) => x.id === barber)
    if (!b) return false
    const wh = hours[b.shop_id] || []
    const row = wh.find((r) => r.dow === d.getDay())
    return !row
  }

  async function askAI() {
    if (!aiText.trim()) { setAiReply(null); return }
    setLoadingAI(true)
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiText, services: services.filter(s => s.barber_id === barber) })
      })
      const data = await resp.json()
      if (data.serviceId) setService(data.serviceId)
      setAiReply({ summary: data.summary, notes: data.notes })
    } finally {
      setLoadingAI(false)
    }
  }

  async function book() {
    const s = services.find((x) => x.id === service)
    const b = barbers.find((x) => x.id === barber)
    if (!profileId || !s || !b || !time) return alert('Sign in and complete details')

    const [hh, mm] = time.split(':').map(Number)
    const start = new Date(selectedDate)
    start.setHours(hh || 0, mm || 0, 0, 0)

    const payload = {
      p_shop_id: b.shop_id,
      p_service_id: s.id,
      p_barber_id: b.id,
      p_starts_at: start.toISOString(),
      p_notes: (aiReply?.notes || notes || null),
    }

    const rpc = await supabase.rpc('book_if_available', payload as any)
    if (rpc.error) {
      const ins = await supabase.from('bookings').insert({
        shop_id: b.shop_id, service_id: s.id, barber_id: b.id, customer_id: profileId,
        starts_at: start.toISOString(), notes: (aiReply?.notes || notes || null)
      } as any)
      if (ins.error) return alert(rpc.error.message || ins.error.message)
    }

    // ICS download
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ChairUp//EN
BEGIN:VEVENT
UID:${Date.now()}@chairup
DTSTAMP:${start.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z')}
DTSTART:${start.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z')}
SUMMARY:${s.name}
END:VEVENT
END:VCALENDAR`
    const blob = new Blob([ics], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'booking.ics'; a.click()

    if (s.payment_link_url) window.open(s.payment_link_url, '_blank')
    alert('Booked!')
  }

  const pickedService = services.find((x) => x.id === service)
  const pickedBarber = barbers.find((x) => x.id === barber)
  const pickedBarberProfile = pickedBarber ? profiles[pickedBarber.user_id] : undefined
  const barberLabel = pickedBarberProfile?.full_name || pickedBarberProfile?.email || (pickedBarber ? `Barber ${pickedBarber.id.slice(0, 6)}` : '—')
  const canBook = !!(profileId && barber && service && time)

  return (
    <div className="grid xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        {/* Nearby barbers */}
        <div className="card">
          <div className="text-sm font-medium mb-2">Barbers {coords ? 'nearby' : ''}</div>
          <div className="flex flex-wrap gap-2">
            {sortedBarbers.map((b) => {
              const p = profiles[b.user_id]
              const s = shops[b.shop_id]
              const label = (p?.full_name || p?.email || `Barber ${b.id.slice(0,6)}`) +
                (coords && s?.lat != null && s?.lng != null
                  ? ` · ${haversineKm(coords, {lat: s.lat!, lng: s.lng!}).toFixed(1)} km`
                  : '')
              return (
                <button
                  key={b.id}
                  onClick={() => setBarber(b.id)}
                  className={`chip ${barber === b.id ? 'chip-on' : 'chip-off'}`}
                >
                  {label}
                </button>
              )
            })}
            {barbers.length === 0 && <div className="text-sm text-slate-500">No barbers yet.</div>}
          </div>
          {!coords && (
            <div className="mt-3">
              <button
                className="btn"
                onClick={() => {
                  if (!('geolocation' in navigator)) return alert('Location not supported.')
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    (err) => { console.error(err); alert('Could not get location.') },
                    { enableHighAccuracy: true, timeout: 8000 }
                  )
                }}
              >
                Use my location
              </button>
            </div>
          )}
        </div>

        {/* Services + Calendar + Time */}
        <div className="card">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm font-medium mb-2">Services</div>
              <div className="flex flex-wrap gap-2">
                {services.filter((s) => s.barber_id === barber).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setService(s.id)}
                    className={`chip ${service === s.id ? 'chip-on' : 'chip-off'}`}
                  >
                    {s.name} · ${(s.price_cents / 100).toFixed(2)} · {s.minutes}m
                  </button>
                ))}
                {barber && services.filter((s) => s.barber_id === barber).length === 0 && (
                  <div className="text-sm text-slate-500">This barber has no services yet.</div>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Date</div>
              <div className="grid grid-cols-7 gap-2">
                {useMemo(() => {
                  const a: Date[] = []
                  const base = new Date()
                  for (let i = 0; i < 14; i++) {
                    const d = new Date(base)
                    d.setDate(base.getDate() + i)
                    a.push(d)
                  }
                  return a
                }, []).map((d, idx) => {
                  const isSel = d.toDateString() === selectedDate.toDateString()
                  const closed = isClosed(d)
                  return (
                    <button
                      key={idx}
                      disabled={closed}
                      onClick={() => setSelectedDate(d)}
                      className={`rounded-xl border px-2 py-3 text-xs ${isSel ? 'bg-black text-white border-black' : 'bg-white hover:bg-slate-50'} ${closed ? 'opacity-40 cursor-not-allowed' : ''}`}
                      title={closed ? 'Closed' : d.toDateString()}
                    >
                      <div className="font-semibold">
                        {d.toLocaleDateString(undefined, { weekday: 'short' })}
                      </div>
                      <div>{d.getMonth()+1}/{d.getDate()}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Time</div>
            <div className="flex flex-wrap gap-2">
              {slots.length === 0 && (
                <div className="text-sm text-slate-500">
                  {barber && service ? 'No free times for this day.' : 'Pick a barber and service to see times.'}
                </div>
              )}
              {slots.map((t) => (
                <button
                  key={t}
                  onClick={() => setTime(t)}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${time === t ? 'bg-black text-white border-black' : 'bg-white hover:bg-slate-50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI helper + notes */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">AI style assistant</div>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">optional</span>
          </div>
          <div className="text-sm text-slate-600 mb-3">
            Describe what you want (e.g., “mid-skin fade, blend the sides, 1.5″ on top”).
          </div>
          <div className="flex gap-2">
            <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 w-full" value={aiText} onChange={(e)=>setAiText(e.target.value)} placeholder="Describe your cut…" />
            <button onClick={async()=>{ await askAI() }} className="btn" disabled={loadingAI || !barber}>{loadingAI?'Thinking…':'Suggest'}</button>
          </div>
          {aiReply?.summary && (
            <div className="mt-3 p-3 rounded-xl bg-slate-50 border text-sm">
              <div className="font-medium mb-1">Suggestion</div>
              <div className="text-slate-700">{aiReply.summary}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="text-sm font-medium mb-2">Notes (optional)</div>
          <textarea className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 min-h-[100px]" value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Anything the barber should know?" />
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-6">
        <div className="card">
          <h3 className="text-lg md:text-xl font-semibold">Booking summary</h3>
          <div className="space-y-3 text-sm mt-4">
            <div className="flex justify-between"><span>Barber</span><span className="font-medium">{barberLabel}</span></div>
            <div className="flex justify-between"><span>Service</span><span className="font-medium">{pickedService?.name || '—'}</span></div>
            <div className="flex justify-between"><span>Duration</span><span className="font-medium">{pickedService?.minutes || '—'} min</span></div>
            <div className="flex justify-between"><span>Date</span><span className="font-medium">{selectedDate.toLocaleDateString()}</span></div>
            <div className="flex justify-between"><span>Time</span><span className="font-medium">{time || '—'}</span></div>
            <div className="pt-2 border-t flex justify-between text-base font-semibold">
              <span>Total</span><span>${((pickedService?.price_cents || 0) / 100).toFixed(2)}</span>
            </div>
            <button onClick={book} disabled={!canBook} className="btn w-full">
              {canBook ? 'Confirm Booking' : 'Sign in & complete details'}
            </button>
            {pickedService?.payment_link_url && (
              <div className="text-xs text-slate-500 mt-2">We’ll open the payment page after you confirm.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
