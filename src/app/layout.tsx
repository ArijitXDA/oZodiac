import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zodiac HRC — Agentic Pipeline',
  description: 'AI-powered recruitment pipeline for Zodiac HRC',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f1117] text-[#e8eaf0] antialiased">
        <nav className="border-b border-[#2a2d3a] bg-[#1a1d26] px-6 py-3 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold text-black">Z</div>
            <span className="font-semibold text-sm tracking-wide">Zodiac HRC</span>
            <span className="text-[#8b8fa8] text-xs ml-1">Agentic Pipeline</span>
          </div>
          <div className="flex gap-4 ml-4 text-sm text-[#8b8fa8]">
            <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
            <a href="/dashboard/jobs" className="hover:text-white transition-colors">Jobs</a>
            <a href="/dashboard/candidates" className="hover:text-white transition-colors">Candidates</a>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
