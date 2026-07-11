import { useState } from 'react'
import { announcements, Announcement } from '../data'
import { Search, Pin } from 'lucide-react'

const CATEGORIES = ['All', 'Corporate', 'HR', 'IT', 'Clinical', 'Facilities'] as const

const CAT_COLORS: Record<string, string> = {
  Corporate: '#049FD9', HR: '#6EBE4A', IT: '#1D4289',
  Clinical: '#FBAB18', Facilities: '#58585B',
}

const PRIORITY_COLORS = { high: '#E2231A', normal: '#049FD9', low: '#9CA3AF' }

export default function News() {
  const [category, setCategory] = useState<string>('All')
  const [query, setQuery] = useState('')

  const filtered = announcements.filter((a) => {
    const matchCat = category === 'All' || a.category === category
    const matchQ   = !query || a.title.toLowerCase().includes(query.toLowerCase()) ||
                     a.body.toLowerCase().includes(query.toLowerCase())
    return matchCat && matchQ
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">News &amp; Announcements</h1>
        <p className="text-gray-500 text-sm -mt-3">Stay informed with the latest from CareConnect leadership.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Search announcements…"
                 className="form-input pl-9 py-2 text-sm" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                      ${category === c
                        ? 'text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-cisco-blue/40'}`}
                    style={category === c ? { backgroundColor: CAT_COLORS[c] ?? '#049FD9' } : {}}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {category === 'All' && !query && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Pin size={11} /> Pinned
          </h2>
          {announcements.filter((a) => a.pinned).map((a) => (
            <AnnouncementCard key={a.id} a={a} highlighted />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {category === 'All' && !query && (
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent</h2>
        )}
        {filtered.filter((a) => !(category === 'All' && !query && a.pinned)).map((a) => (
          <AnnouncementCard key={a.id} a={a} />
        ))}
        {filtered.length === 0 && (
          <div className="card p-12 text-center text-gray-400 text-sm">No announcements match your search.</div>
        )}
      </div>
    </div>
  )
}

function AnnouncementCard({ a, highlighted }: { a: Announcement; highlighted?: boolean }) {
  const [open, setOpen] = useState(false)
  const catColor  = CAT_COLORS[a.category] ?? '#58585B'
  const dotColor  = PRIORITY_COLORS[a.priority]

  return (
    <div className={`bg-white rounded-xl shadow-card overflow-hidden transition-all
      ${highlighted ? 'border border-cisco-blue/30' : 'border border-gray-100'}`}>
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 animate-pulse2" style={{ backgroundColor: dotColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="badge" style={{ backgroundColor: catColor }}>{a.category}</span>
            {a.pinned && <span className="text-xs text-cisco-orange font-medium">Pinned</span>}
          </div>
          <p className="text-sm font-medium text-gray-800 leading-snug">{a.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{a.date} · {a.author}</p>
        </div>
        <span className="text-gray-300 text-lg leading-none flex-shrink-0 font-light">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0 border-t border-gray-50 bg-cisco-light-gray/40">
          <p className="text-sm text-gray-700 leading-relaxed pt-4">{a.body}</p>
        </div>
      )}
    </div>
  )
}
