# CareConnect EHR

An EPIC-compatible Electronic Health Record (EHR) demo application built for demonstrating ThousandEyes Assurance and Splunk Observability technologies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS (Cisco theme) |
| Backend | Node.js + Express |
| Database | PostgreSQL 15 |
| Auth | JWT (12h expiry) |
| Charts | Recharts |

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Patient** | `patient@demo.com` | `Demo123!` |
| **Provider** | `provider@demo.com` | `Demo123!` |
| **Admin** | `admin@demo.com` | `Demo123!` |

## Quick Start

**Prerequisites:** Node.js 20+, PostgreSQL 15

1. Start PostgreSQL and create the database:
```bash
createdb careconnect
```

2. Backend:

```bash
cd backend
cp .env.example .env
npm install
npm run seed      # Creates schema + seeds data
npm run dev       # Starts on :3001
```

3. Frontend:
```bash
cd frontend
npm install
npm run dev       # Starts on :5173
```

## Features

### Patient Portal (MyChart-like)
- **Dashboard** — Upcoming appointments, billing alerts, lab results summary, active medications
- **Appointments** — View upcoming/past/cancelled visits, schedule new appointments
- **Test Results** — Lab results with reference ranges, abnormal flagging, A1C trend chart
- **Medications** — Active prescriptions, refill requests
- **Billing** — Statements, insurance breakdown, online payment
- **Messages** — Secure messaging with care team
- **Health Summary** — Vitals trends, allergies, problem list, demographics

### Provider Portal (Clinical Workspace)
- **Dashboard** — Today's schedule, recent messages, patient metrics
- **Patient List** — Search patients by name/MRN, quick chart access
- **Patient Chart** — Full EPIC-like chart with tabs: Summary, Medications, Labs, Visits, Notes, Vitals
- **Schedule** — Weekly calendar view of appointments
- **Messages** — Inbox/sent with reply capability

### Admin Portal
- **Dashboard** — KPIs, appointment trend charts, department utilization, user distribution
- **User Management** — View all users, activate/deactivate accounts
- **Departments** — Department overview with provider counts

## Observability Integration

### ThousandEyes
- `/health` endpoint for synthetic monitoring
- Multi-step transaction flows: login → navigate → load data
- All API calls include `x-request-id` correlation headers

### Splunk
- All API requests logged in structured JSON format
- Fields: `timestamp`, `level`, `message`, `requestId`, `method`, `path`, `statusCode`, `duration`, `userId`, `userRole`
- Error and warning events include stack traces

## API Endpoints

```
GET  /health                          Health check
POST /api/auth/login                  Login
GET  /api/auth/me                     Current user

GET  /api/patients                    List patients (provider/admin)
GET  /api/patients/me                 Patient profile (patient)
GET  /api/patients/:id                Patient details
GET  /api/patients/:id/summary        Full chart summary
GET  /api/patients/:id/vitals         Vital signs history

GET  /api/providers                   List providers
GET  /api/providers/:id/availability  Available time slots

GET  /api/appointments                List appointments
POST /api/appointments                Schedule appointment
PATCH /api/appointments/:id/cancel    Cancel appointment

GET  /api/labs                        Lab results
GET  /api/medications                 Medications
POST /api/medications/:id/refill-request  Request refill

GET  /api/bills                       Bills
GET  /api/bills/summary               Balance summary
POST /api/bills/:id/pay               Process payment

GET  /api/messages                    Messages (inbox/sent)
POST /api/messages                    Send message

GET  /api/admin/stats                 System statistics
GET  /api/admin/users                 All users
```

## Seed Data

The database is pre-loaded with:
- **8 providers** across 10 departments (Internal Medicine, Cardiology, Family Medicine, Pediatrics, Orthopedics, OB/GYN, Neurology, Endocrinology)
- **10 patients** with full demographics, insurance, and emergency contacts
- **15 appointments** (upcoming, past, cancelled)
- **21 lab results** (normal, abnormal, critical, pending)
- **22 medications** (active and discontinued)
- **8 bills** with insurance breakdown (paid, pending, overdue)
- **5 messages** in 4 conversation threads
- **2 clinical notes** with SOAP format
- **7 vital sign records** with trending data
- **Allergies, diagnoses, and problem lists** for all patients
