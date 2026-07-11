import { useState } from 'react'
import { Search, Bell, Menu } from 'lucide-react'
import { tickerItems } from '../../data'

interface Props {
  sidebarWidth: number
  onToggleSidebar: () => void
}

export default function TopBar({ sidebarWidth, onToggleSidebar }: Props) {
  const [searchVal, setSearchVal] = useState('')
  const doubled = [...tickerItems, ...tickerItems]

  return (
    <header
      className="fixed top-0 right-0 z-20 flex flex-col"
      style={{ left: sidebarWidth, transition: 'left 0.2s' }}
    >
      {/* News ticker — cisco-dark-blue to match sidebar header */}
      <div className="bg-cisco-dark-blue overflow-hidden">
        <div className="flex whitespace-nowrap animate-ticker py-1.5">
          {doubled.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 px-8 text-xs text-white/80">
              <span className="w-1.5 h-1.5 rounded-full bg-cisco-cyan inline-block flex-shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Main header — matches EHR Layout.tsx header exactly */}
      <div className="bg-white border-b border-gray-200 shadow-header h-[60px] flex items-center px-4 gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumb */}
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-cisco-dark-blue">CareConnect</span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500">Internal Portal</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative hidden md:block w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Search employees, news, docs…"
            className="form-input pl-9 py-1.5 text-sm"
          />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 relative cursor-pointer">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-cisco-red rounded-full" />
          </button>
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-cisco-blue flex items-center justify-center text-white text-xs font-semibold">
              MK
            </div>
            <div className="hidden md:block">
              <div className="text-xs font-semibold text-gray-800">Martin K.</div>
              <div className="text-xs text-gray-500">IT Operations</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
