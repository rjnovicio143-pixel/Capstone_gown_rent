import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';

// I-import ang imong mga tinuod nga Pages (Admin)
import Dashboard from './pages-admin/Dashboard'; 
import Inventory from './pages-admin/Inventory';
import Availability from './pages-admin/Availability';
import Customers from './pages-admin/Customers'; 
import Reports from './pages-admin/Reports'; 
import Settings from './pages-admin/Settings';
import ActivityLog from './pages-admin/ActivityLog';

// I-import ang mga Public Pages (Gikan sa imong pages-public folder)
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

function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // BAG-ONG STATE: Para masiguro ang cross-matching sa iyang system identity role
  const [userRole, setUserRole] = useState(null);

  // Susiha kung duna nay logged in nga user ug unsa iyang identity token credentials
  useEffect(() => {
    const token = localStorage.getItem('userToken');
    const role = localStorage.getItem('userRole'); // Kuhaon ang role ('admin' o 'customer')
    
    if (token) {
      setIsAuthenticated(true);
      setUserRole(role);
    }
  }, []);

  const handleLoginSuccess = (role) => {
    setIsAuthenticated(true);
    setUserRole(role);
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

        {/* LOGIN ROUTE */}
        <Route path="/login" element={
          isAuthenticated ? (
            // Kung admin, dretso sa dashboard. Kung customer, pabilin sa public access directory link
            userRole === 'admin' ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/" replace />
          ) : (
            <Login onLoginSuccess={handleLoginSuccess} />
          )
        } />

        {/* ================= 2. ADMIN ROUTES (SECURED PORTAL LAYER) ================= */}
        <Route path="/admin/*" element={
          // DUAL-LAYER GUARD: Kinahanglan naka-login OUG dapat 'admin' gyud iyang active role block token
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
                    <Route path="activity-log" element={<ActivityLog isCollapsed={isCollapsed} />} />
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                  </Routes>
                </main>
              </div>
            </div>
          ) : (
            // Kon dili admin (bisan pa og naka-login as customer), sipaon dretso sa Public Home link!
            <Navigate to="/" replace />
          )
        } />

        {/* FALLBACK REDIRECT GRID */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Router>
  );
}

export default App;