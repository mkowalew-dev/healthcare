import axios from 'axios';
import { context, trace, propagation, ROOT_CONTEXT } from '@opentelemetry/api';

// Empty string = relative URLs (same origin). Works for both local dev
// (Vite proxy handles /api/*) and production (ALB or serve routes /api/* to VM2).
const API_URL = import.meta.env.VITE_API_URL ?? '';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token and trace context to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cc_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Correlation ID for Splunk/ThousandEyes tracing
  config.headers['x-request-id'] = crypto.randomUUID();

  // Propagate W3C trace context (traceparent/tracestate) so browser spans
  // link to server-side spans in Splunk APM service map
  try {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active() ?? ROOT_CONTEXT, carrier);
    if (carrier['traceparent']) {
      config.headers['traceparent'] = carrier['traceparent'];
      if (carrier['tracestate']) config.headers['tracestate'] = carrier['tracestate'];
    }
  } catch { /* RUM not initialized — skip propagation */ }

  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  me: () => api.get('/api/auth/me'),
};

// Patients
export const patientsApi = {
  list: (params?: { search?: string }) =>
    api.get('/api/patients', { params }),
  me: () => api.get('/api/patients/me'),
  get: (id: string) => api.get(`/api/patients/${id}`),
  summary: (id: string) => api.get(`/api/patients/${id}/summary`),
  vitals: (id: string) => api.get(`/api/patients/${id}/vitals`),
};

// Providers
export const providersApi = {
  list: (params?: { specialty?: string }) =>
    api.get('/api/providers', { params }),
  me: () => api.get('/api/providers/me'),
  get: (id: string) => api.get(`/api/providers/${id}`),
  availability: (id: string, date: string) =>
    api.get(`/api/providers/${id}/availability`, { params: { date } }),
};

// Appointments
export const appointmentsApi = {
  list: (params?: { status?: string; upcoming?: string }) =>
    api.get('/api/appointments', { params }),
  get: (id: string) => api.get(`/api/appointments/${id}`),
  create: (data: Record<string, unknown>) =>
    api.post('/api/appointments', data),
  cancel: (id: string) => api.patch(`/api/appointments/${id}/cancel`),
  updateStatus: (id: string, status: string, notes?: string) =>
    api.patch(`/api/appointments/${id}/status`, { status, notes }),
};

// Lab Results
export const labsApi = {
  list: (params?: { status?: string; panel?: string; patientId?: string }) =>
    api.get('/api/labs', { params }),
  get: (id: string) => api.get(`/api/labs/${id}`),
};

// Medications
export const medicationsApi = {
  list: (params?: { status?: string; patientId?: string }) =>
    api.get('/api/medications', { params }),
  requestRefill: (id: string) =>
    api.post(`/api/medications/${id}/refill-request`),
};

// Bills
export const billsApi = {
  list: (params?: { status?: string }) =>
    api.get('/api/bills', { params }),
  summary: () => api.get('/api/bills/summary'),
  pay: (id: string, amount: number, paymentMethod: string) =>
    api.post(`/api/bills/${id}/pay`, { amount, paymentMethod }),
  payments: () => api.get('/api/bills/payments'),
};

// Messages
export const messagesApi = {
  inbox: () => api.get('/api/messages', { params: { type: 'inbox' } }),
  sent: () => api.get('/api/messages', { params: { type: 'sent' } }),
  unreadCount: () => api.get('/api/messages/unread-count'),
  send: (data: Record<string, unknown>) => api.post('/api/messages', data),
  markRead: (id: string) => api.patch(`/api/messages/${id}/read`),
  providersList: () => api.get('/api/messages/providers-list'),
  recipientsSearch: (q: string) => api.get('/api/messages/recipients-search', { params: { q } }),
};

// Vitals
export const vitalsApi = {
  list: (patientId?: string) =>
    api.get('/api/vitals', { params: patientId ? { patientId } : {} }),
};

// Admin
export const adminApi = {
  stats: () => api.get('/api/admin/stats'),
  users: () => api.get('/api/admin/users'),
  toggleUserActive: (id: string) =>
    api.patch(`/api/admin/users/${id}/toggle-active`),
  appointments: (days?: number) =>
    api.get('/api/admin/appointments', { params: { days } }),
  departments: () => api.get('/api/admin/departments'),
};

// Notes
export const notesApi = {
  list: (patientId: string) =>
    api.get('/api/notes', { params: { patientId } }),
  create: (data: Record<string, unknown>) => api.post('/api/notes', data),
};

export default api;
