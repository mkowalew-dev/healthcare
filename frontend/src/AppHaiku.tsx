import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import HaikuLogin from './pages/haiku/HaikuLogin';
import { Inbox, Users, Calendar, LogOut } from 'lucide-react';

const HaikuInbox          = lazy(() => import('./pages/haiku/HaikuInbox'));
const HaikuPatients       = lazy(() => import('./pages/haiku/HaikuPatients'));
const HaikuPatientQuick   = lazy(() => import('./pages/haiku/HaikuPatientQuickView'));
const HaikuSchedule       = lazy(() => import('./pages/haiku/HaikuSchedule'));

function BottomNav({ badgeCount }: { badgeCount?: number }) {
  const { logout } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 flex safe-bottom">
      <NavLink
        to="/haiku/inbox"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors relative ${
            isActive ? 'text-[#0d274d]' : 'text-gray-400'
          }`
        }
      >
        <div className="relative">
          <Inbox size={22} />
          {badgeCount != null && badgeCount > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </div>
        <span>Inbox</span>
      </NavLink>

      <NavLink
        to="/haiku/patients"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
            isActive ? 'text-[#0d274d]' : 'text-gray-400'
          }`
        }
      >
        <Users size={22} />
        <span>Patients</span>
      </NavLink>

      <NavLink
        to="/haiku/schedule"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
            isActive ? 'text-[#0d274d]' : 'text-gray-400'
          }`
        }
      >
        <Calendar size={22} />
        <span>Schedule</span>
      </NavLink>

      <button
        onClick={logout}
        className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium text-gray-400"
      >
        <LogOut size={22} />
        <span>Sign Out</span>
      </button>
    </nav>
  );
}

function HaikuShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <LoadingSpinner size="lg" />
          </div>
        }
      >
        {children}
      </Suspense>
      <BottomNav />
    </div>
  );
}

function ProtectedHaiku({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/haiku/login" state={{ from: location }} replace />;
  if (user.role !== 'provider') return <Navigate to="/haiku/login" replace />;

  return <>{children}</>;
}

function HaikuRoot() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
  if (!user || user.role !== 'provider') return <Navigate to="/haiku/login" replace />;
  return <Navigate to="/haiku/inbox" replace />;
}

export default function AppHaiku() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/haiku/login" element={<HaikuLogin />} />
          <Route path="/haiku" element={<HaikuRoot />} />

          <Route
            path="/haiku/inbox"
            element={
              <ProtectedHaiku>
                <HaikuShell><HaikuInbox /></HaikuShell>
              </ProtectedHaiku>
            }
          />
          <Route
            path="/haiku/patients"
            element={
              <ProtectedHaiku>
                <HaikuShell><HaikuPatients /></HaikuShell>
              </ProtectedHaiku>
            }
          />
          <Route
            path="/haiku/patients/:id"
            element={
              <ProtectedHaiku>
                <HaikuShell><HaikuPatientQuick /></HaikuShell>
              </ProtectedHaiku>
            }
          />
          <Route
            path="/haiku/schedule"
            element={
              <ProtectedHaiku>
                <HaikuShell><HaikuSchedule /></HaikuShell>
              </ProtectedHaiku>
            }
          />

          <Route path="*" element={<Navigate to="/haiku" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
