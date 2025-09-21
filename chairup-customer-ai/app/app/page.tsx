'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Shop = { id: string; name: string; city: string | null; lat: number | null; lng: number | null }
type Barber = { id: string; user_id: string; shop_id: string }
type ProfileLite = { id: string; full_name: string | null; email: string | null }
type Service = {
  id: string
  shop_id: string
  barber_id: string | null
  name: string
  minutes: number
  price_cents: number
  active: boolean
  payment_link_url?: string | null
}
type WorkingHours = { id: string; shop_id: string; dow: number; open_min: number; close_min: number }

/** ✅ Bookings read WITHOUT joins (no nested service object) */
type BookingRow = { id: string; starts_at: string; service_id: string | null }

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const la1 = a.lat * Math.PI / 180
  const la2 = b.lat * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2), sinDLng = Math.sin(dLng / 2)
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

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const [barber, setBarber] = useState('')    // barber.id
  const [service, setService] = useState('')  // service.id
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [slots, setSlots] = useState<string[]>([])
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')

  // AI helper (optional)
  const [aiText, setAiText] = useState('')
  const [aiReply, setAiReply] = useState<{ summary?: string, notes?: string } | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)

  // Load core data
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setProfileId(user?.id || '')

      const sj = await supabase.from('shops').select('id,name,city,lat,lng')
      const shopMap: Record<string, Shop> = {}
      ;(sj.data || []).forEach((s: any) => { shopMap[s.id] = s })
      setShops(shopMap)

      const bj = await supabase.from('barbers').select('*')
      const bs = (bj.data as Barber[]) || []
      setBarbers(bs)

      if (bs.length) {
        const ids = bs.map(b => b.user_id)
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
      const b = barbers.find(x => x.id === barber)
      if (!b) return
      if (!hours[b.shop_id]) {
        const wh = await supabase.from('working_hours').select('*').eq('shop_id', b.shop_id).order('dow')
        setHours(prev => ({ ...prev, [b.shop_id]: (wh.data || []) as any }))
      }
      const sv = services.filter(s => s.barber_id === barber)
      setService(sv[0]?.id || '')
      setTime('')
    })()
  }, [barber, services]) // eslint-disable-line

  // Compute slots — NO joins; use service_id and look up minutes locally
  useEffect(() => {
    (async () => {
      setSlots([]); setTime('')
      if (!barber || !service) return
      const b = barbers.find(x => x.id === barber)
      const s = services.find(x => x.id === service)
      if (!b || !s) return

      const dow = selectedDate.getDay()
      const wh = hours[b.shop_id] || []
      const row = wh.find(r => r.dow === dow)
      const openMin  = row ? row.open_min  : 9 * 60
      const closeMin = row ? row.close_min : 18 * 60
      const serviceMin = s.minutes

      const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
      const dayEnd   = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1)
      const { data: bk } = await supabase
        .from('bookings')
        .select('id, starts_at, service_id')         // ✅ only service_id
        .eq('barber_id', b.id)
        .gte('starts_at', dayStart.toISOString())
        .lt('starts_at', dayEnd.toISOString())
        .order('starts_at', { ascending: true })

      const minutesByService = new Map(services.map(sv => [sv.id, sv.minutes]))

      // ✅ normalize rows safely (no nested service objects anywhere)
      const rows: Array<{ id: string; starts_at: string; service_id: string | null }> =
        Array.isArray(bk) ? (bk as unknown as Array<{ id: string; starts_at: string; service_id: string | null }>) : []

      const existing: { start: number; end: number }[] = rows
        .filter(r => !!r.service_id)
        .map(r => {
          const st = new Date(r.starts_at).getTime()
          const mins = minutesByService.get(r.service_id as string) || 0
          return { start: st, end: st + mins * 60000 }
        })

      const startMs = dayStart.getTime()
      const now = Date.now()
      const out: string[] = []
      for (let m = openMin; m + serviceMin <= closeMin; m += 15) {
        const st = startMs + m * 60000
        const en = st + serviceMin * 60000
        if (selectedDate.toDateString() === new Date().toDateString() && st < now) continue
        const clash = existing.some(ex => !(en <= ex.start || st >= ex.end))
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

  // Mini calendar: next 14 days
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
    const b = barbers.find(x => x.id === barber)
    if (!b) return false
    const wh = hours[b.shop_id] || []
    const row = wh.find(r => r.dow === d.getDay())
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
    const s = services.find(x => x.id === service)
    const b = barbers.find(x => x.id === barber)
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

  const pickedService = services.find(x => x.id === service)
  const pickedBarber = barbers.find(x => x.id === barber)
  const pickedBarberProfile = pickedBarber ? profiles[pickedBarber.user_id] : undefined
  const barberLabel = pickedBarberProfile?.full_name || pickedBarberProfile?.email || (pickedBarber ? `Barber ${pickedBarber.id.slice(0, 6)}` : '—')
  const canBook = !!(profileId && barber && service && time)

  return (
    <div className="grid xl:grid-cols-3 gap-6">
      {/* ... UI unchanged ... */}
      {/* (Same UI as your current file; omitted here for brevity) */}
    </div>
  )
}
