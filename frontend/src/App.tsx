import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { PageTracker } from './hooks/usePageTracking';

// Provider pages — lazy loaded so they don't inflate the initial bundle
const ProviderDashboard = lazy(() => import('./pages/provider/Dashboard'));
const PatientList       = lazy(() => import('./pages/provider/PatientList'));
const PatientChart      = lazy(() => import('./pages/provider/PatientChart'));
const ProviderSchedule  = lazy(() => import('./pages/provider/Schedule'));
const ProviderMessages  = lazy(() => import('./pages/provider/Messages'));
const Prescribe         = lazy(() => import('./pages/provider/Prescribe'));

// Admin pages — lazy loaded
const AdminDashboard  = lazy(() => import('./pages/admin/Dashboard'));
const UserManagement  = lazy(() => import('./pages/admin/UserManagement'));
const Departments     = lazy(() => import('./pages/admin/Departments'));
const Integrations    = lazy(() => import('./pages/admin/Integrations'));
const Analytics       = lazy(() => import('./pages/admin/Analytics'));

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);

const PATIENT_HOST = import.meta.env.VITE_PATIENT_HOST;

function redirectToPatientPortal() {
  if (PATIENT_HOST && window.location.hostname !== PATIENT_HOST) {
    window.location.href = `https://${PATIENT_HOST}/`;
    return true;
  }
  return false;
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return <Navigate to={loginPath} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    if (user.role === 'patient' && redirectToPatientPortal()) return null;
    return <Navigate to={`/${user.role}/dashboard`} replace />;
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'patient' && redirectToPatientPortal()) return null;
  return <Navigate to={`/${user.role}/dashboard`} replace />;
}

function AppRoutes() {
  return (
    <>
    <PageTracker />
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="/" element={<RootRedirect />} />

        {/* Provider routes */}
        <Route
          path="/provider"
          element={<ProtectedRoute roles={['provider']}><Layout /></ProtectedRoute>}
        >
          <Route path="dashboard" element={<ProviderDashboard />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/:id" element={<PatientChart />} />
          <Route path="schedule" element={<ProviderSchedule />} />
          <Route path="messages" element={<ProviderMessages />} />
          <Route path="prescribe" element={<Prescribe />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Admin routes */}
        <Route
          path="/admin"
          element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}
        >
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="departments" element={<Departments />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="analytics" element={<Analytics />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
