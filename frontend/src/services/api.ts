import axios, { type InternalAxiosRequestConfig } from 'axios';
import { context, trace, propagation, ROOT_CONTEXT } from '@opentelemetry/api';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// ── Shared request interceptor factory ───────────────────────────────────────
// Attaches JWT, a per-request correlation ID, and W3C trace context headers.
// Applied to both the direct API client and the BFF client so every hop in
// the three-tier chain carries the same trace context for Splunk APM linkage.
function attachTraceHeaders(config: InternalAxiosRequestConfig) {
  const token = localStorage.getItem('cc_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['x-request-id'] = crypto.randomUUID();

  try {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active() ?? ROOT_CONTEXT, carrier);
    if (carrier['traceparent']) {
      config.headers['traceparent'] = carrier['traceparent'];
      if (carrier['tracestate']) config.headers['tracestate'] = carrier['tracestate'];
    }
  } catch { /* RUM not initialized — skip propagation */ }

  return config;
}

function handleAuthError(error: { response?: { status: number } }) {
  if (error.response?.status === 401) {
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    window.location.href = '/login';
  }
  return Promise.reject(error);
}

// ── Direct API client (/api/*) ───────────────────────────────────────────────
// Used for: auth, messages, bills, vitals, notes, admin, FHIR, integrations.
// In production: ALB routes /api/* → VM2:3001.
const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});
api.interceptors.request.use(attachTraceHeaders);
api.interceptors.response.use((r) => r, handleAuthError);

// ── BFF client (/bff/*) ──────────────────────────────────────────────────────
// Used for: patients, appointments, labs — the high-value clinical reads.
// Request path: Browser → careconnect-bff (VM1:3003) → careconnect-api (VM2:3001) → PostgreSQL
// Same origin as the frontend — Cloudflare routes /bff/* → VM1:3003.
// In local dev: Vite proxy forwards /bff/* → localhost:3003.
const bff = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});
bff.interceptors.request.use(attachTraceHeaders);
bff.interceptors.response.use((r) => r, handleAuthError);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  me: () => api.get('/api/auth/me'),
};

// Patients — routed through BFF (VM1 → VM2 hop visible in APM + ThousandEyes)
export const patientsApi = {
  list: (params?: { search?: string }) =>
    bff.get('/bff/patients', { params }),
  me: () => bff.get('/bff/patients/me'),
  get: (id: string) => bff.get(`/bff/patients/${id}`),
  summary: (id: string) => bff.get(`/bff/patients/${id}/summary`),
  vitals: (id: string) => bff.get(`/bff/patients/${id}/vitals`),
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

// Appointments — routed through BFF (VM1 → VM2 hop visible in APM + ThousandEyes)
export const appointmentsApi = {
  list: (params?: { status?: string; upcoming?: string }) =>
    bff.get('/bff/appointments', { params }),
  get: (id: string) => bff.get(`/bff/appointments/${id}`),
  create: (data: Record<string, unknown>) =>
    bff.post('/bff/appointments', data),
  cancel: (id: string) => bff.patch(`/bff/appointments/${id}/cancel`),
  updateStatus: (id: string, status: string, notes?: string) =>
    bff.patch(`/bff/appointments/${id}/status`, { status, notes }),
};

// Lab Results — routed through BFF (VM1 → VM2 hop visible in APM + ThousandEyes)
export const labsApi = {
  list: (params?: { status?: string; panel?: string; patientId?: string }) =>
    bff.get('/bff/labs', { params }),
  get: (id: string) => bff.get(`/bff/labs/${id}`),
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

// ePrescribing (Surescripts) — routed through BFF so APM shows full chain:
// browser → bff → api → mock (Surescripts/VM4)
export const eprescribeApi = {
  list: (params?: { patientId?: string; status?: string }) =>
    bff.get('/bff/eprescribe', { params }),
  get: (id: string) => bff.get(`/bff/eprescribe/${id}`),
  submit: (data: Record<string, unknown>) => bff.post('/bff/eprescribe', data),
  cancel: (id: string) => bff.patch(`/bff/eprescribe/${id}/cancel`),
  integrationStatus: () => bff.get('/bff/eprescribe/integration/status'),
};

// Lab Ordering (LIS - Quest/LabCorp) — routed through BFF so APM shows full chain:
// browser → bff → api → mock (Quest/LabCorp/VM4)
export const labOrderApi = {
  order: (data: Record<string, unknown>) => bff.post('/bff/labs', data),
  lisOrders: (params?: { patientId?: string }) =>
    bff.get('/bff/labs/lis-orders', { params }),
  integrationStatus: () => bff.get('/bff/labs/integration/status'),
};

// Notifications (Twilio SMS / SendGrid Email) — routed through BFF so APM shows full chain:
// browser → bff → api → mock (Twilio/SendGrid/VM4)
export const notificationsApi = {
  list: (params?: { patientId?: string; type?: string }) =>
    bff.get('/bff/notifications', { params }),
  send: (data: Record<string, unknown>) => bff.post('/bff/notifications/send', data),
  trigger: (type: string) => bff.post(`/bff/notifications/trigger/${type}`),
  stats: () => bff.get('/bff/notifications/stats'),
  integrationStatus: () => bff.get('/bff/notifications/integration/status'),
};

// FHIR R4 API
export const fhirApi = {
  metadata: () => api.get('/fhir/metadata'),
  integrationStatus: () => api.get('/fhir/status'),
  patient: (id: string) => api.get(`/fhir/Patient/${id}`),
  observations: (patientId: string, category?: string) =>
    api.get('/fhir/Observation', { params: { patient: patientId, category } }),
  medicationRequests: (patientId: string) =>
    api.get('/fhir/MedicationRequest', { params: { patient: patientId } }),
  allergyIntolerances: (patientId: string) =>
    api.get('/fhir/AllergyIntolerance', { params: { patient: patientId } }),
  diagnosticReports: (patientId: string) =>
    api.get('/fhir/DiagnosticReport', { params: { patient: patientId } }),
};

export default api;
