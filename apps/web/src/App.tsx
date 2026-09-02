import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { VerifyEmail } from './pages/VerifyEmail';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AdminLayout } from './components/AdminLayout';
import { AdminDashboard } from './pages/admin/Dashboard';
import { ClientList } from './pages/admin/ClientList';
import { CreateClient } from './pages/admin/CreateClient';
import { ClientDetail } from './pages/admin/ClientDetail';
import { AgentList } from './pages/admin/AgentList';
import { AgentBuilder } from './pages/admin/AgentBuilder';
import { AgentDetail } from './pages/admin/AgentDetail';
import { ClientLayout } from './components/ClientLayout';
import { ClientDashboard } from './pages/client/Dashboard';
import Home from './pages/Home';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        
        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="clients" element={<ClientList />} />
          <Route path="clients/new" element={<CreateClient />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="clients/:clientId/agents" element={<AgentList />} />
          <Route path="clients/:clientId/agents/new" element={<AgentBuilder />} />
          <Route path="clients/:clientId/agents/:agentId" element={<AgentDetail />} />
        </Route>
        
        {/* Client routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requiredRole="CLIENT_OWNER">
              <ClientLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ClientDashboard />} />
        </Route>
        
        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
