import { Link } from 'react-router-dom'
import { TrendingUp, DollarSign, HeartPulse, Users, ChevronRight, MapPin, Clock, Star } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { COMPANY, stockData, stockSummary, kpis, announcements, stories, events, employees } from '../data'

// ── Category colors (Cisco palette) ─────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  Corporate: '#049FD9', HR: '#6EBE4A', IT: '#1D4289',
  Clinical: '#FBAB18', Facilities: '#58585B',
  Innovation: '#049FD9', Culture: '#6EBE4A', Awards: '#FBAB18',
  Community: '#1D4289', Training: '#1D4289', Social: '#00BCEB',
}

function CategoryBadge({ label }: { label: string }) {
  return (
    <span className="badge" style={{ backgroundColor: CAT_COLORS[label] ?? '#58585B' }}>
      {label}
    </span>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps { label: string; value: string; sub: string; positive?: boolean; icon: React.ReactNode; accent: string }
function KpiCard({ label, value, sub, positive = true, icon, accent }: KpiCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4 hover:shadow-card-hover transition-shadow">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: accent }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 leading-none">{value}</p>
        <p className={`text-xs mt-1.5 font-medium ${positive ? 'text-cisco-green' : 'text-cisco-red'}`}>
          {positive ? '▲' : '▼'} {sub}
        </p>
      </div>
    </div>
  )
}

function StockTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
      <div className="text-gray-400">{label}</div>
      <div className="font-semibold text-cisco-cyan">${payload[0].value.toFixed(2)}</div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const pinned     = announcements.filter((a) => a.pinned)
  const latest     = announcements.filter((a) => !a.pinned).slice(0, 2)
  const displayed  = [...pinned, ...latest].slice(0, 4)
  const featStories = stories.slice(0, 4)
  const upcomingEvts = events.slice(0, 4)
  const spotlights  = employees.filter((e) => e.spotlight)
  const chartData   = stockData.slice(-30)

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">

      {/* Hero Banner — cisco-dark-blue → cisco-blue gradient */}
      <div className="relative rounded-xl overflow-hidden shadow-card"
           style={{ background: 'linear-gradient(135deg, #1D4289 0%, #049FD9 100%)' }}>
        <div className="absolute inset-0 opacity-[0.07]"
             style={{ backgroundImage: 'radial-gradient(circle at 75% 40%, white 0%, transparent 55%)' }} />
        <div className="relative px-8 py-7 flex items-start justify-between gap-6">
          <div>
            <p className="text-white/60 text-sm mb-1">Saturday, July 11, 2026</p>
            <h1 className="font-semibold text-white text-2xl mb-2">Good morning, Martin!</h1>
            <p className="text-white/75 text-sm leading-relaxed max-w-xl">
              "{COMPANY.tagline} {COMPANY.mission}"
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end text-right flex-shrink-0">
            <div className="text-white/50 text-xs mb-1">{COMPANY.ticker} · NASDAQ</div>
            <div className="text-white text-3xl font-semibold">${stockSummary.current}</div>
            <div className="text-cisco-cyan text-sm font-medium">▲ +${stockSummary.change} (+{stockSummary.changePct}%)</div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Stock Price (CCHX)" value={`$${stockSummary.current}`} sub={`+${stockSummary.changePct}% today`} accent="#049FD9" icon={<TrendingUp size={18} />} />
        <KpiCard label="Revenue YTD"         value={`$${kpis.revenueYTD}`}     sub={`${kpis.revenueGrowth}% vs prior year`} accent="#6EBE4A" icon={<DollarSign size={18} />} />
        <KpiCard label="Patient Satisfaction" value={`${kpis.satisfaction}%`}   sub={`+${kpis.satisfactionDelta}% vs last year`} accent="#1D4289" icon={<HeartPulse size={18} />} />
        <KpiCard label="Total Employees"     value={COMPANY.employees.toLocaleString()} sub={`Across ${COMPANY.facilities} facilities`} accent="#FBAB18" icon={<Users size={18} />} />
      </div>

      {/* Announcements + Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Announcements */}
        <div className="lg:col-span-3 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Announcements</h2>
            <Link to="/news" className="text-xs text-cisco-blue hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {displayed.map((a) => (
              <div key={a.id} className="px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CategoryBadge label={a.category} />
                      {a.pinned && <span className="text-xs text-cisco-orange font-medium">Pinned</span>}
                    </div>
                    <p className="text-sm font-medium text-gray-800 leading-snug mb-0.5">{a.title}</p>
                    <p className="text-xs text-gray-500">{a.date} · {a.author}</p>
                  </div>
                  {a.priority === 'high' && (
                    <span className="w-2 h-2 rounded-full bg-cisco-red mt-1.5 flex-shrink-0 animate-pulse2" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock widget */}
        <div className="lg:col-span-2 card flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">{COMPANY.ticker}</h2>
                <p className="text-xs text-gray-500">NASDAQ · {COMPANY.name}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-gray-900">${stockSummary.current}</div>
                <div className="text-xs font-medium text-cisco-green">▲ +${stockSummary.change} (+{stockSummary.changePct}%)</div>
              </div>
            </div>
          </div>
          <div className="flex-1 px-2 pt-3 pb-2">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#049FD9" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#049FD9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} interval={7} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                <Tooltip content={<StockTooltip />} />
                <Area type="monotone" dataKey="price" stroke="#049FD9" strokeWidth={2} fill="url(#stockGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3">
            {[
              ['52W High', `$${stockSummary.high52}`],
              ['Volume',   stockSummary.volume],
              ['52W Low',  `$${stockSummary.low52}`],
              ['Mkt Cap',  `$${stockSummary.mktCap}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-gray-400">{k}</span>
                <span className="font-medium text-gray-700">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Company Stories */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Company Stories</h2>
          <Link to="/stories" className="text-xs text-cisco-blue hover:underline flex items-center gap-1">
            View all <ChevronRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-x divide-y divide-gray-100">
          {featStories.map((s) => (
            <div key={s.id} className="p-5 hover:bg-gray-50 transition-colors cursor-pointer group">
              <div className="w-full h-24 rounded-lg mb-3 flex items-center justify-center text-white text-xs font-medium"
                   style={{ backgroundColor: s.imageColor }}>
                <span className="opacity-50 uppercase tracking-widest text-[10px]">{s.category}</span>
              </div>
              <CategoryBadge label={s.category} />
              <h3 className="text-sm font-medium text-gray-800 mt-2 mb-1 leading-snug group-hover:text-cisco-blue transition-colors line-clamp-2">
                {s.title}
              </h3>
              <p className="text-xs text-gray-400">{s.date} · {s.readMinutes} min read</p>
            </div>
          ))}
        </div>
      </div>

      {/* Events + Employee Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pb-2">
        {/* Events */}
        <div className="lg:col-span-3 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Upcoming Events</h2>
            <Link to="/events" className="text-xs text-cisco-blue hover:underline flex items-center gap-1">
              View calendar <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {upcomingEvts.map((ev) => (
              <div key={ev.id} className="px-5 py-3.5 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className="w-10 flex-shrink-0 text-center">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase leading-none">{ev.date.split(' ')[0]}</div>
                  <div className="text-lg font-semibold text-cisco-blue leading-none">{ev.date.split(' ')[1]?.replace(',', '')}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-snug">{ev.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock size={11} /> {ev.time.split(' ')[0]} {ev.time.split(' ')[1]}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <MapPin size={11} /> {ev.location.split('—')[0].trim().split(' ').slice(0, 3).join(' ')}
                    </span>
                    {ev.virtual && <span className="text-xs text-cisco-blue font-medium">Virtual</span>}
                  </div>
                </div>
                <CategoryBadge label={ev.category} />
              </div>
            ))}
          </div>
        </div>

        {/* Employee Spotlight */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <Star size={15} className="text-cisco-orange" />
            <h2 className="font-semibold text-gray-900 text-sm">Employee Spotlight</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {spotlights.slice(0, 3).map((emp) => (
              <div key={emp.id} className="px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                     style={{ backgroundColor: emp.color }}>
                  {emp.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                  <p className="text-xs text-gray-500 mb-1">{emp.title}</p>
                  {emp.bio && <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{emp.bio}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-50">
            <Link to="/directory" className="text-xs text-cisco-blue hover:underline flex items-center gap-1">
              View full directory <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </div>

    </div>
  )
}
