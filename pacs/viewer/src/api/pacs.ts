import axios from 'axios';

export const PACS_URL = import.meta.env.VITE_PACS_URL || 'http://localhost:3021';

const api = axios.create({ baseURL: PACS_URL });

// Attach stored JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pacs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface PacsUser {
  id: string;
  email: string;
  name: string;
  role: string;
  title: string;
  specialty: string;
}

export interface WorklistStudy {
  studyInstanceUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  modality: string;
  accessionNumber: string;
  numberOfImages: number;
  priority: 'STAT' | 'ROUTINE' | 'URGENT';
  status: 'UNREAD' | 'IN_PROGRESS' | 'COMPLETED';
  assignedTo: string;
  referringPhysician: string;
  institution: string;
  hasImages: boolean;
  seriesCount: number;
}

export interface SeriesInfo {
  seriesInstanceUID: string;
  seriesNumber: string;
  seriesDescription: string;
  modality: string;
  numberOfInstances: number;
}

export interface StudyDetail {
  studyInstanceUID: string;
  patientName: string;
  studyDescription: string;
  hasImages: boolean;
  series: SeriesInfo[];
}

export interface InstanceInfo {
  sopInstanceUID: string;
  instanceNumber: number;
  wadoUri: string;
}

export async function login(email: string, password: string): Promise<{ token: string; user: PacsUser }> {
  const { data } = await api.post('/api/auth/login', { email, password });
  return data;
}

export async function getWorklist(): Promise<WorklistStudy[]> {
  const { data } = await api.get('/api/worklist');
  return data.studies;
}

export async function getStudyDetail(studyUID: string): Promise<StudyDetail> {
  const { data } = await api.get(`/api/studies/${studyUID}/series`);
  return data;
}

export async function getInstances(studyUID: string, seriesUID: string): Promise<InstanceInfo[]> {
  const { data } = await api.get(`/api/studies/${studyUID}/series/${seriesUID}/instances`);
  return data;
}

// Format DICOM patient name (LAST^FIRST^MIDDLE → First Last)
export function formatPatientName(dicomName: string): string {
  if (!dicomName) return 'Unknown Patient';
  const parts = dicomName.split('^');
  const last  = parts[0] ?? '';
  const first = parts[1] ?? '';
  const mid   = parts[2] ? ` ${parts[2].charAt(0)}.` : '';
  return `${first}${mid} ${last}`.trim() || dicomName;
}

// Format DICOM date (YYYYMMDD → MM/DD/YYYY)
export function formatDate(dicomDate: string): string {
  if (!dicomDate || dicomDate.length !== 8) return dicomDate || '';
  return `${dicomDate.slice(4, 6)}/${dicomDate.slice(6, 8)}/${dicomDate.slice(0, 4)}`;
}
