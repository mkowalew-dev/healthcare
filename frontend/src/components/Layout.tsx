import { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Calendar, FlaskConical, Pill, CreditCard, MessageSquare,
  Heart, Users, ClipboardList, ShieldCheck, LogOut, Menu, X, Bell,
  ChevronDown, Activity, Settings, UserCog,
} from 'lucide-react';
import { AiChat } from './AiChat';

// Cisco logo SVG mark
function CiscoLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.63} viewBox="0 0 40 25" fill="none">
      <rect x="0" y="8" width="6" height="9" rx="1" fill="white" opacity="0.9"/>
      <rect x="8.5" y="4" width="6" height="17" rx="1" fill="white"/>
      <rect x="17" y="0" width="6" height="25" rx="1" fill="white"/>
      <rect x="25.5" y="4" width="6" height="17" rx="1" fill="white"/>
      <rect x="34" y="8" width="6" height="9" rx="1" fill="white" opacity="0.9"/>
    </svg>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

const patientNav: NavItem[] = [
  { to: '/patient/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/patient/appointments', label: 'Appointments', icon: Calendar },
  { to: '/patient/labs', label: 'Test Results', icon: FlaskConical },
  { to: '/patient/medications', label: 'Medications', icon: Pill },
  { to: '/patient/billing', label: 'Billing', icon: CreditCard },
  { to: '/patient/messages', label: 'Messages', icon: MessageSquare },
  { to: '/patient/health-summary', label: 'Health Summary', icon: Heart },
];

const providerNav: NavItem[] = [
  { to: '/provider/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/provider/patients', label: 'My Patients', icon: Users },
  { to: '/provider/schedule', label: 'Schedule', icon: Calendar },
  { to: '/provider/messages', label: 'Messages', icon: MessageSquare },
];

const adminNav: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: UserCog },
  { to: '/admin/departments', label: 'Departments', icon: ShieldCheck },
];

export function Layout() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const navItems = user?.role === 'patient'
    ? patientNav
    : user?.role === 'provider'
    ? providerNav
    : adminNav;

  const displayName = profile
    ? user?.role === 'provider'
      ? `Dr. ${(profile as any).first_name} ${(profile as any).last_name}`
      : `${(profile as any).first_name} ${(profile as any).last_name}`
    : user?.email;

  const roleLabel = {
    patient: 'Patient',
    provider: (profile as any)?.specialty || 'Provider',
    admin: 'System Administrator',
  }[user?.role || 'patient'];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={clsx(
          'flex flex-col bg-white border-r border-gray-200 shadow-sm transition-all duration-200 z-20',
          sidebarOpen ? 'w-60' : 'w-16'
        )}
      >
        {/* Logo */}
        <div className="bg-cisco-dark-blue px-4 py-3 flex items-center gap-3 min-h-[60px]">
          <CiscoLogo size={32} />
          {sidebarOpen && (
            <div>
              <div className="text-white font-semibold text-sm leading-tight">CareConnect</div>
              <div className="text-white/60 text-xs">EHR Platform</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'sidebar-link',
                  isActive && 'active',
                  !sidebarOpen && 'justify-center px-2'
                )
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-t border-gray-100">
            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}>
              <div className="w-8 h-8 rounded-full bg-cisco-blue flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {displayName?.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 truncate">{displayName}</div>
                <div className="text-xs text-gray-500 truncate">{roleLabel}</div>
              </div>
              <ChevronDown size={14} className="text-gray-400" />
            </div>

            {profileMenuOpen && (
              <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 shadow-header h-[60px] flex items-center px-4 gap-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Breadcrumb / title */}
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-cisco-dark-blue">CareConnect EHR</span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-500 capitalize">{user?.role}</span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 relative">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-cisco-red rounded-full"></span>
            </button>
            <div className="w-px h-6 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cisco-blue flex items-center justify-center text-white text-xs font-semibold">
                {displayName?.substring(0, 2).toUpperCase()}
              </div>
              <div className="hidden md:block">
                <div className="text-xs font-semibold text-gray-800">{displayName}</div>
                <div className="text-xs text-gray-500">{roleLabel}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6 max-w-screen-2xl mx-auto animate-slide-in">
            <Outlet />
          </div>
        </main>
      </div>

      <AiChat />
    </div>
  );
}
