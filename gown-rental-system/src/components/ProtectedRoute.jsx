import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const userRole = localStorage.getItem('userRole');
  const userToken = localStorage.getItem('userToken');

  // Kon walay token (wala naka-login) O kon ang role DILI admin, ilabay dretso sa Public Home page!
  if (!userToken || userRole !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // Kon tinuod nga admin, tugotan nga makasulod sa component
  return children;
};

export default ProtectedRoute;