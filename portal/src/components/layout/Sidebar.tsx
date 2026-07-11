import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Newspaper, BookOpen, BarChart2,
  FolderOpen, Users, CalendarDays, Settings, ChevronDown,
} from 'lucide-react'

// Cisco bridge mark — matches the CareConnect EHR app
function CiscoLogo({ size = 32 }: { size?: number }) {
  const h = size * 0.625
  return (
    <svg width={size} height={h} viewBox="0 0 40 25" fill="none">
      <rect x="0"    y="8" width="6" height="9"  rx="1" fill="white" opacity="0.9" />
      <rect x="8.5"  y="4" width="6" height="17" rx="1" fill="white" />
      <rect x="17"   y="0" width="6" height="25" rx="1" fill="white" />
      <rect x="25.5" y="4" width="6" height="17" rx="1" fill="white" />
      <rect x="34"   y="8" width="6" height="9"  rx="1" fill="white" opacity="0.9" />
    </svg>
  )
}

const navItems = [
  { to: '/',            label: 'Dashboard',       Icon: LayoutDashboard },
  { to: '/news',        label: 'News & Updates',  Icon: Newspaper },
  { to: '/stories',     label: 'Company Stories', Icon: BookOpen },
  { to: '/performance', label: 'Performance',     Icon: BarChart2 },
  { to: '/resources',   label: 'Resources',       Icon: FolderOpen },
  { to: '/directory',   label: 'Directory',       Icon: Users },
  { to: '/events',      label: 'Events',          Icon: CalendarDays },
]

interface Props { collapsed: boolean }

export default function Sidebar({ collapsed }: Props) {
  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col z-30 bg-white border-r border-gray-200 shadow-sm transition-all duration-200"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Logo — dark-blue header matching EHR app */}
      <div className="bg-cisco-dark-blue px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ minHeight: 60 }}>
        <CiscoLogo size={32} />
        {!collapsed && (
          <div>
            <div className="text-white font-semibold text-sm leading-tight">CareConnect</div>
            <div className="text-white/60 text-xs">Internal Portal</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'sidebar-link',
                isActive ? 'active' : '',
                collapsed ? 'justify-center px-2' : '',
              ].join(' ')
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-cisco-blue flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            MK
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 truncate">Martin K.</div>
                <div className="text-xs text-gray-500">IT Operations</div>
              </div>
              <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
            </>
          )}
        </div>
        {!collapsed && (
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-cisco-light-gray hover:text-cisco-dark-blue w-full transition-all duration-150 mt-0.5">
            <Settings size={18} className="flex-shrink-0" />
            Settings
          </button>
        )}
      </div>
    </aside>
  )
}
