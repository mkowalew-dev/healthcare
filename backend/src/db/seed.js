const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./pool');
const fs = require('fs');
const path = require('path');

const SALT_ROUNDS = 10;

// Fixed UUIDs for referential integrity
const IDS = {
  // Departments
  deptInternalMed: '11111111-0000-0000-0000-000000000001',
  deptCardiology: '11111111-0000-0000-0000-000000000002',
  deptFamilyMed: '11111111-0000-0000-0000-000000000003',
  deptPediatrics: '11111111-0000-0000-0000-000000000004',
  deptOrtho: '11111111-0000-0000-0000-000000000005',
  deptOBGYN: '11111111-0000-0000-0000-000000000006',
  deptNeuro: '11111111-0000-0000-0000-000000000007',
  deptEndo: '11111111-0000-0000-0000-000000000008',
  deptDerm: '11111111-0000-0000-0000-000000000009',
  deptOnco: '11111111-0000-0000-0000-000000000010',

  // Provider user accounts
  userP1: '22222222-0000-0000-0000-000000000001',
  userP2: '22222222-0000-0000-0000-000000000002',
  userP3: '22222222-0000-0000-0000-000000000003',
  userP4: '22222222-0000-0000-0000-000000000004',
  userP5: '22222222-0000-0000-0000-000000000005',
  userP6: '22222222-0000-0000-0000-000000000006',
  userP7: '22222222-0000-0000-0000-000000000007',
  userP8: '22222222-0000-0000-0000-000000000008',

  // Provider records
  prov1: '33333333-0000-0000-0000-000000000001', // Dr. Michael Chen - Internal Medicine
  prov2: '33333333-0000-0000-0000-000000000002', // Dr. Sarah Williams - Cardiology
  prov3: '33333333-0000-0000-0000-000000000003', // Dr. James Rodriguez - Family Medicine
  prov4: '33333333-0000-0000-0000-000000000004', // Dr. Emily Thompson - Pediatrics
  prov5: '33333333-0000-0000-0000-000000000005', // Dr. David Kim - Orthopedics
  prov6: '33333333-0000-0000-0000-000000000006', // Dr. Lisa Martinez - OB/GYN
  prov7: '33333333-0000-0000-0000-000000000007', // Dr. Robert Anderson - Neurology
  prov8: '33333333-0000-0000-0000-000000000008', // Dr. Jennifer Davis - Endocrinology

  // Patient user accounts
  userPt1: '44444444-0000-0000-0000-000000000001', // DEMO: patient@demo.com
  userPt2: '44444444-0000-0000-0000-000000000002',
  userPt3: '44444444-0000-0000-0000-000000000003',
  userPt4: '44444444-0000-0000-0000-000000000004',
  userPt5: '44444444-0000-0000-0000-000000000005',
  userPt6: '44444444-0000-0000-0000-000000000006',
  userPt7: '44444444-0000-0000-0000-000000000007',
  userPt8: '44444444-0000-0000-0000-000000000008',
  userPt9: '44444444-0000-0000-0000-000000000009',
  userPt10: '44444444-0000-0000-0000-000000000010',

  // Admin user
  userAdmin: '55555555-0000-0000-0000-000000000001',

  // Patient records
  pat1: '66666666-0000-0000-0000-000000000001', // John Smith (demo patient)
  pat2: '66666666-0000-0000-0000-000000000002', // Mary Johnson
  pat3: '66666666-0000-0000-0000-000000000003', // Robert Davis
  pat4: '66666666-0000-0000-0000-000000000004', // Jennifer Wilson
  pat5: '66666666-0000-0000-0000-000000000005', // Michael Brown
  pat6: '66666666-0000-0000-0000-000000000006', // Patricia Martinez
  pat7: '66666666-0000-0000-0000-000000000007', // Christopher Jones
  pat8: '66666666-0000-0000-0000-000000000008', // Linda Garcia
  pat9: '66666666-0000-0000-0000-000000000009', // Matthew Rodriguez
  pat10: '66666666-0000-0000-0000-000000000010', // Barbara Lee
};

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🏥 CareConnect EHR - Database Seeding Started...\n');

    // Load and run schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ Schema created');

    // Clear existing data
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE clinical_notes, payments, bills, vital_signs, diagnoses, allergies,
               medications, lab_results, messages, appointments, patients, providers,
               departments, users RESTART IDENTITY CASCADE
    `);

    // Hash password for all demo accounts
    const demoPassword = await bcrypt.hash('Demo123!', SALT_ROUNDS);

    // ========== DEPARTMENTS ==========
    const departments = [
      [IDS.deptInternalMed, 'Internal Medicine', 'Building A, Floor 3', '(408) 555-0101'],
      [IDS.deptCardiology, 'Cardiology', 'Building B, Floor 2', '(408) 555-0102'],
      [IDS.deptFamilyMed, 'Family Medicine', 'Building A, Floor 1', '(408) 555-0103'],
      [IDS.deptPediatrics, 'Pediatrics', 'Building C, Floor 1', '(408) 555-0104'],
      [IDS.deptOrtho, 'Orthopedics', 'Building D, Floor 2', '(408) 555-0105'],
      [IDS.deptOBGYN, 'OB/GYN', 'Building C, Floor 3', '(408) 555-0106'],
      [IDS.deptNeuro, 'Neurology', 'Building B, Floor 4', '(408) 555-0107'],
      [IDS.deptEndo, 'Endocrinology', 'Building A, Floor 4', '(408) 555-0108'],
      [IDS.deptDerm, 'Dermatology', 'Building E, Floor 1', '(408) 555-0109'],
      [IDS.deptOnco, 'Oncology', 'Building F, Floor 2', '(408) 555-0110'],
    ];
    for (const [id, name, location, phone] of departments) {
      await client.query(
        'INSERT INTO departments (id, name, location, phone) VALUES ($1, $2, $3, $4)',
        [id, name, location, phone]
      );
    }
    console.log('✅ Departments seeded (10)');

    // ========== PROVIDER USERS ==========
    const providerUsers = [
      [IDS.userP1, 'dr.chen@careconnect.demo', 'provider'],
      [IDS.userP2, 'dr.williams@careconnect.demo', 'provider'],
      [IDS.userP3, 'dr.rodriguez@careconnect.demo', 'provider'],
      [IDS.userP4, 'dr.thompson@careconnect.demo', 'provider'],
      [IDS.userP5, 'dr.kim@careconnect.demo', 'provider'],
      [IDS.userP6, 'dr.martinez@careconnect.demo', 'provider'],
      [IDS.userP7, 'dr.anderson@careconnect.demo', 'provider'],
      [IDS.userP8, 'dr.davis@careconnect.demo', 'provider'],
    ];
    // Demo provider account
    providerUsers.push([IDS.userP1, 'provider@demo.com', 'provider']);
    // Actually override userP1 email
    for (const [id, email, role] of [
      [IDS.userP1, 'provider@demo.com', 'provider'],
      [IDS.userP2, 'dr.williams@careconnect.demo', 'provider'],
      [IDS.userP3, 'dr.rodriguez@careconnect.demo', 'provider'],
      [IDS.userP4, 'dr.thompson@careconnect.demo', 'provider'],
      [IDS.userP5, 'dr.kim@careconnect.demo', 'provider'],
      [IDS.userP6, 'dr.martinez@careconnect.demo', 'provider'],
      [IDS.userP7, 'dr.anderson@careconnect.demo', 'provider'],
      [IDS.userP8, 'dr.davis@careconnect.demo', 'provider'],
    ]) {
      await client.query(
        'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [id, email, demoPassword, role]
      );
    }

    // ========== PROVIDERS ==========
    const providers = [
      [IDS.prov1, IDS.userP1, 'Michael', 'Chen', 'Internal Medicine', '1234567890', IDS.deptInternalMed,
       'Dr. Chen specializes in the diagnosis and treatment of adult diseases. Board-certified with 15 years of experience.'],
      [IDS.prov2, IDS.userP2, 'Sarah', 'Williams', 'Cardiology', '2345678901', IDS.deptCardiology,
       'Dr. Williams is an interventional cardiologist with expertise in heart failure and coronary artery disease.'],
      [IDS.prov3, IDS.userP3, 'James', 'Rodriguez', 'Family Medicine', '3456789012', IDS.deptFamilyMed,
       'Dr. Rodriguez provides comprehensive care for patients of all ages with a focus on preventive medicine.'],
      [IDS.prov4, IDS.userP4, 'Emily', 'Thompson', 'Pediatrics', '4567890123', IDS.deptPediatrics,
       'Dr. Thompson is passionate about children\'s health and developmental care.'],
      [IDS.prov5, IDS.userP5, 'David', 'Kim', 'Orthopedic Surgery', '5678901234', IDS.deptOrtho,
       'Dr. Kim specializes in sports medicine and minimally invasive joint replacement surgery.'],
      [IDS.prov6, IDS.userP6, 'Lisa', 'Martinez', 'OB/GYN', '6789012345', IDS.deptOBGYN,
       'Dr. Martinez provides comprehensive women\'s health care including obstetrics and gynecology.'],
      [IDS.prov7, IDS.userP7, 'Robert', 'Anderson', 'Neurology', '7890123456', IDS.deptNeuro,
       'Dr. Anderson specializes in neurological disorders including epilepsy, MS, and stroke.'],
      [IDS.prov8, IDS.userP8, 'Jennifer', 'Davis', 'Endocrinology', '8901234567', IDS.deptEndo,
       'Dr. Davis focuses on diabetes management, thyroid disorders, and hormonal imbalances.'],
    ];
    for (const [id, userId, firstName, lastName, specialty, npi, deptId, bio] of providers) {
      await client.query(
        'INSERT INTO providers (id, user_id, first_name, last_name, specialty, npi, department_id, bio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, userId, firstName, lastName, specialty, npi, deptId, bio]
      );
    }
    console.log('✅ Providers seeded (8)');

    // ========== ADMIN USER ==========
    await client.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [IDS.userAdmin, 'admin@demo.com', demoPassword, 'admin']
    );
    console.log('✅ Admin user seeded');

    // ========== PATIENT USERS ==========
    const patientUsers = [
      [IDS.userPt1, 'patient@demo.com'],      // Demo account - John Smith
      [IDS.userPt2, 'mary.johnson@email.com'],
      [IDS.userPt3, 'robert.davis@email.com'],
      [IDS.userPt4, 'jennifer.wilson@email.com'],
      [IDS.userPt5, 'michael.brown@email.com'],
      [IDS.userPt6, 'patricia.martinez@email.com'],
      [IDS.userPt7, 'chris.jones@email.com'],
      [IDS.userPt8, 'linda.garcia@email.com'],
      [IDS.userPt9, 'matt.rodriguez@email.com'],
      [IDS.userPt10, 'barbara.lee@email.com'],
    ];
    for (const [id, email] of patientUsers) {
      await client.query(
        'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [id, email, demoPassword, 'patient']
      );
    }

    // ========== PATIENTS ==========
    const patients = [
      [IDS.pat1, IDS.userPt1, 'MRN000001', 'John', 'Smith', '1979-03-15', 'Male',
       '(408) 555-1001', '1234 Oak Street', 'San Jose', 'CA', '95101',
       'Blue Shield of California', 'BSC-445-2891024', IDS.prov1,
       'Jane Smith', '(408) 555-1002', 'O+'],
      [IDS.pat2, IDS.userPt2, 'MRN000002', 'Mary', 'Johnson', '1962-07-22', 'Female',
       '(408) 555-1003', '5678 Maple Ave', 'Santa Clara', 'CA', '95050',
       'Aetna', 'AET-778-9012345', IDS.prov2,
       'Bob Johnson', '(408) 555-1004', 'A+'],
      [IDS.pat3, IDS.userPt3, 'MRN000003', 'Robert', 'Davis', '1989-11-08', 'Male',
       '(669) 555-1005', '910 Pine Road', 'Sunnyvale', 'CA', '94086',
       'Cigna', 'CGN-123-4567890', IDS.prov3,
       'Susan Davis', '(669) 555-1006', 'B+'],
      [IDS.pat4, IDS.userPt4, 'MRN000004', 'Jennifer', 'Wilson', '1996-04-30', 'Female',
       '(650) 555-1007', '246 Elm Street', 'Palo Alto', 'CA', '94301',
       'Kaiser Permanente', 'KP-567-8901234', IDS.prov6,
       'Mark Wilson', '(650) 555-1008', 'AB-'],
      [IDS.pat5, IDS.userPt5, 'MRN000005', 'Michael', 'Brown', '1972-09-17', 'Male',
       '(408) 555-1009', '369 Cedar Lane', 'Campbell', 'CA', '95008',
       'United Healthcare', 'UHC-234-5678901', IDS.prov2,
       'Angela Brown', '(408) 555-1010', 'O-'],
      [IDS.pat6, IDS.userPt6, 'MRN000006', 'Patricia', 'Martinez', '1983-01-12', 'Female',
       '(408) 555-1011', '147 Birch Blvd', 'Los Gatos', 'CA', '95030',
       'Blue Shield of California', 'BSC-789-3456789', IDS.prov8,
       'Carlos Martinez', '(408) 555-1012', 'A-'],
      [IDS.pat7, IDS.userPt7, 'MRN000007', 'Christopher', 'Jones', '1957-06-28', 'Male',
       '(408) 555-1013', '852 Walnut Way', 'Morgan Hill', 'CA', '95037',
       'Medicare', 'MCR-345-6789012', IDS.prov1,
       'Margaret Jones', '(408) 555-1014', 'B-'],
      [IDS.pat8, IDS.userPt8, 'MRN000008', 'Linda', 'Garcia', '1969-12-05', 'Female',
       '(408) 555-1015', '753 Spruce Court', 'Milpitas', 'CA', '95035',
       'Anthem', 'ANT-456-7890123', IDS.prov7,
       'Jose Garcia', '(408) 555-1016', 'A+'],
      [IDS.pat9, IDS.userPt9, 'MRN000009', 'Matthew', 'Rodriguez', '2005-02-20', 'Male',
       '(831) 555-1017', '159 Aspen Drive', 'Gilroy', 'CA', '95020',
       'Medi-Cal', 'MCA-567-8901234', IDS.prov4,
       'Rosa Rodriguez', '(831) 555-1018', 'O+'],
      [IDS.pat10, IDS.userPt10, 'MRN000010', 'Barbara', 'Lee', '1951-08-14', 'Female',
       '(408) 555-1019', '486 Redwood Rd', 'Saratoga', 'CA', '95070',
       'Medicare', 'MCR-678-9012345', IDS.prov1,
       'Thomas Lee', '(408) 555-1020', 'AB+'],
    ];
    for (const [id, userId, mrn, fn, ln, dob, gender, phone, addr, city, state, zip, ins, insId, provId, ecName, ecPhone, bt] of patients) {
      await client.query(`
        INSERT INTO patients (id, user_id, mrn, first_name, last_name, date_of_birth, gender, phone,
          address, city, state, zip, insurance_provider, insurance_id, primary_provider_id,
          emergency_contact_name, emergency_contact_phone, blood_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [id, userId, mrn, fn, ln, dob, gender, phone, addr, city, state, zip, ins, insId, provId, ecName, ecPhone, bt]);
    }
    console.log('✅ Patients seeded (10)');

    // ========== ALLERGIES ==========
    const allergies = [
      [IDS.pat1, 'Penicillin', 'Hives, difficulty breathing', 'severe'],
      [IDS.pat1, 'Shellfish', 'Anaphylaxis', 'life_threatening'],
      [IDS.pat2, 'Sulfa drugs', 'Rash', 'moderate'],
      [IDS.pat2, 'Latex', 'Contact dermatitis', 'mild'],
      [IDS.pat3, 'Aspirin', 'Stomach bleeding', 'moderate'],
      [IDS.pat5, 'Codeine', 'Nausea, vomiting', 'moderate'],
      [IDS.pat6, 'Ibuprofen', 'Stomach pain', 'mild'],
      [IDS.pat7, 'Warfarin', 'Excessive bleeding', 'severe'],
      [IDS.pat8, 'Contrast dye', 'Allergic reaction', 'severe'],
      [IDS.pat10, 'Metformin', 'GI intolerance', 'mild'],
    ];
    for (const [patId, allergen, reaction, severity] of allergies) {
      await client.query(
        'INSERT INTO allergies (patient_id, allergen, reaction, severity) VALUES ($1,$2,$3,$4)',
        [patId, allergen, reaction, severity]
      );
    }
    console.log('✅ Allergies seeded');

    // ========== DIAGNOSES ==========
    const diagnoses = [
      [IDS.pat1, IDS.prov1, 'E11.9', 'Type 2 Diabetes Mellitus', '2019-06-15', 'chronic'],
      [IDS.pat1, IDS.prov1, 'I10', 'Essential Hypertension', '2018-03-20', 'chronic'],
      [IDS.pat1, IDS.prov1, 'E78.5', 'Hyperlipidemia', '2020-01-10', 'active'],
      [IDS.pat2, IDS.prov2, 'I25.10', 'Coronary Artery Disease', '2021-08-12', 'chronic'],
      [IDS.pat2, IDS.prov2, 'I50.9', 'Heart Failure', '2022-02-28', 'active'],
      [IDS.pat3, IDS.prov3, 'J45.20', 'Mild Intermittent Asthma', '2015-04-05', 'chronic'],
      [IDS.pat4, IDS.prov6, 'N94.3', 'Premenstrual Tension Syndrome', '2023-09-01', 'active'],
      [IDS.pat5, IDS.prov2, 'I10', 'Essential Hypertension', '2020-11-14', 'chronic'],
      [IDS.pat5, IDS.prov2, 'E11.9', 'Type 2 Diabetes Mellitus', '2021-05-20', 'chronic'],
      [IDS.pat6, IDS.prov8, 'E03.9', 'Hypothyroidism', '2022-07-08', 'chronic'],
      [IDS.pat7, IDS.prov1, 'G20', 'Parkinson\'s Disease', '2020-03-15', 'chronic'],
      [IDS.pat7, IDS.prov1, 'I10', 'Essential Hypertension', '2017-09-22', 'chronic'],
      [IDS.pat8, IDS.prov7, 'G35', 'Multiple Sclerosis', '2019-11-30', 'active'],
      [IDS.pat9, IDS.prov4, 'J06.9', 'Acute Upper Respiratory Infection', '2024-12-01', 'resolved'],
      [IDS.pat10, IDS.prov1, 'E11.9', 'Type 2 Diabetes Mellitus', '2010-06-10', 'chronic'],
      [IDS.pat10, IDS.prov1, 'M81.0', 'Osteoporosis', '2018-04-25', 'chronic'],
    ];
    for (const [patId, provId, icd, desc, date, status] of diagnoses) {
      await client.query(
        'INSERT INTO diagnoses (patient_id, provider_id, icd_code, description, diagnosed_date, status) VALUES ($1,$2,$3,$4,$5,$6)',
        [patId, provId, icd, desc, date, status]
      );
    }
    console.log('✅ Diagnoses seeded');

    // ========== APPOINTMENTS ==========
    const now = new Date();
    const future = (days, hour = 10) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const past = (days, hour = 10) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };

    const apptIds = {
      a1: uuidv4(), a2: uuidv4(), a3: uuidv4(), a4: uuidv4(), a5: uuidv4(),
      a6: uuidv4(), a7: uuidv4(), a8: uuidv4(), a9: uuidv4(), a10: uuidv4(),
      a11: uuidv4(), a12: uuidv4(), a13: uuidv4(), a14: uuidv4(), a15: uuidv4(),
    };

    const appointments = [
      // John Smith (pat1) appointments
      [apptIds.a1, IDS.pat1, IDS.prov1, future(7, 9), 30, 'office_visit', 'scheduled', 'Diabetes follow-up and A1C check', 'Building A, Room 302'],
      [apptIds.a2, IDS.pat1, IDS.prov1, future(21, 14), 30, 'telehealth', 'scheduled', 'Hypertension medication review', 'Telehealth'],
      [apptIds.a3, IDS.pat1, IDS.prov1, past(30, 10), 30, 'office_visit', 'completed', 'Annual wellness exam', 'Building A, Room 302'],
      [apptIds.a4, IDS.pat1, IDS.prov2, past(60, 11), 45, 'office_visit', 'completed', 'Cardiac screening', 'Building B, Room 201'],

      // Mary Johnson (pat2) appointments
      [apptIds.a5, IDS.pat2, IDS.prov2, future(3, 10), 45, 'office_visit', 'scheduled', 'Heart failure management', 'Building B, Room 201'],
      [apptIds.a6, IDS.pat2, IDS.prov2, past(14, 9), 45, 'completed', 'completed', 'EKG and stress test results', 'Building B, Room 201'],

      // Robert Davis (pat3)
      [apptIds.a7, IDS.pat3, IDS.prov3, future(14, 15), 30, 'office_visit', 'scheduled', 'Asthma review and inhaler renewal', 'Building A, Room 105'],
      [apptIds.a8, IDS.pat3, IDS.prov3, past(7, 13), 30, 'office_visit', 'completed', 'Chest congestion evaluation', 'Building A, Room 105'],

      // Patricia Martinez (pat6)
      [apptIds.a9, IDS.pat6, IDS.prov8, future(5, 11), 30, 'office_visit', 'scheduled', 'Thyroid panel review', 'Building A, Room 415'],
      [apptIds.a10, IDS.pat6, IDS.prov8, past(45, 10), 30, 'office_visit', 'completed', 'Thyroid medication adjustment', 'Building A, Room 415'],

      // Michael Brown (pat5)
      [apptIds.a11, IDS.pat5, IDS.prov2, future(10, 9), 45, 'office_visit', 'scheduled', 'BP medication review', 'Building B, Room 201'],
      [apptIds.a12, IDS.pat5, IDS.prov2, past(20, 14), 30, 'telehealth', 'completed', 'Blood pressure check-in', 'Telehealth'],

      // Barbara Lee (pat10)
      [apptIds.a13, IDS.pat10, IDS.prov1, future(2, 10), 30, 'office_visit', 'checked_in', 'Diabetes management', 'Building A, Room 302'],
      [apptIds.a14, IDS.pat10, IDS.prov1, past(90, 9), 30, 'office_visit', 'completed', 'Annual checkup', 'Building A, Room 302'],

      // Cancelled appointment
      [apptIds.a15, IDS.pat1, IDS.prov1, past(10, 14), 30, 'office_visit', 'cancelled', 'Routine follow-up', 'Building A, Room 302'],
    ];
    for (const [id, patId, provId, scheduledAt, duration, type, status, complaint, location] of appointments) {
      await client.query(`
        INSERT INTO appointments (id, patient_id, provider_id, scheduled_at, duration_minutes, type, status, chief_complaint, location)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [id, patId, provId, scheduledAt, duration, type, status, complaint, location]);
    }
    console.log('✅ Appointments seeded (15)');

    // ========== VITAL SIGNS ==========
    const vitals = [
      [IDS.pat1, apptIds.a3, past(30, 10), 128, 82, 74, 98.6, 16, 98, 195.4, 70.0, 28.0, 2],
      [IDS.pat1, apptIds.a4, past(60, 11), 132, 85, 78, 98.4, 17, 97, 197.2, 70.0, 28.3, 1],
      [IDS.pat2, apptIds.a6, past(14, 9), 145, 92, 88, 98.8, 18, 96, 158.6, 65.0, 26.4, 3],
      [IDS.pat3, apptIds.a8, past(7, 13), 118, 76, 82, 99.1, 20, 95, 172.0, 69.0, 25.4, 1],
      [IDS.pat5, apptIds.a12, past(20, 14), 156, 98, 90, 98.2, 16, 98, 210.8, 68.5, 31.0, 0],
      [IDS.pat6, apptIds.a10, past(45, 10), 110, 72, 68, 98.7, 14, 99, 135.2, 63.0, 23.9, 0],
      [IDS.pat10, apptIds.a14, past(90, 9), 138, 88, 76, 98.5, 15, 97, 162.4, 62.5, 29.0, 1],
    ];
    for (const [patId, apptId, recordedAt, bps, bpd, hr, temp, rr, o2, weight, height, bmi, pain] of vitals) {
      await client.query(`
        INSERT INTO vital_signs (patient_id, appointment_id, recorded_at, blood_pressure_systolic,
          blood_pressure_diastolic, heart_rate, temperature, respiratory_rate, oxygen_saturation,
          weight, height, bmi, pain_level)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [patId, apptId, recordedAt, bps, bpd, hr, temp, rr, o2, weight, height, bmi, pain]);
    }
    console.log('✅ Vital signs seeded');

    // ========== LAB RESULTS ==========
    const labs = [
      // John Smith - Metabolic panel
      [IDS.pat1, IDS.prov1, past(30), past(29), 'Hemoglobin A1c', 'A1C', '7.8', '%', '< 5.7%', 'abnormal', 'CBC Panel', 'Elevated - above target'],
      [IDS.pat1, IDS.prov1, past(30), past(29), 'Glucose, Fasting', 'GLU', '142', 'mg/dL', '70-100 mg/dL', 'abnormal', 'Metabolic Panel', 'Above normal range'],
      [IDS.pat1, IDS.prov1, past(30), past(29), 'Creatinine', 'CREAT', '0.9', 'mg/dL', '0.7-1.2 mg/dL', 'resulted', 'Metabolic Panel', null],
      [IDS.pat1, IDS.prov1, past(30), past(29), 'Total Cholesterol', 'CHOL', '218', 'mg/dL', '< 200 mg/dL', 'abnormal', 'Lipid Panel', 'Borderline high'],
      [IDS.pat1, IDS.prov1, past(30), past(29), 'LDL Cholesterol', 'LDL', '142', 'mg/dL', '< 100 mg/dL', 'abnormal', 'Lipid Panel', 'Above target for diabetic'],
      [IDS.pat1, IDS.prov1, past(30), past(29), 'HDL Cholesterol', 'HDL', '48', 'mg/dL', '> 40 mg/dL', 'resulted', 'Lipid Panel', null],
      [IDS.pat1, IDS.prov1, past(60), past(59), 'Hemoglobin A1c', 'A1C', '8.1', '%', '< 5.7%', 'abnormal', 'CBC Panel', null],
      [IDS.pat1, IDS.prov1, past(3), null, 'Complete Blood Count', 'CBC', null, null, null, 'pending', 'CBC Panel', 'Ordered pending'],

      // Mary Johnson - Cardiac labs
      [IDS.pat2, IDS.prov2, past(14), past(13), 'BNP (Brain Natriuretic Peptide)', 'BNP', '485', 'pg/mL', '< 100 pg/mL', 'critical', 'Cardiac Panel', 'CRITICAL - Heart failure marker elevated'],
      [IDS.pat2, IDS.prov2, past(14), past(13), 'Troponin I', 'TROP-I', '0.02', 'ng/mL', '< 0.04 ng/mL', 'resulted', 'Cardiac Panel', 'Within normal limits'],
      [IDS.pat2, IDS.prov2, past(14), past(13), 'eGFR', 'EGFR', '52', 'mL/min', '> 60 mL/min', 'abnormal', 'Renal Panel', 'Mild kidney impairment'],

      // Robert Davis - Pulmonary
      [IDS.pat3, IDS.prov3, past(7), past(7), 'Peak Flow', 'PF', '380', 'L/min', '> 400 L/min', 'abnormal', 'Pulmonary Panel', 'Below predicted normal'],
      [IDS.pat3, IDS.prov3, past(7), past(7), 'SpO2 at Rest', 'SPO2', '96', '%', '95-100%', 'resulted', 'Pulmonary Panel', null],

      // Patricia Martinez - Thyroid
      [IDS.pat6, IDS.prov8, past(45), past(44), 'TSH (Thyroid Stimulating Hormone)', 'TSH', '6.8', 'mIU/L', '0.4-4.0 mIU/L', 'abnormal', 'Thyroid Panel', 'Elevated - consistent with hypothyroidism'],
      [IDS.pat6, IDS.prov8, past(45), past(44), 'Free T4', 'FT4', '0.7', 'ng/dL', '0.8-1.8 ng/dL', 'abnormal', 'Thyroid Panel', 'Low'],
      [IDS.pat6, IDS.prov8, past(7), null, 'TSH (Thyroid Stimulating Hormone)', 'TSH', null, null, null, 'pending', 'Thyroid Panel', 'Follow-up after dose adjustment'],

      // Michael Brown - Metabolic
      [IDS.pat5, IDS.prov2, past(20), past(19), 'Blood Pressure Profile', 'BPP', '158/98', 'mmHg', '< 130/80 mmHg', 'abnormal', 'Cardiac Panel', 'Stage 2 hypertension'],
      [IDS.pat5, IDS.prov2, past(20), past(19), 'Potassium', 'K', '3.6', 'mEq/L', '3.5-5.0 mEq/L', 'resulted', 'Metabolic Panel', null],

      // Barbara Lee
      [IDS.pat10, IDS.prov1, past(5), null, 'Hemoglobin A1c', 'A1C', null, null, null, 'pending', 'Diabetic Panel', null],
      [IDS.pat10, IDS.prov1, past(90), past(89), 'Hemoglobin A1c', 'A1C', '8.4', '%', '< 5.7%', 'abnormal', 'Diabetic Panel', 'Poorly controlled'],
      [IDS.pat10, IDS.prov1, past(90), past(89), 'Bone Density (DEXA)', 'DEXA', '-2.8', 'T-score', '>-1.0', 'abnormal', 'Bone Panel', 'Osteoporosis confirmed'],
    ];
    for (const [patId, provId, orderedAt, resultedAt, testName, testCode, value, unit, refRange, status, panel, notes] of labs) {
      await client.query(`
        INSERT INTO lab_results (patient_id, provider_id, ordered_at, resulted_at, test_name, test_code,
          value, unit, reference_range, status, panel_name, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [patId, provId, orderedAt, resultedAt, testName, testCode, value, unit, refRange, status, panel, notes]);
    }
    console.log('✅ Lab results seeded (21)');

    // ========== MEDICATIONS ==========
    const meds = [
      // John Smith
      [IDS.pat1, IDS.prov1, 'Metformin', 'metformin HCl', '1000mg', 'Twice daily', 'oral', '2019-07-01', null, 'active', 'Take with meals to reduce GI upset', 3],
      [IDS.pat1, IDS.prov1, 'Lisinopril', 'lisinopril', '10mg', 'Once daily', 'oral', '2018-04-01', null, 'active', 'Take in the morning; monitor for dry cough', 5],
      [IDS.pat1, IDS.prov1, 'Atorvastatin', 'atorvastatin calcium', '40mg', 'Once daily at bedtime', 'oral', '2020-02-01', null, 'active', 'Take at bedtime; avoid grapefruit', 2],
      [IDS.pat1, IDS.prov1, 'Aspirin', 'aspirin', '81mg', 'Once daily', 'oral', '2019-07-01', null, 'active', 'Take with food', 11],
      [IDS.pat1, IDS.prov1, 'Glucophage XR', 'metformin extended-release', '500mg', 'Once daily', 'oral', '2018-01-01', '2019-06-30', 'discontinued', 'Switched to regular Metformin', 0],

      // Mary Johnson
      [IDS.pat2, IDS.prov2, 'Carvedilol', 'carvedilol', '25mg', 'Twice daily', 'oral', '2021-09-01', null, 'active', 'Do not stop abruptly; take with food', 2],
      [IDS.pat2, IDS.prov2, 'Furosemide', 'furosemide', '40mg', 'Once daily', 'oral', '2022-03-01', null, 'active', 'Take in the morning; monitor fluid intake', 4],
      [IDS.pat2, IDS.prov2, 'Spironolactone', 'spironolactone', '25mg', 'Once daily', 'oral', '2022-03-01', null, 'active', 'Monitor potassium levels', 0],
      [IDS.pat2, IDS.prov2, 'Lisinopril', 'lisinopril', '5mg', 'Once daily', 'oral', '2021-09-01', null, 'active', 'Monitor renal function and electrolytes', 3],

      // Robert Davis
      [IDS.pat3, IDS.prov3, 'Albuterol Inhaler', 'albuterol sulfate', '90mcg/actuation', 'As needed (2 puffs)', 'inhalation', '2015-05-01', null, 'active', 'Use for acute bronchospasm; max 8 puffs/day', 1],
      [IDS.pat3, IDS.prov3, 'Fluticasone Inhaler', 'fluticasone propionate', '110mcg', 'Twice daily (2 puffs)', 'inhalation', '2020-01-01', null, 'active', 'Rinse mouth after use', 0],

      // Jennifer Wilson
      [IDS.pat4, IDS.prov6, 'Ortho Tri-Cyclen', 'norgestimate/ethinyl estradiol', '0.18/0.25mg', 'Once daily', 'oral', '2023-10-01', null, 'active', 'Take at same time each day', 0],

      // Michael Brown
      [IDS.pat5, IDS.prov2, 'Amlodipine', 'amlodipine besylate', '10mg', 'Once daily', 'oral', '2020-12-01', null, 'active', 'Can cause ankle swelling', 5],
      [IDS.pat5, IDS.prov2, 'Metformin', 'metformin HCl', '500mg', 'Twice daily', 'oral', '2021-06-01', null, 'active', 'Take with meals', 3],
      [IDS.pat5, IDS.prov2, 'Hydrochlorothiazide', 'hydrochlorothiazide', '25mg', 'Once daily', 'oral', '2021-01-01', null, 'active', 'Take in the morning', 6],

      // Patricia Martinez
      [IDS.pat6, IDS.prov8, 'Levothyroxine', 'levothyroxine sodium', '75mcg', 'Once daily', 'oral', '2022-08-01', null, 'active', 'Take 30 min before breakfast on empty stomach', 1],

      // Christopher Jones
      [IDS.pat7, IDS.prov1, 'Carbidopa/Levodopa', 'carbidopa-levodopa', '25-100mg', 'Three times daily', 'oral', '2020-04-01', null, 'active', 'Protein can reduce absorption', 2],
      [IDS.pat7, IDS.prov1, 'Rasagiline', 'rasagiline mesylate', '1mg', 'Once daily', 'oral', '2021-01-01', null, 'active', 'Avoid tyramine-rich foods', 0],
      [IDS.pat7, IDS.prov1, 'Lisinopril', 'lisinopril', '20mg', 'Once daily', 'oral', '2017-10-01', null, 'active', 'Monitor blood pressure', 4],

      // Linda Garcia
      [IDS.pat8, IDS.prov7, 'Interferon Beta-1a', 'interferon beta-1a', '30mcg', 'Once weekly', 'injection', '2020-01-01', null, 'active', 'Self-inject in thigh or abdomen; rotate sites', 1],
      [IDS.pat8, IDS.prov7, 'Baclofen', 'baclofen', '10mg', 'Three times daily', 'oral', '2021-03-01', null, 'active', 'Do not stop abruptly; may cause withdrawal', 0],

      // Barbara Lee
      [IDS.pat10, IDS.prov1, 'Insulin Glargine', 'insulin glargine', '20 units', 'Once daily at bedtime', 'subcutaneous', '2015-01-01', null, 'active', 'Inject at same time each night; rotate sites', 2],
      [IDS.pat10, IDS.prov1, 'Alendronate', 'alendronate sodium', '70mg', 'Once weekly', 'oral', '2018-05-01', null, 'active', 'Take on empty stomach with full glass of water; remain upright 30 min', 0],
    ];
    for (const [patId, provId, name, generic, dosage, freq, route, startDate, endDate, status, instructions, refills] of meds) {
      await client.query(`
        INSERT INTO medications (patient_id, provider_id, name, generic_name, dosage, frequency, route,
          start_date, end_date, status, instructions, refills_remaining)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [patId, provId, name, generic, dosage, freq, route, startDate, endDate, status, instructions, refills]);
    }
    console.log('✅ Medications seeded (22)');

    // ========== BILLS ==========
    const billIds = { b1: uuidv4(), b2: uuidv4(), b3: uuidv4(), b4: uuidv4(), b5: uuidv4(), b6: uuidv4(), b7: uuidv4(), b8: uuidv4() };
    const dueDate = (daysFromNow) => {
      const d = new Date(now);
      d.setDate(d.getDate() + daysFromNow);
      return d.toISOString().split('T')[0];
    };
    const pastDate = (daysAgo) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    };

    const bills = [
      [billIds.b1, IDS.pat1, apptIds.a3, pastDate(30), dueDate(15), 450.00, 360.00, 90.00, 0, 'pending', 'Office Visit - Diabetes Management (99214)'],
      [billIds.b2, IDS.pat1, apptIds.a4, pastDate(60), pastDate(30), 325.00, 260.00, 65.00, 65.00, 'paid', 'Cardiology Consultation (99243)'],
      [billIds.b3, IDS.pat1, null, pastDate(45), pastDate(15), 180.00, 0, 180.00, 0, 'overdue', 'Laboratory Services - Lipid Panel, HbA1c'],
      [billIds.b4, IDS.pat2, apptIds.a6, pastDate(14), dueDate(16), 875.00, 700.00, 175.00, 0, 'pending', 'Cardiology - Stress Test & EKG (93015, 93000)'],
      [billIds.b5, IDS.pat3, apptIds.a8, pastDate(7), dueDate(23), 275.00, 220.00, 55.00, 55.00, 'paid', 'Office Visit - Respiratory Evaluation (99213)'],
      [billIds.b6, IDS.pat5, apptIds.a12, pastDate(20), dueDate(10), 195.00, 156.00, 39.00, 0, 'pending', 'Telehealth Visit - Hypertension Management (99212)'],
      [billIds.b7, IDS.pat6, apptIds.a10, pastDate(45), pastDate(10), 310.00, 248.00, 62.00, 0, 'overdue', 'Endocrinology - Thyroid Evaluation (99214)'],
      [billIds.b8, IDS.pat10, apptIds.a14, pastDate(90), pastDate(60), 520.00, 416.00, 104.00, 104.00, 'paid', 'Annual Wellness Visit with Labs (G0439)'],
    ];
    for (const [id, patId, apptId, serviceDate, dueDateVal, total, ins, patAmt, paid, status, desc] of bills) {
      await client.query(`
        INSERT INTO bills (id, patient_id, appointment_id, service_date, due_date, total_amount,
          insurance_amount, patient_amount, paid_amount, status, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [id, patId, apptId, serviceDate, dueDateVal, total, ins, patAmt, paid, status, desc]);
    }
    console.log('✅ Bills seeded (8)');

    // ========== PAYMENTS ==========
    const payments = [
      [billIds.b2, IDS.pat1, 65.00, pastDate(28), 'credit_card', 'CC-2024-' + Math.random().toString(36).substr(2, 9).toUpperCase()],
      [billIds.b5, IDS.pat3, 55.00, pastDate(6), 'credit_card', 'CC-2024-' + Math.random().toString(36).substr(2, 9).toUpperCase()],
      [billIds.b8, IDS.pat10, 104.00, pastDate(58), 'check', 'CHK-' + Math.floor(Math.random() * 9000 + 1000)],
    ];
    for (const [billId, patId, amount, payDate, method, confirm] of payments) {
      await client.query(
        'INSERT INTO payments (bill_id, patient_id, amount, payment_date, payment_method, confirmation_number) VALUES ($1,$2,$3,$4,$5,$6)',
        [billId, patId, amount, payDate, method, confirm]
      );
    }
    console.log('✅ Payments seeded');

    // ========== MESSAGES ==========
    const threadId1 = uuidv4();
    const threadId2 = uuidv4();
    const threadId3 = uuidv4();
    const threadId4 = uuidv4();

    const messages = [
      [threadId1, IDS.userPt1, IDS.userP1, 'Question about Metformin dosage',
       'Dr. Chen,\n\nI\'ve been experiencing some nausea with my current Metformin dosage. Should I take it with a larger meal? I noticed it seems worse in the morning.\n\nThank you,\nJohn Smith', past(5), past(4), 'general'],
      [threadId1, IDS.userP1, IDS.userPt1, 'Re: Question about Metformin dosage',
       'Hello Mr. Smith,\n\nYes, taking Metformin with your largest meal of the day can significantly reduce nausea. Try taking it with dinner and see if that helps. If the nausea persists after 2 weeks, please call our office.\n\nBest,\nDr. Chen', past(4), past(4), 'general'],
      [threadId2, IDS.userPt1, IDS.userP1, 'Refill Request - Lisinopril',
       'I need a refill for my Lisinopril 10mg. My pharmacy is Walgreens on Stevens Creek Blvd.\n\nThank you', past(2), null, 'prescription_refill'],
      [threadId3, IDS.userPt2, IDS.userP2, 'Shortness of breath',
       'Dr. Williams,\n\nI\'ve been experiencing increased shortness of breath when climbing stairs over the past 3 days. Should I come in sooner than my scheduled appointment?\n\nMary Johnson', past(1), null, 'general'],
      [threadId4, IDS.userP1, IDS.userPt1, 'Lab Results Available',
       'Mr. Smith,\n\nYour recent lab results are now available in your portal. Your A1C has improved from 8.1% to 7.8%, which is progress! However, your LDL cholesterol remains above target. We should discuss adding or adjusting your statin medication at your upcoming appointment.\n\nDr. Chen', past(28), past(27), 'test_result'],
    ];
    for (const [threadId, senderId, recipientId, subject, body, sentAt, readAt, msgType] of messages) {
      await client.query(`
        INSERT INTO messages (thread_id, sender_id, recipient_id, subject, body, sent_at, read_at, message_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [threadId, senderId, recipientId, subject, body, sentAt, readAt, msgType]);
    }
    console.log('✅ Messages seeded');

    // ========== CLINICAL NOTES ==========
    const notes = [
      [IDS.pat1, IDS.prov1, apptIds.a3, 'progress', `SUBJECTIVE:
Patient John Smith, 45M, presents for follow-up of Type 2 Diabetes and Hypertension.
Chief Complaint: Annual wellness exam and medication review.
Patient reports overall good compliance with medications. Occasional nausea with Metformin.
Denies chest pain, shortness of breath, dizziness. Reports fasting glucose readings 130-150 at home.

OBJECTIVE:
Vitals: BP 128/82, HR 74, Temp 98.6°F, O2 98%, Weight 195.4 lbs, Height 70 inches
General: Alert and oriented, in no acute distress
Cardiovascular: Regular rate and rhythm, no murmurs
Respiratory: Clear to auscultation bilaterally
Abdomen: Soft, non-tender

Labs reviewed: HbA1c 7.8% (improved from 8.1%), Fasting glucose 142, LDL 142

ASSESSMENT:
1. Type 2 Diabetes - suboptimally controlled, improving trend
2. Hypertension - moderately controlled
3. Hyperlipidemia - LDL above target

PLAN:
1. Continue Metformin 1000mg BID - advise taking with dinner
2. Continue Lisinopril 10mg daily - BP trending better
3. Increase Atorvastatin to 40mg daily (from 20mg)
4. Order repeat HbA1c in 3 months
5. Referred to diabetes education program
6. Follow up in 3 months or sooner if concerns`],
      [IDS.pat2, IDS.prov2, apptIds.a6, 'progress', `SUBJECTIVE:
Patient Mary Johnson, 62F, with known CAD and heart failure, presents for results review.
Reports 2+ pillow orthopnea, mild ankle edema. No chest pain. Compliance with medications good.

OBJECTIVE:
Vitals: BP 145/92, HR 88, O2 96%, Weight 158.6 lbs
Cardiovascular: S3 gallop present, JVD +2cm
Lower extremities: Bilateral pitting edema 2+
EKG: Sinus rhythm, LBBB unchanged from prior
BNP: 485 pg/mL (elevated)

ASSESSMENT:
1. Acute on chronic heart failure exacerbation - BNP markedly elevated
2. Hypertension - poorly controlled
3. Edema - consistent with fluid overload

PLAN:
1. Increase Furosemide to 40mg BID x7 days, then reassess
2. Daily weights - call if >3lb gain in 1 day or >5lb in week
3. Fluid restriction 1.5L/day
4. Low sodium diet reinforced
5. Urgent follow up in 1 week`],
    ];
    for (const [patId, provId, apptId, noteType, content] of notes) {
      await client.query(
        'INSERT INTO clinical_notes (patient_id, provider_id, appointment_id, note_type, content) VALUES ($1,$2,$3,$4,$5)',
        [patId, provId, apptId, noteType, content]
      );
    }
    console.log('✅ Clinical notes seeded');

    await client.query('COMMIT');

    console.log('\n🎉 Database seeding complete!\n');
    console.log('═══════════════════════════════════════════');
    console.log('  DEMO LOGIN CREDENTIALS');
    console.log('═══════════════════════════════════════════');
    console.log('  Patient:  patient@demo.com  / Demo123!');
    console.log('           (John Smith, MRN000001)');
    console.log('  Provider: provider@demo.com / Demo123!');
    console.log('           (Dr. Michael Chen, Internal Medicine)');
    console.log('  Admin:    admin@demo.com    / Demo123!');
    console.log('═══════════════════════════════════════════\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
