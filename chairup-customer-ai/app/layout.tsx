import './globals.css'
import Link from 'next/link'
import Logo from '@/components/Logo'

export const metadata = {
  title: 'ChairUp — Customer',
  description: 'Find a barber nearby. Book in seconds.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
          <div className="container py-3 flex items-center justify-between">
            <Logo />
            <nav className="flex items-center gap-2 p-1 rounded-xl bg-slate-100">
              <Link href="/" className="px-3 py-1.5 rounded-lg text-sm hover:bg-white">Home</Link>
              <Link href="/app" className="px-3 py-1.5 rounded-lg text-sm hover:bg-white">Book</Link>
              <Link href="/sign-in" className="px-3 py-1.5 rounded-lg text-sm hover:bg-white">Sign in</Link>
            </nav>
          </div>
        </header>
        <main className="container py-8 md:py-12">{children}</main>
        <footer className="text-center text-xs text-slate-500 py-10">© {new Date().getFullYear()} ChairUp</footer>
      </body>
    </html>
  )
}

