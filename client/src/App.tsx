import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser } from './store/slices/authSlice';
import { getUser } from './api';
import Login from './pages/Login';
import Register from './pages/Register';
import Workbench from './pages/Workbench';
import CaseDetail from './pages/CaseDetail';
import OCRVerification from './pages/OCRVerification';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import TestAPI from './pages/Test';

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
      <Route path="/test" element={<TestAPI />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/workbench" element={<Workbench />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/case/:id" element={<CaseDetail />} />
      <Route path="/case/:caseId/document/:documentId/ocr-verify" element={<OCRVerification />} />
      <Route path="/" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;
