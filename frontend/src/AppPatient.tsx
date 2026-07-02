import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { PageTracker } from './hooks/usePageTracking';

// Patient pages — lazy loaded so they don't inflate the initial bundle
const PatientDashboard      = lazy(() => import('./pages/patient/Dashboard'));
const Appointments          = lazy(() => import('./pages/patient/Appointments'));
const LabResults            = lazy(() => import('./pages/patient/LabResults'));
const Medications           = lazy(() => import('./pages/patient/Medications'));
const BillPay               = lazy(() => import('./pages/patient/BillPay'));
const PatientMessages       = lazy(() => import('./pages/patient/Messages'));
const HealthSummary         = lazy(() => import('./pages/patient/HealthSummary'));
const PatientNotifications  = lazy(() => import('./pages/patient/Notifications'));

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);

const CLINICAL_HOST = import.meta.env.VITE_CLINICAL_HOST;

function redirectToClinicalPortal() {
  if (CLINICAL_HOST && window.location.hostname !== CLINICAL_HOST) {
    window.location.href = `https://${CLINICAL_HOST}/`;
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

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    if (user.role !== 'patient' && redirectToClinicalPortal()) return null;
    return <Navigate to="/patient/dashboard" replace />;
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'patient' && redirectToClinicalPortal()) return null;
  return <Navigate to="/patient/dashboard" replace />;
}

function AppPatientRoutes() {
  return (
    <>
    <PageTracker />
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RootRedirect />} />

        {/* Patient routes */}
        <Route
          path="/patient"
          element={<ProtectedRoute roles={['patient']}><Layout /></ProtectedRoute>}
        >
          <Route path="dashboard" element={<PatientDashboard />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="labs" element={<LabResults />} />
          <Route path="medications" element={<Medications />} />
          <Route path="billing" element={<BillPay />} />
          <Route path="messages" element={<PatientMessages />} />
          <Route path="health-summary" element={<HealthSummary />} />
          <Route path="notifications" element={<PatientNotifications />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
    </>
  );
}

export default function AppPatient() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppPatientRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
