import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const sidebarWidth = collapsed ? 64 : 240

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Sidebar collapsed={collapsed} />
      <TopBar
        sidebarWidth={sidebarWidth}
        onToggleSidebar={() => setCollapsed((c) => !c)}
      />
      <main
        className="transition-all duration-200"
        style={{ marginLeft: sidebarWidth, paddingTop: 96 }}
      >
        <div className="p-6 max-w-screen-2xl mx-auto animate-fadeIn">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
