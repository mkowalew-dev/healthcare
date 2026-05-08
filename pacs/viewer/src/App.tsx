import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Worklist from './pages/Worklist';
import StudyViewer from './pages/StudyViewer';
import { Activity } from 'lucide-react';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-pacs-bg">
        <Activity className="w-5 h-5 text-pacs-accent animate-pulse" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/worklist" replace /> : <Login />} />
      <Route path="/worklist" element={<ProtectedRoute><Worklist /></ProtectedRoute>} />
      <Route path="/viewer/:studyUID" element={<ProtectedRoute><StudyViewer /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user ? '/worklist' : '/login'} replace />} />
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
