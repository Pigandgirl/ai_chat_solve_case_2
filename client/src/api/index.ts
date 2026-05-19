import axios from 'axios';
import { User, CaseItem, LoginData, RegisterData, UploadResponse, OCRResultResponse, PageAnalysisResponse } from '../types';

const baseURL = process.env.REACT_APP_API_URL || '/api';

const axiosInstance = axios.create({
  baseURL,
  timeout: 15000,
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
    case_name?: string;
    keywords?: string;
    case_type?: string;
    start_date?: string;
    end_date?: string;
  }) => axiosInstance.get('/cases', { params }),
  getCaseById: (id: number) => axiosInstance.get(`/cases/${id}`),
  createCase: (data: { case_name: string; case_type: string; summary?: string }) =>
    axiosInstance.post('/cases', data),
  updateCase: (id: number, data: Partial<CaseItem>) =>
    axiosInstance.put(`/cases/${id}`, data),
  deleteCase: (id: number) => axiosInstance.delete(`/cases/${id}`),
};

export const documentAPI = {
  uploadDocuments: (caseId: number, files: File[], category?: string) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    if (category) {
      formData.append('category', category);
    }
    return axiosInstance.post<UploadResponse>(`/cases/${caseId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getDocuments: (caseId: number) =>
    axiosInstance.get(`/cases/${caseId}/documents`),
  getOCRResult: (caseId: number, documentId: number) =>
    axiosInstance.get<OCRResultResponse>(`/cases/${caseId}/documents/${documentId}/ocr`),
  updateOCRResult: (caseId: number, documentId: number, correctedOcr: Record<string, unknown>) =>
    axiosInstance.put(`/cases/${caseId}/documents/${documentId}/ocr`, correctedOcr),
  retryDocumentOCR: (caseId: number, documentId: number) =>
    axiosInstance.post(`/cases/${caseId}/retry-document/${documentId}`),
  analyzePage: (caseId: number, documentId: number) =>
    axiosInstance.get<PageAnalysisResponse>(`/cases/${caseId}/documents/${documentId}/analysis`),
  getDocumentFile: (caseId: number, documentId: number) =>
    axiosInstance.get(`/cases/${caseId}/documents/${documentId}/file`, {
      responseType: 'blob',
    }),
};

export const dashboardAPI = {
  getStats: () => axiosInstance.get('/dashboard/stats'),
};

export const adminAPI = {
  listUsers: (search?: string) => axiosInstance.get('/admin/users', { params: search ? { search } : {} }),
  updateUser: (userId: number, data: { username?: string; phone?: string; role?: string }) =>
    axiosInstance.put(`/admin/users/${userId}`, data),
  changeUserPassword: (userId: number, data: { admin_password: string; new_password: string }) =>
    axiosInstance.put(`/admin/users/${userId}/password`, data),
  deleteUser: (userId: number) => axiosInstance.delete(`/admin/users/${userId}`),
  listAllCases: (params?: { search?: string; case_type?: string }) =>
    axiosInstance.get('/admin/cases', { params }),
  deleteCase: (caseId: number) => axiosInstance.delete(`/admin/cases/${caseId}`),
  listAuditLogs: (params?: { page?: number; page_size?: number }) =>
    axiosInstance.get('/admin/audit-logs', { params }),
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
