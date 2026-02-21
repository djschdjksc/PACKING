import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';

import OwnerDashboard from './pages/OwnerDashboard';
import AuditorDashboard from './pages/AuditorDashboard';
import PackerDashboard from './pages/PackerDashboard';
import BillerDashboard from './pages/BillerDashboard';
// import BillerDashboard from './pages/MinimalBillerDashboard';
import ItemMaster from './pages/ItemMaster';
import UserManagement from './pages/UserManagement';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const RoleBasedRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'owner': return <OwnerDashboard />;
    case 'auditor': return <AuditorDashboard />;
    case 'packer': return <PackerDashboard />;
    case 'biller': return <BillerDashboard />;
    default: return <div>Unknown Role</div>;
  }
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleBasedRedirect />} />

          {/* Specific Routes can be added here */}
          <Route path="/owner/*" element={
            <ProtectedRoute allowedRoles={['owner']}>
              <OwnerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/item-master" element={
            <ProtectedRoute allowedRoles={['owner']}>
              <ItemMaster />
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute allowedRoles={['owner']}>
              <UserManagement />
            </ProtectedRoute>
          } />
          <Route path="/auditor/*" element={
            <ProtectedRoute allowedRoles={['auditor']}>
              <AuditorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/packer/*" element={
            <ProtectedRoute allowedRoles={['packer']}>
              <PackerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/biller/*" element={
            <ProtectedRoute allowedRoles={['biller']}>
              <BillerDashboard />
            </ProtectedRoute>
          } />

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
