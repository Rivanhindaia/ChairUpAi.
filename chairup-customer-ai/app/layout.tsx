import './globals.css'
import Link from 'next/link'

export const metadata = { title: 'ChairUp — Customer', description: 'Find a barber. Book in seconds.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
          <div className="container py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-black text-white grid place-items-center font-bold">AI</div>
              <div className="font-semibold">ChairUp <span className="text-slate-500">/ Customer</span></div>
            </div>
            <nav className="nav">
              <Link href="/" className="link link-active">Home</Link>
              <Link href="/app" className="link">Book</Link>
              <Link href="/sign-in" className="link">Sign in</Link>
            </nav>
          </div>
        </header>
        <main className="container py-8 md:py-12">{children}</main>
        <footer className="footer">© {new Date().getFullYear()} ChairUp. All rights reserved.</footer>
      </body>
    </html>
  )
}
