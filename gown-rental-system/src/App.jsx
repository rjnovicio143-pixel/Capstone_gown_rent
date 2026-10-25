import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import SuperSidebar from './components/SuperSidebar';

// Admin pages
import Dashboard from './pages-admin/Dashboard';
import Inventory from './pages-admin/Inventory';
import Availability from './pages-admin/Availability';
import Customers from './pages-admin/Customers';
import Reports from './pages-admin/Reports';
import Settings from './pages-admin/Settings';
import ActivityLog from './pages-admin/ActivityLog';
import AdminMannequin from './pages-admin/AdminMannequin';

// Super admin pages
import SuperAccounts from './pages-super/SuperAccounts';
import SuperModels from './pages-super/SuperModels';

// Public pages
import Home from './pages-public/Home';
import GownSuit from './pages-public/GownSuit';
import ReservationForm from './pages-public/ReservationForm';
import Login from './pages-public/Login';
import VirtualTryOn from './pages-public/VirtualTryOn';
import AboutUs from './pages-public/AboutUs';
import Contact from './pages-public/Contact';
import Mannequin3D from './pages-public/Mannequin3D';

import PublicNavbar from './components/PublicNavbar';
import './App.css';

// Asa moadto ang user human sa login
const roleHome = (role) => {
  if (role === 'super_admin') return '/super/accounts';
  if (role === 'admin')       return '/admin/dashboard';
  return '/';
};

// Kuhaon ang tinuod nga role gikan sa localStorage.admin (parehas sa gibasa sa header).
// Kung customer, ayaw i-override. Kung walay admin data, gamiton ang fallback.
const readRole = (fallback) => {
  if (fallback === 'customer') return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem('admin'));
    if (stored?.role) return stored.role;
  } catch (_) {
    // ignore parse errors
  }
  return fallback;
};

function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('userToken');
    if (token) {
      setIsAuthenticated(true);
      setUserRole(readRole(localStorage.getItem('userRole')));
    }
  }, []);

  const handleLoginSuccess = (role) => {
    const finalRole = readRole(role);
    localStorage.setItem('userRole', finalRole);
    setIsAuthenticated(true);
    setUserRole(finalRole);
  };

  return (
    <Router>
      <Routes>

        {/* ================= 1. PUBLIC ROUTES (CUSTOMER FACING) ================= */}
        <Route path="/" element={
          <div className="public-layout">
            <PublicNavbar />
            <Home />
          </div>
        } />

        <Route path="/gown-suit" element={
          <div className="public-layout">
            <PublicNavbar />
            <GownSuit />
          </div>
        } />

        <Route path="/reserve" element={
          <div className="public-layout">
            <PublicNavbar />
            <ReservationForm />
          </div>
        } />

        <Route path="/3d-mannequin" element={
          <div className="public-layout">
            <PublicNavbar />
            <Mannequin3D />
          </div>
        } />

        <Route path="/virtual-tryon" element={
          <div className="public-layout">
            <PublicNavbar />
            <VirtualTryOn />
          </div>
        } />

        <Route path="/about" element={
          <div className="public-layout">
            <PublicNavbar />
            <AboutUs />
          </div>
        } />

        <Route path="/contact" element={
          <div className="public-layout">
            <PublicNavbar />
            <Contact />
          </div>
        } />

        {/* LOGIN: ang padulong depende sa role */}
        <Route path="/login" element={
          isAuthenticated
            ? <Navigate to={roleHome(userRole)} replace />
            : <Login onLoginSuccess={handleLoginSuccess} />
        } />

        {/* ================= 2. ADMIN PORTAL (role: admin) ================= */}
        <Route path="/admin/*" element={
          isAuthenticated && userRole === 'admin' ? (
            <div className="app-layout">
              <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

              <div className={`main-wrapper ${isCollapsed ? 'sidebar-closed' : 'sidebar-open'}`}>
                <main className="content-area">
                  <Routes>
                    <Route path="/" element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard isCollapsed={isCollapsed} />} />
                    <Route path="inventory" element={<Inventory isCollapsed={isCollapsed} />} />
                    <Route path="availability" element={<Availability isCollapsed={isCollapsed} />} />
                    <Route path="customers" element={<Customers isCollapsed={isCollapsed} />} />
                    <Route path="reports" element={<Reports isCollapsed={isCollapsed} />} />
                    <Route path="settings" element={<Settings isCollapsed={isCollapsed} />} />
                    <Route path="mannequin" element={<AdminMannequin isCollapsed={isCollapsed} />} />
                    <Route path="activity-log" element={<ActivityLog isCollapsed={isCollapsed} />} />
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                  </Routes>
                </main>
              </div>
            </div>
          ) : isAuthenticated && userRole === 'super_admin' ? (
            // Super admin dili na mo-agi sa admin portal
            <Navigate to="/super/accounts" replace />
          ) : (
            <Navigate to="/" replace />
          )
        } />

        {/* ================= 3. SUPER ADMIN PORTAL (role: super_admin) ================= */}
        <Route path="/super/*" element={
          isAuthenticated && userRole === 'super_admin' ? (
            <div className="app-layout">
              <SuperSidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

              <div className={`main-wrapper ${isCollapsed ? 'sidebar-closed' : 'sidebar-open'}`}>
                <main className="content-area">
                  <Routes>
                    <Route path="/" element={<Navigate to="accounts" replace />} />
                    <Route path="accounts" element={<SuperAccounts />} />
                    <Route path="models" element={<SuperModels />} />
                    <Route path="*" element={<Navigate to="accounts" replace />} />
                  </Routes>
                </main>
              </div>
            </div>
          ) : isAuthenticated && userRole === 'admin' ? (
            <Navigate to="/admin/dashboard" replace />
          ) : (
            <Navigate to="/" replace />
          )
        } />

        {/* FALLBACK REDIRECT */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Router>
  );
}

export default App;