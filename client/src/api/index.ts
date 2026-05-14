import axios from 'axios';
import { User, CaseItem, LoginData, RegisterData } from '../types';

const baseURL = '/api';

const axiosInstance = axios.create({
  baseURL,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw error;
  }
);

export const authAPI = {
  login: (data: LoginData) => axiosInstance.post('/auth/login', data),
  register: (data: RegisterData) => axiosInstance.post('/auth/register', data),
  getCurrentUser: () => axiosInstance.get('/auth/me'),
};

export const caseAPI = {
  getCases: (params?: {
    caseName?: string;
    keywords?: string;
    caseType?: string;
    startDate?: string;
    endDate?: string;
  }) => axiosInstance.get('/cases', { params }),
  getCaseById: (id: string) => axiosInstance.get(`/cases/${id}`),
  createCase: (data: { caseName: string; caseType: string; summary?: string }) =>
    axiosInstance.post('/cases', data),
  updateCase: (id: string, data: Partial<CaseItem>) =>
    axiosInstance.put(`/cases/${id}`, data),
  deleteCase: (id: string) => axiosInstance.delete(`/cases/${id}`),
};

export const documentAPI = {
  uploadDocument: (caseId: string, file: File) => {
    const formData = new FormData();
    formData.append('caseId', caseId);
    formData.append('file', file);
    return axiosInstance.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getDocuments: (caseId: string) => axiosInstance.get(`/documents/${caseId}`),
  extractText: (documentId: string) =>
    axiosInstance.post(`/documents/${documentId}/ocr`),
  analyzeDocument: (caseId: string) =>
    axiosInstance.post(`/documents/analyze/${caseId}`),
};

export const saveToken = (token: string) => {
  localStorage.setItem('token', token);
};

export const getToken = () => {
  return localStorage.getItem('token');
};

export const removeToken = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const saveUser = (user: User) => {
  localStorage.setItem('user', JSON.stringify(user));
};

export const getUser = (): User | null => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};