import { useState } from 'react'
import { events, PortalEvent } from '../data'
import { MapPin, Clock, Users, Wifi, CheckCircle } from 'lucide-react'

const CATEGORIES = ['All', 'Corporate', 'Training', 'HR', 'Innovation', 'Clinical', 'Social'] as const

const CAT_COLORS: Record<string, string> = {
  Corporate: '#049FD9', Training: '#1D4289', HR: '#6EBE4A',
  Innovation: '#FBAB18', Clinical: '#6EBE4A', Social: '#00BCEB',
}

export default function Events() {
  const [category, setCategory] = useState('All')
  const [rsvpd, setRsvpd] = useState<Set<string>>(new Set())

  const filtered = events.filter((e) => category === 'All' || e.category === category)

  function toggleRsvp(id: string) {
    setRsvpd((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Events Calendar</h1>
        <p className="text-gray-500 text-sm -mt-3">Upcoming events, town halls, and training sessions.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                    ${category === c ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-cisco-blue/40'}`}
                  style={category === c ? { backgroundColor: CAT_COLORS[c] ?? '#049FD9' } : {}}>
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map((ev) => <EventCard key={ev.id} ev={ev} rsvpd={rsvpd.has(ev.id)} onRsvp={() => toggleRsvp(ev.id)} />)}
        {filtered.length === 0 && (
          <div className="card p-12 text-center text-gray-400 text-sm">No events in this category.</div>
        )}
      </div>
    </div>
  )
}

function EventCard({ ev, rsvpd, onRsvp }: { ev: PortalEvent; rsvpd: boolean; onRsvp: () => void }) {
  const catColor  = CAT_COLORS[ev.category] ?? '#049FD9'
  const dateParts = ev.date.split(' ')
  const month     = dateParts[0]
  const day       = dateParts[1]?.replace(',', '').split('–')[0] ?? ''

  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-shadow">
      <div className="flex">
        <div className="flex flex-col items-center justify-center px-5 py-5 text-white flex-shrink-0 min-w-[72px]"
             style={{ backgroundColor: catColor }}>
          <span className="text-[10px] font-semibold uppercase opacity-80">{month}</span>
          <span className="text-2xl font-semibold leading-none">{day}</span>
        </div>
        <div className="flex-1 px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="badge" style={{ backgroundColor: catColor }}>{ev.category}</span>
              {ev.virtual && (
                <span className="flex items-center gap-1 text-xs text-cisco-blue font-medium">
                  <Wifi size={11} /> Virtual
                </span>
              )}
              {ev.spots !== undefined && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Users size={11} /> {ev.spots} spots
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">{ev.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-2 line-clamp-2">{ev.description}</p>
            <div className="flex flex-wrap gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Clock size={11} /> {ev.time}</span>
              <span className="flex items-center gap-1"><MapPin size={11} /> {ev.location}</span>
            </div>
          </div>
          {ev.rsvpRequired !== false && (
            <div className="flex-shrink-0">
              <button onClick={onRsvp}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer
                        ${rsvpd
                          ? 'bg-cisco-green/10 text-cisco-green border border-cisco-green/30'
                          : 'text-white hover:opacity-90'}`}
                      style={rsvpd ? {} : { backgroundColor: catColor }}>
                {rsvpd ? <><CheckCircle size={14} /> RSVP'd</> : 'RSVP'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
