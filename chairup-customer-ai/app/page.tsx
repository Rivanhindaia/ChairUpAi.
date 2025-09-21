import Link from 'next/link'
export default function Page(){
  return (
    <div className="space-y-10">
      <section className="hero">
        <h1 className="text-3xl md:text-5xl font-extrabold">Find a barber. Book in seconds.</h1>
        <p className="mt-2 text-white/80 max-w-2xl">AI-assisted booking that understands your style and finds the best time for you.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/app" className="btn bg-white text-black">Start booking</Link>
          <Link href="/sign-in" className="btn">Sign in</Link>
        </div>
        <div className="mt-4 flex gap-2">
          <span className="badge">AI style matcher</span>
          <span className="badge">Instant booking</span>
          <span className="badge">Calendar invite</span>
        </div>
      </section>
    </div>
  )
}
