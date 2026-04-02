export type UserRole = 'patient' | 'provider' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface Patient {
  id: string;
  user_id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  insurance_provider: string;
  insurance_id: string;
  primary_provider_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  blood_type: string;
  provider_first?: string;
  provider_last?: string;
  department_name?: string;
  upcoming_appointments?: number;
  last_visit?: string;
}

export interface Provider {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  npi: string;
  phone: string;
  bio: string;
  department_id: string;
  department_name?: string;
  department_location?: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  provider_id: string;
  scheduled_at: string;
  duration_minutes: number;
  type: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'checked_in';
  chief_complaint: string;
  notes: string;
  location: string;
  patient_first?: string;
  patient_last?: string;
  mrn?: string;
  provider_first?: string;
  provider_last?: string;
  specialty?: string;
  department_name?: string;
  department_location?: string;
}

export interface LabResult {
  id: string;
  patient_id: string;
  provider_id: string;
  ordered_at: string;
  resulted_at?: string;
  test_name: string;
  test_code: string;
  value?: string;
  unit?: string;
  reference_range?: string;
  status: 'pending' | 'resulted' | 'abnormal' | 'critical';
  notes?: string;
  panel_name?: string;
  provider_first?: string;
  provider_last?: string;
}

export interface Medication {
  id: string;
  patient_id: string;
  provider_id: string;
  name: string;
  generic_name: string;
  dosage: string;
  frequency: string;
  route: string;
  start_date: string;
  end_date?: string;
  status: 'active' | 'discontinued' | 'completed' | 'on_hold';
  instructions: string;
  refills_remaining: number;
  prescribed_at: string;
  provider_first?: string;
  provider_last?: string;
}

export interface Bill {
  id: string;
  patient_id: string;
  appointment_id?: string;
  service_date: string;
  due_date: string;
  total_amount: number;
  insurance_amount: number;
  patient_amount: number;
  paid_amount: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'in_review';
  description: string;
  appointment_date?: string;
  appointment_type?: string;
  provider_first?: string;
  provider_last?: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  subject: string;
  body: string;
  sent_at: string;
  read_at?: string;
  message_type: string;
  is_archived: boolean;
  sender_name?: string;
  recipient_name?: string;
  sender_email?: string;
  sender_role?: string;
}

export interface VitalSigns {
  id: string;
  patient_id: string;
  appointment_id?: string;
  recorded_at: string;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  temperature?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  pain_level?: number;
}

export interface Allergy {
  id: string;
  patient_id: string;
  allergen: string;
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  noted_date: string;
}

export interface Diagnosis {
  id: string;
  patient_id: string;
  provider_id: string;
  icd_code: string;
  description: string;
  diagnosed_date: string;
  status: 'active' | 'resolved' | 'chronic' | 'inactive';
  notes?: string;
}

export interface BillSummary {
  total_owed: number;
  overdue: number;
  paid_ytd: number;
  pending_count: number;
}

export interface AuthContextType {
  user: User | null;
  profile: Patient | Provider | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}
