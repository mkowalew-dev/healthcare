-- CareConnect EHR Database Schema
-- Modeled after EPIC EHR data structures

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (authentication layer)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'provider', 'admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- Hospital Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Providers (physicians, nurses, etc.)
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  specialty VARCHAR(100),
  npi VARCHAR(20),
  department_id UUID REFERENCES departments(id),
  phone VARCHAR(20),
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mrn VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(20),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  insurance_provider VARCHAR(100),
  insurance_id VARCHAR(50),
  primary_provider_id UUID REFERENCES providers(id),
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(20),
  blood_type VARCHAR(5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  type VARCHAR(50) NOT NULL DEFAULT 'office_visit',
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show', 'checked_in')),
  chief_complaint TEXT,
  notes TEXT,
  location VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lab Results
CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  ordered_at TIMESTAMPTZ DEFAULT NOW(),
  resulted_at TIMESTAMPTZ,
  test_name VARCHAR(200) NOT NULL,
  test_code VARCHAR(50),
  value VARCHAR(100),
  unit VARCHAR(50),
  reference_range VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resulted', 'abnormal', 'critical')),
  notes TEXT,
  panel_name VARCHAR(100)
);

-- Medications
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  name VARCHAR(200) NOT NULL,
  generic_name VARCHAR(200),
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  route VARCHAR(50) DEFAULT 'oral',
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'discontinued', 'completed', 'on_hold')),
  instructions TEXT,
  refills_remaining INTEGER DEFAULT 0,
  prescribed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allergies
CREATE TABLE IF NOT EXISTS allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  allergen VARCHAR(200) NOT NULL,
  reaction VARCHAR(200),
  severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
  noted_date DATE DEFAULT CURRENT_DATE
);

-- Diagnoses (Problem List)
CREATE TABLE IF NOT EXISTS diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  icd_code VARCHAR(20),
  description VARCHAR(300) NOT NULL,
  diagnosed_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'chronic', 'inactive')),
  notes TEXT
);

-- Vital Signs
CREATE TABLE IF NOT EXISTS vital_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  heart_rate INTEGER,
  temperature NUMERIC(4,1),
  respiratory_rate INTEGER,
  oxygen_saturation INTEGER,
  weight NUMERIC(5,1),
  height NUMERIC(5,1),
  bmi NUMERIC(4,1),
  pain_level INTEGER
);

-- Bills
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  service_date DATE,
  due_date DATE,
  total_amount NUMERIC(10,2) NOT NULL,
  insurance_amount NUMERIC(10,2) DEFAULT 0,
  patient_amount NUMERIC(10,2) NOT NULL,
  paid_amount NUMERIC(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'in_review')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  payment_method VARCHAR(50),
  confirmation_number VARCHAR(50),
  notes TEXT
);

-- Secure Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id),
  recipient_id UUID REFERENCES users(id),
  subject VARCHAR(300),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  message_type VARCHAR(50) DEFAULT 'general',
  is_archived BOOLEAN DEFAULT false
);

-- Clinical Notes
CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  note_type VARCHAR(50) DEFAULT 'progress',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ePrescriptions (Surescripts integration)
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  medication_name VARCHAR(200) NOT NULL,
  generic_name VARCHAR(200),
  sig TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  days_supply INTEGER,
  refills INTEGER DEFAULT 0,
  dosage_form VARCHAR(100),
  strength VARCHAR(100),
  pharmacy_name VARCHAR(200),
  pharmacy_ncpdp VARCHAR(20),
  pharmacy_address TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','submitted','confirmed','rejected','cancelled','on_hold')),
  surescripts_rx_id VARCHAR(100),
  ndc_code VARCHAR(20),
  dea_schedule VARCHAR(5),
  icd10_codes TEXT,
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  external_response JSONB,
  latency_ms INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LIS Orders (Quest Diagnostics / LabCorp integration)
CREATE TABLE IF NOT EXISTS lis_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  lab_result_id UUID REFERENCES lab_results(id) ON DELETE SET NULL,
  order_number VARCHAR(50) UNIQUE,
  lis_vendor VARCHAR(50) DEFAULT 'Quest',
  priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine','stat','urgent')),
  status VARCHAR(20) DEFAULT 'ordered' CHECK (status IN ('ordered','received','in_progress','resulted','cancelled')),
  icd10_codes TEXT,
  specimen_type VARCHAR(100),
  collection_instructions TEXT,
  ordered_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  resulted_at TIMESTAMPTZ,
  lis_confirmation VARCHAR(100),
  external_response JSONB,
  latency_ms INTEGER
);

-- Notification Log (Twilio SMS / SendGrid Email)
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('lab_critical','appointment_reminder','prescription_ready','message_received','general')),
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms','email','both')),
  recipient_phone VARCHAR(30),
  recipient_email VARCHAR(255),
  subject VARCHAR(300),
  body TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','delivered')),
  sms_external_id VARCHAR(100),
  email_external_id VARCHAR(100),
  sms_latency_ms INTEGER,
  email_latency_ms INTEGER,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_lab_results_patient ON lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_vital_signs_patient ON vital_signs(patient_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id);
