import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'
export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}))
  const { description, services } = body || {}
  const key = process.env.OPENAI_API_KEY
  function heuristic(desc: string, services: any[]) {
    const text = (desc||'').toLowerCase()
    const prefer = (kw: string[]) => services.find((s:any)=> kw.some(k=> (s.name||'').toLowerCase().includes(k)))
    let pick = null as any
    if (text.match(/fade|taper|skin/)) pick = prefer(['fade','taper'])
    if (!pick && text.match(/beard|line/)) pick = prefer(['beard','line'])
    if (!pick && text.match(/kid|child/)) pick = prefer(['kid','child'])
    if (!pick) pick = services.sort((a:any,b:any)=>a.minutes-b.minutes)[0]
    const minutes = pick?.minutes || 45
    const summary = 'Recommended based on your description.'
    const notes = desc?.trim() ? desc.trim() : '—'
    return { serviceId: pick?.id || null, minutes, notes, summary }
  }
  if (!Array.isArray(services) || services.length===0) return NextResponse.json({ error: 'No services provided' }, { status: 400 })
  if (!key) return NextResponse.json({ source: 'heuristic', ...heuristic(description, services) })
  try {
    const input = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful barber booking assistant. Keep replies under 40 words.' },
        { role: 'user', content: `Customer description: ${description || 'N/A'}` },
        { role: 'user', content: `Services: ${services.map((s:any)=>`${s.name} (${s.minutes}m $${(s.price_cents/100).toFixed(2)})`).join('; ')}` }
      ],
      temperature: 0.2
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{ 'Authorization': `Bearer ${key}`, 'Content-Type':'application/json' }, body: JSON.stringify(input) })
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content || ''
    const lower = text.toLowerCase()
    const found = services.find((s:any)=> lower.includes((s.name||'').toLowerCase()))
    const m = text.match(/(\d{2,3})\s?m(in)?/i)
    const minutes = m ? parseInt(m[1],10) : (found?.minutes || 45)
    const notes = text.slice(0, 180)
    return NextResponse.json({ source:'openai', serviceId: found?.id || null, minutes, notes, summary: text.slice(0, 120) })
  } catch (e:any) {
    return NextResponse.json({ source: 'heuristic', ...heuristic(description, services) })
  }
}
