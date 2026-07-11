import { useState } from 'react'
import { employees } from '../data'
import { Search, Mail, Phone, MapPin } from 'lucide-react'

const DEPARTMENTS = ['All', 'Clinical', 'Operations', 'IT', 'Finance', 'HR', 'Innovation', 'Legal', 'Marketing', 'Foundation', 'Executive']

export default function Directory() {
  const [query, setQuery] = useState('')
  const [dept, setDept]   = useState('All')

  const filtered = employees.filter((e) => {
    const matchD = dept === 'All' || e.department === dept
    const matchQ = !query ||
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.title.toLowerCase().includes(query.toLowerCase()) ||
      e.department.toLowerCase().includes(query.toLowerCase())
    return matchD && matchQ
  })

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Employee Directory</h1>
        <p className="text-gray-500 text-sm -mt-3">Find colleagues, teams, and contact information.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Search by name, title, or department…"
                 className="form-input pl-9 py-2 text-sm" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {DEPARTMENTS.map((d) => (
            <button key={d} onClick={() => setDept(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                      ${dept === d
                        ? 'bg-cisco-blue text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-cisco-blue/40'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((emp) => (
          <div key={emp.id}
               className="card p-5 hover:shadow-card-hover transition-all group hover:border-cisco-blue/30 border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                   style={{ backgroundColor: emp.color }}>
                {emp.initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 group-hover:text-cisco-blue transition-colors truncate">{emp.name}</p>
                <p className="text-xs text-gray-500 leading-snug line-clamp-2">{emp.title}</p>
              </div>
            </div>
            <span className="badge text-white text-xs mb-3 inline-flex" style={{ backgroundColor: emp.color }}>
              {emp.department}
            </span>
            {emp.bio && <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{emp.bio}</p>}
            <div className="space-y-1.5 border-t border-gray-100 pt-3">
              <a href={`mailto:${emp.email}`}
                 className="flex items-center gap-2 text-xs text-gray-500 hover:text-cisco-blue transition-colors">
                <Mail size={12} /> {emp.email}
              </a>
              <div className="flex items-center gap-2 text-xs text-gray-500"><Phone size={12} /> {emp.phone}</div>
              <div className="flex items-center gap-2 text-xs text-gray-500"><MapPin size={12} /> {emp.location}</div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card p-12 text-center text-gray-400 text-sm">No employees match your search.</div>
      )}
    </div>
  )
}
