import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

// Patient pages
import PatientDashboard from './pages/patient/Dashboard';
import Appointments from './pages/patient/Appointments';
import LabResults from './pages/patient/LabResults';
import Medications from './pages/patient/Medications';
import BillPay from './pages/patient/BillPay';
import PatientMessages from './pages/patient/Messages';
import HealthSummary from './pages/patient/HealthSummary';

// Provider pages
import ProviderDashboard from './pages/provider/Dashboard';
import PatientList from './pages/provider/PatientList';
import PatientChart from './pages/provider/PatientChart';
import ProviderSchedule from './pages/provider/Schedule';
import ProviderMessages from './pages/provider/Messages';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import UserManagement from './pages/admin/UserManagement';
import Departments from './pages/admin/Departments';

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
    return <Navigate to={`/${user.role}/dashboard`} replace />;
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}/dashboard`} replace />;
}

function AppRoutes() {
  return (
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
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

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
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<RootRedirect />} />
    </Routes>
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
