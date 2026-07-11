import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { revenueData, satisfactionData, headcountData, kpis, COMPANY } from '../data'
import { TrendingUp, HeartPulse, Users, DollarSign, Activity, Bed } from 'lucide-react'

interface MetricTileProps { label: string; value: string; sub: string; icon: React.ReactNode; color: string; positive?: boolean }
function MetricTile({ label, value, sub, icon, color, positive = true }: MetricTileProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: color }}>{icon}</div>
      </div>
      <div className="text-2xl font-semibold text-gray-900 mb-1">{value}</div>
      <div className={`text-xs font-medium ${positive ? 'text-cisco-green' : 'text-cisco-red'}`}>
        {positive ? '▲' : '▼'} {sub}
      </div>
    </div>
  )
}

function RevTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg space-y-1">
      <div className="font-medium text-gray-300 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold">${p.value}M</span>
        </div>
      ))}
    </div>
  )
}

function SatTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
      <div className="text-gray-400">{label}</div>
      <div className="font-semibold text-cisco-cyan">{payload[0].value}%</div>
    </div>
  )
}

// Cisco-aligned chart colors
const PIE_COLORS = ['#049FD9', '#6EBE4A', '#1D4289', '#FBAB18', '#00BCEB', '#58585B', '#E2231A']

export default function Performance() {
  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Company Performance</h1>
        <p className="text-gray-500 text-sm -mt-3">Key business metrics — updated Q2 2026.</p>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricTile label="Revenue YTD"    value={`$${kpis.revenueYTD}`}    sub={`+${kpis.revenueGrowth}% YoY`}        icon={<DollarSign size={16} />} color="#049FD9" />
        <MetricTile label="Pt. Satisfaction" value={`${kpis.satisfaction}%`} sub={`+${kpis.satisfactionDelta}pts YoY`}   icon={<HeartPulse size={16} />} color="#6EBE4A" />
        <MetricTile label="Op. Margin"     value={`${kpis.operatingMargin}%`} sub="vs 11.8% prior year"                  icon={<TrendingUp size={16} />} color="#1D4289" />
        <MetricTile label="Beds Occupied"  value={`${kpis.bedsOccupied}%`}   sub="Target: 80%"                          icon={<Bed size={16} />}        color="#FBAB18" positive={false} />
        <MetricTile label="Q2 Patients"    value={kpis.patientsQ2}           sub="+5.2% vs Q2'25"                       icon={<Activity size={16} />}   color="#049FD9" />
        <MetricTile label="Employee Sat."  value={`${kpis.employeeSatisfaction}%`} sub="+3pts vs 2025"                  icon={<Users size={16} />}      color="#6EBE4A" />
      </div>

      {/* Revenue chart */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 text-sm mb-1">Quarterly Revenue vs Budget</h2>
        <p className="text-xs text-gray-400 mb-5">USD millions · Q3 2024 – Q2 2026</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={revenueData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}M`} />
            <Tooltip content={<RevTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" name="Actual" fill="#049FD9" radius={[4,4,0,0]} maxBarSize={40} />
            <Bar dataKey="budget"  name="Budget" fill="#E5E7EB" radius={[4,4,0,0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Satisfaction line */}
        <div className="lg:col-span-3 card p-6">
          <h2 className="font-semibold text-gray-900 text-sm mb-1">Patient Satisfaction Trend</h2>
          <p className="text-xs text-gray-400 mb-5">HCAHPS composite · Aug 2025 – Jul 2026</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={satisfactionData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
              <YAxis domain={[91, 95]} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<SatTooltip />} />
              <Line type="monotone" dataKey="score" stroke="#6EBE4A" strokeWidth={2.5}
                    dot={{ r: 4, fill: '#6EBE4A', strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Headcount donut */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-semibold text-gray-900 text-sm mb-1">Workforce by Department</h2>
          <p className="text-xs text-gray-400 mb-4">Total: {COMPANY.employees.toLocaleString()} employees</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={headcountData} cx="50%" cy="50%" innerRadius={48} outerRadius={80}
                   dataKey="count" nameKey="dept" paddingAngle={2}>
                {headcountData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => v.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {headcountData.map((d, i) => (
              <div key={d.dept} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="truncate">{d.dept}</span>
                <span className="ml-auto text-gray-400">{(d.count / 1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center pb-2">
        All financial figures are internal management estimates. Official Q2 results will be disclosed July 15, 2026. Data as of July 11, 2026.
      </p>
    </div>
  )
}
