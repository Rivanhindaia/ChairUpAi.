'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Barber = { id: string; user_id: string; shop_id: string }
type ProfileLite = { id: string; full_name: string | null; email: string | null }
type Service = { id: string; shop_id: string; barber_id: string | null; name: string; minutes: number; price_cents: number; active: boolean; payment_link_url?: string | null }

function downloadICS(title: string, start: Date, minutes: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const toICST = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours()
    )}${pad(d.getUTCMinutes())}00Z`
  const dtStart = toICST(start)
  const end = new Date(start.getTime() + minutes * 60 * 1000)
  const dtEnd = toICST(end)
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ChairUp//EN
BEGIN:VEVENT
UID:${Date.now()}@chairup
DTSTAMP:${dtStart}
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${title}
END:VEVENT
END:VCALENDAR`
  const blob = new Blob([ics], { type: 'text/calendar' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'booking.ics'
  a.click()
}

export default function CustomerApp(){
  const [profileId, setProfileId] = useState('')
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [services, setServices] = useState<Service[]>([])

  const [barber, setBarber] = useState('')
  const [service, setService] = useState('')
  const [dayOffset, setDayOffset] = useState(0)
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiReply, setAiReply] = useState<{summary?:string, notes?:string} | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)

  useEffect(()=>{(async()=>{
    const { data:{ user } }=await supabase.auth.getUser(); setProfileId(user?.id||'')
    const b = await supabase.from('barbers').select('*')
    const bs = (b.data as Barber[]) || []
    setBarbers(bs)
    if (bs.length) {
      const ids = bs.map(x=>x.user_id)
      const pq = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
      const rec: Record<string, ProfileLite> = {}; (pq.data||[]).forEach((p:any)=>{ rec[p.id]=p }); setProfiles(rec)
    }
    const sv = await supabase.from('services').select('*').eq('active', true)
    setServices((sv.data as Service[]) || [])
  })()},[])

  useEffect(()=>{
    if(!barber) return
    const sv = services.filter(s=>s.barber_id===barber)
    setService(sv[0]?.id || '')
  },[barber, services])

  const date = useMemo(()=>{ const d=new Date(); d.setDate(d.getDate()+dayOffset); return d },[dayOffset])
  const slots = () => { const a:string[]=[]; for(let h=9; h<=17; h++){ for(const m of [0,30]) a.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`) } return a }

  const pickedService = services.find(s=>s.id===service)
  const pickedBarber = barbers.find(b=>b.id===barber)
  const pickedBarberProfile = pickedBarber ? profiles[pickedBarber.user_id] : undefined
  const barberLabel = pickedBarberProfile?.full_name || pickedBarberProfile?.email || (pickedBarber ? `Barber ${pickedBarber.id.slice(0,6)}` : '—')
  const canBook = !!(profileId && barber && service && time)

  async function book(){
    if(!canBook || !pickedService || !pickedBarber){ alert('Sign in and complete details'); return }
    const d=new Date(); d.setDate(d.getDate()+dayOffset); const [h,m]=time.split(':').map(Number); d.setHours(h||0,m||0,0,0)
    const shop_id = pickedBarber.shop_id
    const rpc = await supabase.rpc('book_if_available', { p_shop_id:shop_id, p_service_id:pickedService.id, p_barber_id:pickedBarber.id, p_starts_at:d.toISOString(), p_notes: (aiReply?.notes || notes || null) })
    if (rpc.error) {
      const ins = await supabase.from('bookings').insert({ shop_id, service_id: pickedService.id, barber_id: pickedBarber.id, customer_id: profileId, starts_at: d.toISOString(), notes: (aiReply?.notes || notes || null) } as any)
      if (ins.error) { alert(rpc.error.message || ins.error.message); return }
    }
    downloadICS(`${pickedService.name} with ${barberLabel}`, d, pickedService.minutes)
    if (pickedService.payment_link_url) window.open(pickedService.payment_link_url, '_blank')
    alert('Booked!')
  }

  async function askAI(){
    if(!aiText.trim()){ setAiReply(null); return }
    setLoadingAI(true)
    try {
      const resp = await fetch('/api/ai', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ description: aiText, services: services.filter(s=>s.barber_id===barber) }) })
      const data = await resp.json()
      if (data.serviceId) setService(data.serviceId)
      setAiReply({ summary: data.summary, notes: data.notes })
    } finally { setLoadingAI(false) }
  }

  return (
    <div className="grid xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div className="card">
          <div className="text-sm font-medium mb-2">Choose a barber</div>
          <div className="flex flex-wrap gap-2">
            {barbers.map(b=>{
              const p = profiles[b.user_id]; const label = p?.full_name || p?.email || `Barber ${b.id.slice(0,6)}`
              return <button key={b.id} onClick={()=>setBarber(b.id)} className={`chip ${barber===b.id?'chip-on':'chip-off'}`}>{label}</button>
            })}
            {barbers.length===0 && <div className="text-sm text-slate-500">No barbers yet.</div>}
          </div>
        </div>

        <div className="card">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm font-medium mb-2">Service</div>
              <div className="flex flex-wrap gap-2">
                {services.filter(s=>s.barber_id===barber).map(s=>(
                  <button key={s.id} onClick={()=>setService(s.id)} className={`chip ${service===s.id?'chip-on':'chip-off'}`}>{s.name} · ${(s.price_cents/100).toFixed(2)}</button>
                ))}
                {barber && services.filter(s=>s.barber_id===barber).length===0 && <div className="text-sm text-slate-500">This barber has no services yet.</div>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Date</div>
              <div className="flex gap-2">
                {Array.from({length:7}).map((_,i)=>{
                  const d=new Date(); d.setDate(d.getDate()+i)
                  const label=d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})
                  return <button key={i} onClick={()=>setDayOffset(i)} className={`chip ${dayOffset===i?'chip-on':'chip-off'}`}>{label}</button>
                })}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Time</div>
            <div className="flex flex-wrap gap-2">
              {slots().map(t=>(
                <button key={t} onClick={()=>setTime(t)} className={`time-pill ${time===t?'time-pill-on':''}`}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">AI style assistant</div>
            <span className="badge">optional</span>
          </div>
          <p className="text-sm text-slate-600 mb-3">Describe your cut and we’ll suggest the best service and prep notes.</p>
          <div className="flex gap-2">
            <input className="input w-full" placeholder="e.g., mid-skin fade, blend sides, keep 1.5in on top" value={aiText} onChange={e=>setAiText(e.target.value)} />
            <button onClick={askAI} className="btn" disabled={loadingAI || !barber}>{loadingAI ? 'Thinking…' : 'Suggest'}</button>
          </div>
          {aiReply?.summary && <div className="mt-3 p-3 rounded-xl bg-slate-50 border text-sm"><div className="font-medium mb-1">Suggestion</div><div className="text-slate-700">{aiReply.summary}</div></div>}
        </div>

        <div className="card">
          <div className="text-sm font-medium mb-2">Notes (optional)</div>
          <textarea className="w-full input min-h-[100px]" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Anything the barber should know? (We’ll include your AI notes automatically)" />
        </div>
      </div>

      <div className="space-y-6">
        <div className="card">
          <h3 className="text-lg md:text-xl font-semibold">Booking summary</h3>
          <div className="space-y-3 text-sm mt-4">
            <div className="flex justify-between"><span>Barber</span><span className="font-medium">{barberLabel}</span></div>
            <div className="flex justify-between"><span>Service</span><span className="font-medium">{pickedService?.name || '—'}</span></div>
            <div className="flex justify-between"><span>Duration</span><span className="font-medium">{pickedService?.minutes || '—'} min</span></div>
            <div className="flex justify-between"><span>Date</span><span className="font-medium">{date.toLocaleDateString()}</span></div>
            <div className="flex justify-between"><span>Time</span><span className="font-medium">{time || '—'}</span></div>
            <div className="pt-2 border-t flex justify-between text-base font-semibold"><span>Total</span><span>${((pickedService?.price_cents||0)/100).toFixed(2)}</span></div>
            <button onClick={book} disabled={! (profileId && barber && service && time)} className="btn w-full">{(profileId && barber && service && time)?'Confirm Booking':'Sign in & complete details'}</button>
            {pickedService?.payment_link_url && <div className="text-xs text-slate-500 mt-2">After you confirm, we’ll open the payment page in a new tab.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
