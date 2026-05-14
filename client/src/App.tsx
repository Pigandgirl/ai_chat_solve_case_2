import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser } from './store/slices/authSlice';
import { getUser } from './api';
import Login from './pages/Login';
import Register from './pages/Register';
import Workbench from './pages/Workbench';
import CaseDetail from './pages/CaseDetail';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" />;
  }
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  if (token) {
    return <Navigate to="/workbench" />;
  }
  return <>{children}</>;
};

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    const user = getUser();
    if (user) {
      dispatch(setUser(user));
    }
  }, [dispatch]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/workbench"
        element={
          <ProtectedRoute>
            <Workbench />
          </ProtectedRoute>
        }
      />
      <Route
        path="/case/:id"
        element={
          <ProtectedRoute>
            <CaseDetail />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;