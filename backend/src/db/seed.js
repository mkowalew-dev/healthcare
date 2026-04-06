const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./pool');
const fs = require('fs');
const path = require('path');

const SALT_ROUNDS = 10;

// Fixed UUIDs for referential integrity
const IDS = {
  // Departments (14)
  deptInternalMed: '11111111-0000-0000-0000-000000000001',
  deptCardiology:  '11111111-0000-0000-0000-000000000002',
  deptFamilyMed:   '11111111-0000-0000-0000-000000000003',
  deptPediatrics:  '11111111-0000-0000-0000-000000000004',
  deptOrtho:       '11111111-0000-0000-0000-000000000005',
  deptOBGYN:       '11111111-0000-0000-0000-000000000006',
  deptNeuro:       '11111111-0000-0000-0000-000000000007',
  deptEndo:        '11111111-0000-0000-0000-000000000008',
  deptDerm:        '11111111-0000-0000-0000-000000000009',
  deptOnco:        '11111111-0000-0000-0000-000000000010',
  deptPulmo:       '11111111-0000-0000-0000-000000000011',
  deptRheum:       '11111111-0000-0000-0000-000000000012',
  deptGastro:      '11111111-0000-0000-0000-000000000013',
  deptUrgent:      '11111111-0000-0000-0000-000000000014',

  // Provider user accounts (12)
  userP1:  '22222222-0000-0000-0000-000000000001', // provider@demo.com
  userP2:  '22222222-0000-0000-0000-000000000002',
  userP3:  '22222222-0000-0000-0000-000000000003',
  userP4:  '22222222-0000-0000-0000-000000000004',
  userP5:  '22222222-0000-0000-0000-000000000005',
  userP6:  '22222222-0000-0000-0000-000000000006',
  userP7:  '22222222-0000-0000-0000-000000000007',
  userP8:  '22222222-0000-0000-0000-000000000008',
  userP9:  '22222222-0000-0000-0000-000000000009',
  userP10: '22222222-0000-0000-0000-000000000010',
  userP11: '22222222-0000-0000-0000-000000000011',
  userP12: '22222222-0000-0000-0000-000000000012',

  // Provider records (12)
  prov1:  '33333333-0000-0000-0000-000000000001', // Dr. Michael Chen - Internal Medicine
  prov2:  '33333333-0000-0000-0000-000000000002', // Dr. Sarah Williams - Cardiology
  prov3:  '33333333-0000-0000-0000-000000000003', // Dr. James Rodriguez - Family Medicine
  prov4:  '33333333-0000-0000-0000-000000000004', // Dr. Emily Thompson - Pediatrics
  prov5:  '33333333-0000-0000-0000-000000000005', // Dr. David Kim - Orthopedics
  prov6:  '33333333-0000-0000-0000-000000000006', // Dr. Lisa Martinez - OB/GYN
  prov7:  '33333333-0000-0000-0000-000000000007', // Dr. Robert Anderson - Neurology
  prov8:  '33333333-0000-0000-0000-000000000008', // Dr. Jennifer Davis - Endocrinology
  prov9:  '33333333-0000-0000-0000-000000000009', // Dr. Thomas Parker - Pulmonology
  prov10: '33333333-0000-0000-0000-000000000010', // Dr. Amanda Foster - Rheumatology
  prov11: '33333333-0000-0000-0000-000000000011', // Dr. Kevin Nguyen - Gastroenterology
  prov12: '33333333-0000-0000-0000-000000000012', // Dr. Rachel Cooper - Urgent Care

  // Patient user accounts (25)
  userPt1:  '44444444-0000-0000-0000-000000000001', // DEMO: patient@demo.com
  userPt2:  '44444444-0000-0000-0000-000000000002',
  userPt3:  '44444444-0000-0000-0000-000000000003',
  userPt4:  '44444444-0000-0000-0000-000000000004',
  userPt5:  '44444444-0000-0000-0000-000000000005',
  userPt6:  '44444444-0000-0000-0000-000000000006',
  userPt7:  '44444444-0000-0000-0000-000000000007',
  userPt8:  '44444444-0000-0000-0000-000000000008',
  userPt9:  '44444444-0000-0000-0000-000000000009',
  userPt10: '44444444-0000-0000-0000-000000000010',
  userPt11: '44444444-0000-0000-0000-000000000011',
  userPt12: '44444444-0000-0000-0000-000000000012',
  userPt13: '44444444-0000-0000-0000-000000000013',
  userPt14: '44444444-0000-0000-0000-000000000014',
  userPt15: '44444444-0000-0000-0000-000000000015',
  userPt16: '44444444-0000-0000-0000-000000000016',
  userPt17: '44444444-0000-0000-0000-000000000017',
  userPt18: '44444444-0000-0000-0000-000000000018',
  userPt19: '44444444-0000-0000-0000-000000000019',
  userPt20: '44444444-0000-0000-0000-000000000020',
  userPt21: '44444444-0000-0000-0000-000000000021',
  userPt22: '44444444-0000-0000-0000-000000000022',
  userPt23: '44444444-0000-0000-0000-000000000023',
  userPt24: '44444444-0000-0000-0000-000000000024',
  userPt25: '44444444-0000-0000-0000-000000000025',

  // Admin user
  userAdmin: '55555555-0000-0000-0000-000000000001',

  // Patient records (25)
  pat1:  '66666666-0000-0000-0000-000000000001', // John Smith (demo)
  pat2:  '66666666-0000-0000-0000-000000000002', // Mary Johnson
  pat3:  '66666666-0000-0000-0000-000000000003', // Robert Davis
  pat4:  '66666666-0000-0000-0000-000000000004', // Jennifer Wilson
  pat5:  '66666666-0000-0000-0000-000000000005', // Michael Brown
  pat6:  '66666666-0000-0000-0000-000000000006', // Patricia Martinez
  pat7:  '66666666-0000-0000-0000-000000000007', // Christopher Jones
  pat8:  '66666666-0000-0000-0000-000000000008', // Linda Garcia
  pat9:  '66666666-0000-0000-0000-000000000009', // Matthew Rodriguez
  pat10: '66666666-0000-0000-0000-000000000010', // Barbara Lee
  pat11: '66666666-0000-0000-0000-000000000011', // William Taylor
  pat12: '66666666-0000-0000-0000-000000000012', // Elizabeth Thomas
  pat13: '66666666-0000-0000-0000-000000000013', // James Jackson
  pat14: '66666666-0000-0000-0000-000000000014', // Susan White
  pat15: '66666666-0000-0000-0000-000000000015', // David Harris
  pat16: '66666666-0000-0000-0000-000000000016', // Karen Clark
  pat17: '66666666-0000-0000-0000-000000000017', // Richard Lewis
  pat18: '66666666-0000-0000-0000-000000000018', // Nancy Walker
  pat19: '66666666-0000-0000-0000-000000000019', // Charles Hall
  pat20: '66666666-0000-0000-0000-000000000020', // Betty Allen
  pat21: '66666666-0000-0000-0000-000000000021', // Daniel Young
  pat22: '66666666-0000-0000-0000-000000000022', // Helen King
  pat23: '66666666-0000-0000-0000-000000000023', // Paul Wright
  pat24: '66666666-0000-0000-0000-000000000024', // Sandra Scott
  pat25: '66666666-0000-0000-0000-000000000025', // George Green
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

    // ========== DEPARTMENTS (14) ==========
    const departments = [
      [IDS.deptInternalMed, 'Internal Medicine',  'Building A, Floor 3', '(408) 555-0101'],
      [IDS.deptCardiology,  'Cardiology',          'Building B, Floor 2', '(408) 555-0102'],
      [IDS.deptFamilyMed,   'Family Medicine',     'Building A, Floor 1', '(408) 555-0103'],
      [IDS.deptPediatrics,  'Pediatrics',          'Building C, Floor 1', '(408) 555-0104'],
      [IDS.deptOrtho,       'Orthopedics',         'Building D, Floor 2', '(408) 555-0105'],
      [IDS.deptOBGYN,       'OB/GYN',              'Building C, Floor 3', '(408) 555-0106'],
      [IDS.deptNeuro,       'Neurology',           'Building B, Floor 4', '(408) 555-0107'],
      [IDS.deptEndo,        'Endocrinology',       'Building A, Floor 4', '(408) 555-0108'],
      [IDS.deptDerm,        'Dermatology',         'Building E, Floor 1', '(408) 555-0109'],
      [IDS.deptOnco,        'Oncology',            'Building F, Floor 2', '(408) 555-0110'],
      [IDS.deptPulmo,       'Pulmonology',         'Building B, Floor 3', '(408) 555-0111'],
      [IDS.deptRheum,       'Rheumatology',        'Building D, Floor 3', '(408) 555-0112'],
      [IDS.deptGastro,      'Gastroenterology',    'Building E, Floor 2', '(408) 555-0113'],
      [IDS.deptUrgent,      'Urgent Care',         'Building A, Floor 1', '(408) 555-0114'],
    ];
    for (const [id, name, location, phone] of departments) {
      await client.query(
        'INSERT INTO departments (id, name, location, phone) VALUES ($1, $2, $3, $4)',
        [id, name, location, phone]
      );
    }
    console.log('✅ Departments seeded (14)');

    // ========== PROVIDER USERS (12) ==========
    for (const [id, email] of [
      [IDS.userP1,  'provider@demo.com'],
      [IDS.userP2,  'dr.williams@careconnect.demo'],
      [IDS.userP3,  'dr.rodriguez@careconnect.demo'],
      [IDS.userP4,  'dr.thompson@careconnect.demo'],
      [IDS.userP5,  'dr.kim@careconnect.demo'],
      [IDS.userP6,  'dr.martinez@careconnect.demo'],
      [IDS.userP7,  'dr.anderson@careconnect.demo'],
      [IDS.userP8,  'dr.davis@careconnect.demo'],
      [IDS.userP9,  'dr.parker@careconnect.demo'],
      [IDS.userP10, 'dr.foster@careconnect.demo'],
      [IDS.userP11, 'dr.nguyen@careconnect.demo'],
      [IDS.userP12, 'dr.cooper@careconnect.demo'],
    ]) {
      await client.query(
        'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [id, email, demoPassword, 'provider']
      );
    }

    // ========== PROVIDERS (12) ==========
    const providers = [
      [IDS.prov1,  IDS.userP1,  'Michael',  'Chen',       'Internal Medicine',   '1234567890', IDS.deptInternalMed,
       'Dr. Chen specializes in the diagnosis and treatment of adult diseases. Board-certified with 15 years of experience.'],
      [IDS.prov2,  IDS.userP2,  'Sarah',    'Williams',   'Cardiology',          '2345678901', IDS.deptCardiology,
       'Dr. Williams is an interventional cardiologist with expertise in heart failure and coronary artery disease.'],
      [IDS.prov3,  IDS.userP3,  'James',    'Rodriguez',  'Family Medicine',     '3456789012', IDS.deptFamilyMed,
       'Dr. Rodriguez provides comprehensive care for patients of all ages with a focus on preventive medicine.'],
      [IDS.prov4,  IDS.userP4,  'Emily',    'Thompson',   'Pediatrics',          '4567890123', IDS.deptPediatrics,
       'Dr. Thompson is passionate about children\'s health and developmental care.'],
      [IDS.prov5,  IDS.userP5,  'David',    'Kim',        'Orthopedic Surgery',  '5678901234', IDS.deptOrtho,
       'Dr. Kim specializes in sports medicine and minimally invasive joint replacement surgery.'],
      [IDS.prov6,  IDS.userP6,  'Lisa',     'Martinez',   'OB/GYN',              '6789012345', IDS.deptOBGYN,
       'Dr. Martinez provides comprehensive women\'s health care including obstetrics and gynecology.'],
      [IDS.prov7,  IDS.userP7,  'Robert',   'Anderson',   'Neurology',           '7890123456', IDS.deptNeuro,
       'Dr. Anderson specializes in neurological disorders including epilepsy, MS, and stroke.'],
      [IDS.prov8,  IDS.userP8,  'Jennifer', 'Davis',      'Endocrinology',       '8901234567', IDS.deptEndo,
       'Dr. Davis focuses on diabetes management, thyroid disorders, and hormonal imbalances.'],
      [IDS.prov9,  IDS.userP9,  'Thomas',   'Parker',     'Pulmonology',         '9012345678', IDS.deptPulmo,
       'Dr. Parker specializes in respiratory diseases including COPD, asthma, and pulmonary fibrosis.'],
      [IDS.prov10, IDS.userP10, 'Amanda',   'Foster',     'Rheumatology',        '0123456789', IDS.deptRheum,
       'Dr. Foster treats autoimmune and inflammatory conditions including RA, lupus, and gout.'],
      [IDS.prov11, IDS.userP11, 'Kevin',    'Nguyen',     'Gastroenterology',    '1122334455', IDS.deptGastro,
       'Dr. Nguyen specializes in digestive diseases, IBD, colorectal cancer screening, and hepatology.'],
      [IDS.prov12, IDS.userP12, 'Rachel',   'Cooper',     'Urgent Care',         '2233445566', IDS.deptUrgent,
       'Dr. Cooper provides immediate care for acute illnesses and injuries in our urgent care center.'],
    ];
    for (const [id, userId, firstName, lastName, specialty, npi, deptId, bio] of providers) {
      await client.query(
        'INSERT INTO providers (id, user_id, first_name, last_name, specialty, npi, department_id, bio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, userId, firstName, lastName, specialty, npi, deptId, bio]
      );
    }
    console.log('✅ Providers seeded (12)');

    // ========== ADMIN USER ==========
    await client.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [IDS.userAdmin, 'admin@demo.com', demoPassword, 'admin']
    );
    console.log('✅ Admin user seeded');

    // ========== PATIENT USERS (25) ==========
    for (const [id, email] of [
      [IDS.userPt1,  'patient@demo.com'],
      [IDS.userPt2,  'mary.johnson@email.com'],
      [IDS.userPt3,  'robert.davis@email.com'],
      [IDS.userPt4,  'jennifer.wilson@email.com'],
      [IDS.userPt5,  'michael.brown@email.com'],
      [IDS.userPt6,  'patricia.martinez@email.com'],
      [IDS.userPt7,  'chris.jones@email.com'],
      [IDS.userPt8,  'linda.garcia@email.com'],
      [IDS.userPt9,  'matt.rodriguez@email.com'],
      [IDS.userPt10, 'barbara.lee@email.com'],
      [IDS.userPt11, 'william.taylor@email.com'],
      [IDS.userPt12, 'elizabeth.thomas@email.com'],
      [IDS.userPt13, 'james.jackson@email.com'],
      [IDS.userPt14, 'susan.white@email.com'],
      [IDS.userPt15, 'david.harris@email.com'],
      [IDS.userPt16, 'karen.clark@email.com'],
      [IDS.userPt17, 'richard.lewis@email.com'],
      [IDS.userPt18, 'nancy.walker@email.com'],
      [IDS.userPt19, 'charles.hall@email.com'],
      [IDS.userPt20, 'betty.allen@email.com'],
      [IDS.userPt21, 'daniel.young@email.com'],
      [IDS.userPt22, 'helen.king@email.com'],
      [IDS.userPt23, 'paul.wright@email.com'],
      [IDS.userPt24, 'sandra.scott@email.com'],
      [IDS.userPt25, 'george.green@email.com'],
    ]) {
      await client.query(
        'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [id, email, demoPassword, 'patient']
      );
    }

    // ========== PATIENTS (25) ==========
    // [id, userId, mrn, firstName, lastName, dob, gender, phone, address, city, state, zip, insurance, insuranceId, primaryProvId, ecName, ecPhone, bloodType]
    const patients = [
      [IDS.pat1,  IDS.userPt1,  'MRN000001', 'John',        'Smith',     '1979-03-15', 'Male',   '(408) 555-1001', '1234 Oak Street',     'San Jose',    'CA', '95101', 'Blue Shield of California', 'BSC-445-2891024', IDS.prov1,  'Jane Smith',       '(408) 555-1002', 'O+'],
      [IDS.pat2,  IDS.userPt2,  'MRN000002', 'Mary',        'Johnson',   '1962-07-22', 'Female', '(408) 555-1003', '5678 Maple Ave',      'Santa Clara', 'CA', '95050', 'Aetna',                     'AET-778-9012345', IDS.prov1,  'Bob Johnson',      '(408) 555-1004', 'A+'],
      [IDS.pat3,  IDS.userPt3,  'MRN000003', 'Robert',      'Davis',     '1989-11-08', 'Male',   '(669) 555-1005', '910 Pine Road',       'Sunnyvale',   'CA', '94086', 'Cigna',                     'CGN-123-4567890', IDS.prov1,  'Susan Davis',      '(669) 555-1006', 'B+'],
      [IDS.pat4,  IDS.userPt4,  'MRN000004', 'Jennifer',    'Wilson',    '1996-04-30', 'Female', '(650) 555-1007', '246 Elm Street',      'Palo Alto',   'CA', '94301', 'Kaiser Permanente',         'KP-567-8901234',  IDS.prov1,  'Mark Wilson',      '(650) 555-1008', 'AB-'],
      [IDS.pat5,  IDS.userPt5,  'MRN000005', 'Michael',     'Brown',     '1972-09-17', 'Male',   '(408) 555-1009', '369 Cedar Lane',      'Campbell',    'CA', '95008', 'United Healthcare',         'UHC-234-5678901', IDS.prov1,  'Angela Brown',     '(408) 555-1010', 'O-'],
      [IDS.pat6,  IDS.userPt6,  'MRN000006', 'Patricia',    'Martinez',  '1983-01-12', 'Female', '(408) 555-1011', '147 Birch Blvd',      'Los Gatos',   'CA', '95030', 'Blue Shield of California', 'BSC-789-3456789', IDS.prov1,  'Carlos Martinez',  '(408) 555-1012', 'A-'],
      [IDS.pat7,  IDS.userPt7,  'MRN000007', 'Christopher', 'Jones',     '1957-06-28', 'Male',   '(408) 555-1013', '852 Walnut Way',      'Morgan Hill', 'CA', '95037', 'Medicare',                  'MCR-345-6789012', IDS.prov1,  'Margaret Jones',   '(408) 555-1014', 'B-'],
      [IDS.pat8,  IDS.userPt8,  'MRN000008', 'Linda',       'Garcia',    '1969-12-05', 'Female', '(408) 555-1015', '753 Spruce Court',    'Milpitas',    'CA', '95035', 'Anthem',                    'ANT-456-7890123', IDS.prov1,  'Jose Garcia',      '(408) 555-1016', 'A+'],
      [IDS.pat9,  IDS.userPt9,  'MRN000009', 'Matthew',     'Rodriguez', '2005-02-20', 'Male',   '(831) 555-1017', '159 Aspen Drive',     'Gilroy',      'CA', '95020', 'Medi-Cal',                  'MCA-567-8901234', IDS.prov1,  'Rosa Rodriguez',   '(831) 555-1018', 'O+'],
      [IDS.pat10, IDS.userPt10, 'MRN000010', 'Barbara',     'Lee',       '1951-08-14', 'Female', '(408) 555-1019', '486 Redwood Rd',      'Saratoga',    'CA', '95070', 'Medicare',                  'MCR-678-9012345', IDS.prov1,  'Thomas Lee',       '(408) 555-1020', 'AB+'],
      [IDS.pat11, IDS.userPt11, 'MRN000011', 'William',     'Taylor',    '1955-08-12', 'Male',   '(408) 555-1021', '22 Harbor View Dr',   'San Jose',    'CA', '95126', 'Medicare',                  'MCR-901-2345678', IDS.prov1,  'Carol Taylor',     '(408) 555-1022', 'A+'],
      [IDS.pat12, IDS.userPt12, 'MRN000012', 'Elizabeth',   'Thomas',    '1978-03-22', 'Female', '(408) 555-1023', '88 Sunrise Blvd',     'Cupertino',   'CA', '95014', 'Cigna',                     'CGN-456-7891234', IDS.prov1,  'Peter Thomas',     '(408) 555-1024', 'B-'],
      [IDS.pat13, IDS.userPt13, 'MRN000013', 'James',       'Jackson',   '1943-11-05', 'Male',   '(408) 555-1025', '1001 Magnolia Ct',    'San Jose',    'CA', '95128', 'Medicare',                  'MCR-012-3456789', IDS.prov1,  'Dorothy Jackson',  '(408) 555-1026', 'O+'],
      [IDS.pat14, IDS.userPt14, 'MRN000014', 'Susan',       'White',     '1990-06-18', 'Female', '(650) 555-1027', '55 Lakeshore Ave',    'Redwood City','CA', '94065', 'Kaiser Permanente',         'KP-123-4567891',  IDS.prov1,  'Kevin White',      '(650) 555-1028', 'O-'],
      [IDS.pat15, IDS.userPt15, 'MRN000015', 'David',       'Harris',    '1967-02-28', 'Male',   '(408) 555-1029', '777 Canyon Rd',       'Los Altos',   'CA', '94024', 'United Healthcare',         'UHC-567-8901235', IDS.prov1,  'Cynthia Harris',   '(408) 555-1030', 'B+'],
      [IDS.pat16, IDS.userPt16, 'MRN000016', 'Karen',       'Clark',     '1961-09-14', 'Female', '(408) 555-1031', '300 Orchard Ln',      'Sunnyvale',   'CA', '94087', 'Aetna',                     'AET-901-2345679', IDS.prov1,  'Steven Clark',     '(408) 555-1032', 'A-'],
      [IDS.pat17, IDS.userPt17, 'MRN000017', 'Richard',     'Lewis',     '1980-04-07', 'Male',   '(669) 555-1033', '412 Valley Oak Ct',   'Santa Clara', 'CA', '95054', 'Blue Shield of California', 'BSC-234-5678901', IDS.prov1,  'Michelle Lewis',   '(669) 555-1034', 'AB+'],
      [IDS.pat18, IDS.userPt18, 'MRN000018', 'Nancy',       'Walker',    '1947-12-30', 'Female', '(408) 555-1035', '628 Hillcrest Ave',   'Los Gatos',   'CA', '95032', 'Medicare',                  'MCR-345-6789013', IDS.prov1,  'Frank Walker',     '(408) 555-1036', 'O-'],
      [IDS.pat19, IDS.userPt19, 'MRN000019', 'Charles',     'Hall',      '1998-07-23', 'Male',   '(831) 555-1037', '99 Westfield Dr',     'Gilroy',      'CA', '95020', 'Medi-Cal',                  'MCA-678-9012345', IDS.prov1,  'Patricia Hall',    '(831) 555-1038', 'A+'],
      [IDS.pat20, IDS.userPt20, 'MRN000020', 'Betty',       'Allen',     '1938-01-08', 'Female', '(408) 555-1039', '14 Creekside Blvd',   'Saratoga',    'CA', '95070', 'Medicare',                  'MCR-456-7890124', IDS.prov1,  'Harold Allen',     '(408) 555-1040', 'B+'],
      [IDS.pat21, IDS.userPt21, 'MRN000021', 'Daniel',      'Young',     '1985-10-15', 'Male',   '(408) 555-1041', '531 Greenway Blvd',   'Campbell',    'CA', '95008', 'Cigna',                     'CGN-789-0123456', IDS.prov1,  'Ashley Young',     '(408) 555-1042', 'O+'],
      [IDS.pat22, IDS.userPt22, 'MRN000022', 'Helen',       'King',      '1972-05-03', 'Female', '(408) 555-1043', '204 Rosewood Dr',     'Milpitas',    'CA', '95035', 'Anthem',                    'ANT-567-8901234', IDS.prov1,  'Edward King',      '(408) 555-1044', 'A+'],
      [IDS.pat23, IDS.userPt23, 'MRN000023', 'Paul',        'Wright',    '1959-08-27', 'Male',   '(408) 555-1045', '876 Amber Way',       'Morgan Hill', 'CA', '95037', 'United Healthcare',         'UHC-890-1234567', IDS.prov1,  'Diane Wright',     '(408) 555-1046', 'B-'],
      [IDS.pat24, IDS.userPt24, 'MRN000024', 'Sandra',      'Scott',     '1995-11-11', 'Female', '(650) 555-1047', '17 Pacific Coast Hwy','Palo Alto',   'CA', '94303', 'Kaiser Permanente',         'KP-234-5678902',  IDS.prov1,  'Gary Scott',       '(650) 555-1048', 'AB-'],
      [IDS.pat25, IDS.userPt25, 'MRN000025', 'George',      'Green',     '1963-04-19', 'Male',   '(408) 555-1049', '745 Summit Ridge Rd', 'San Jose',    'CA', '95120', 'Blue Shield of California', 'BSC-345-6789012', IDS.prov1,  'Martha Green',     '(408) 555-1050', 'O+'],
    ];
    for (const [id, userId, mrn, fn, ln, dob, gender, phone, addr, city, state, zip, ins, insId, provId, ecName, ecPhone, bt] of patients) {
      await client.query(`
        INSERT INTO patients (id, user_id, mrn, first_name, last_name, date_of_birth, gender, phone,
          address, city, state, zip, insurance_provider, insurance_id, primary_provider_id,
          emergency_contact_name, emergency_contact_phone, blood_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [id, userId, mrn, fn, ln, dob, gender, phone, addr, city, state, zip, ins, insId, provId, ecName, ecPhone, bt]);
    }
    console.log('✅ Patients seeded (25)');

    // ========== ALLERGIES ==========
    const allergies = [
      [IDS.pat1,  'Penicillin',      'Hives, difficulty breathing',  'severe'],
      [IDS.pat1,  'Shellfish',        'Anaphylaxis',                  'life_threatening'],
      [IDS.pat2,  'Sulfa drugs',      'Rash, fever',                  'moderate'],
      [IDS.pat2,  'Latex',            'Contact dermatitis',           'mild'],
      [IDS.pat3,  'Aspirin',          'Stomach bleeding',             'moderate'],
      [IDS.pat5,  'Codeine',          'Nausea, vomiting',             'moderate'],
      [IDS.pat6,  'Ibuprofen',        'Stomach pain',                 'mild'],
      [IDS.pat7,  'Warfarin',         'Excessive bleeding risk',      'severe'],
      [IDS.pat8,  'Contrast dye',     'Allergic reaction',            'severe'],
      [IDS.pat10, 'Metformin',        'GI intolerance',               'mild'],
      [IDS.pat11, 'Atenolol',         'Bradycardia, fatigue',         'moderate'],
      [IDS.pat13, 'Morphine',         'Respiratory depression',       'severe'],
      [IDS.pat13, 'Penicillin',       'Rash, hives',                  'moderate'],
      [IDS.pat15, 'Theophylline',     'Palpitations, nausea',         'moderate'],
      [IDS.pat16, 'Hydroxychloroquine','GI upset',                    'mild'],
      [IDS.pat17, 'Sulfasalazine',    'Nausea, headache',             'mild'],
      [IDS.pat18, 'Carbamazepine',    'Dizziness, rash',              'moderate'],
      [IDS.pat20, 'Glipizide',        'Hypoglycemia',                 'moderate'],
      [IDS.pat22, 'Lisinopril',       'Persistent dry cough',         'mild'],
      [IDS.pat23, 'Simvastatin',      'Muscle pain, rhabdomyolysis',  'severe'],
      [IDS.pat25, 'Amoxicillin',      'Rash',                         'mild'],
    ];
    for (const [patId, allergen, reaction, severity] of allergies) {
      await client.query(
        'INSERT INTO allergies (patient_id, allergen, reaction, severity) VALUES ($1,$2,$3,$4)',
        [patId, allergen, reaction, severity]
      );
    }
    console.log('✅ Allergies seeded (21)');

    // ========== DIAGNOSES ==========
    const diagnoses = [
      // John Smith (pat1)
      [IDS.pat1,  IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2019-06-15', 'chronic'],
      [IDS.pat1,  IDS.prov1, 'I10',    'Essential Hypertension',                '2018-03-20', 'chronic'],
      [IDS.pat1,  IDS.prov1, 'E78.5',  'Hyperlipidemia',                        '2020-01-10', 'chronic'],
      // Mary Johnson (pat2)
      [IDS.pat2,  IDS.prov1, 'I25.10', 'Coronary Artery Disease',               '2021-08-12', 'chronic'],
      [IDS.pat2,  IDS.prov1, 'I50.9',  'Congestive Heart Failure',              '2022-02-28', 'active'],
      [IDS.pat2,  IDS.prov1, 'I10',    'Essential Hypertension',                '2019-05-10', 'chronic'],
      // Robert Davis (pat3)
      [IDS.pat3,  IDS.prov1, 'J45.20', 'Mild Intermittent Asthma',              '2015-04-05', 'chronic'],
      [IDS.pat3,  IDS.prov1, 'J30.9',  'Allergic Rhinitis',                     '2018-09-12', 'chronic'],
      // Jennifer Wilson (pat4)
      [IDS.pat4,  IDS.prov1, 'N94.3',  'Premenstrual Tension Syndrome',         '2023-09-01', 'active'],
      [IDS.pat4,  IDS.prov1, 'Z34.00', 'Encounter for Supervision of Normal Pregnancy', '2025-01-15', 'active'],
      // Michael Brown (pat5)
      [IDS.pat5,  IDS.prov1, 'I10',    'Essential Hypertension',                '2020-11-14', 'chronic'],
      [IDS.pat5,  IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2021-05-20', 'chronic'],
      [IDS.pat5,  IDS.prov1, 'E66.9',  'Obesity',                               '2020-11-14', 'active'],
      // Patricia Martinez (pat6)
      [IDS.pat6,  IDS.prov1, 'E03.9',  'Hypothyroidism, unspecified',           '2022-07-08', 'chronic'],
      [IDS.pat6,  IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2024-01-20', 'active'],
      // Christopher Jones (pat7)
      [IDS.pat7,  IDS.prov1, 'G20',    'Parkinson\'s Disease',                  '2020-03-15', 'chronic'],
      [IDS.pat7,  IDS.prov1, 'I10',    'Essential Hypertension',                '2017-09-22', 'chronic'],
      [IDS.pat7,  IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2023-06-01', 'active'],
      // Linda Garcia (pat8)
      [IDS.pat8,  IDS.prov1, 'G35',    'Multiple Sclerosis',                    '2019-11-30', 'active'],
      [IDS.pat8,  IDS.prov1, 'G89.29', 'Chronic Pain Syndrome',                 '2021-03-15', 'chronic'],
      // Matthew Rodriguez (pat9)
      [IDS.pat9,  IDS.prov1, 'J06.9',  'Acute Upper Respiratory Infection',     '2025-12-01', 'resolved'],
      [IDS.pat9,  IDS.prov1, 'J45.20', 'Mild Intermittent Asthma',              '2023-08-15', 'active'],
      // Barbara Lee (pat10)
      [IDS.pat10, IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2010-06-10', 'chronic'],
      [IDS.pat10, IDS.prov1, 'M81.0',  'Age-related Osteoporosis',              '2018-04-25', 'chronic'],
      [IDS.pat10, IDS.prov1, 'I10',    'Essential Hypertension',                '2012-09-14', 'chronic'],
      [IDS.pat10, IDS.prov1, 'I48.91', 'Unspecified Atrial Fibrillation',        '2023-11-08', 'active'],
      // William Taylor (pat11)
      [IDS.pat11, IDS.prov1, 'I25.10', 'Coronary Artery Disease',               '2020-05-18', 'chronic'],
      [IDS.pat11, IDS.prov1, 'I50.9',  'Congestive Heart Failure',              '2022-08-30', 'active'],
      [IDS.pat11, IDS.prov1, 'I48.0',  'Paroxysmal Atrial Fibrillation',        '2023-01-12', 'chronic'],
      // Elizabeth Thomas (pat12)
      [IDS.pat12, IDS.prov1, 'K57.30', 'Diverticulosis of large intestine',     '2022-11-05', 'active'],
      [IDS.pat12, IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2023-03-15', 'active'],
      // James Jackson (pat13)
      [IDS.pat13, IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2005-02-12', 'chronic'],
      [IDS.pat13, IDS.prov1, 'I10',    'Essential Hypertension',                '2000-07-08', 'chronic'],
      [IDS.pat13, IDS.prov1, 'N18.3',  'Chronic Kidney Disease, Stage 3',       '2018-10-20', 'chronic'],
      [IDS.pat13, IDS.prov1, 'E78.5',  'Hyperlipidemia',                        '2008-04-15', 'chronic'],
      // Susan White (pat14)
      [IDS.pat14, IDS.prov1, 'Z34.00', 'Supervision of Normal Pregnancy',       '2025-02-10', 'active'],
      [IDS.pat14, IDS.prov1, 'O99.89', 'Gestational Hypertension',              '2025-03-01', 'active'],
      // David Harris (pat15)
      [IDS.pat15, IDS.prov1, 'J44.1',  'COPD with acute exacerbation',          '2018-09-22', 'chronic'],
      [IDS.pat15, IDS.prov1, 'J45.50', 'Severe persistent asthma',              '2014-03-10', 'chronic'],
      [IDS.pat15, IDS.prov1, 'I48.0',  'Paroxysmal Atrial Fibrillation',        '2022-07-14', 'active'],
      // Karen Clark (pat16)
      [IDS.pat16, IDS.prov1, 'M05.79', 'Rheumatoid Arthritis with other organ involvement', '2019-04-20', 'chronic'],
      [IDS.pat16, IDS.prov1, 'M32.9',  'Systemic Lupus Erythematosus',         '2021-08-15', 'active'],
      // Richard Lewis (pat17)
      [IDS.pat17, IDS.prov1, 'K50.90', 'Crohn\'s Disease of small intestine',   '2016-07-12', 'chronic'],
      [IDS.pat17, IDS.prov1, 'K57.30', 'Diverticular disease of colon',         '2022-05-18', 'active'],
      // Nancy Walker (pat18)
      [IDS.pat18, IDS.prov1, 'G43.909', 'Migraine, unspecified, not intractable', '2010-03-05', 'chronic'],
      [IDS.pat18, IDS.prov1, 'G35',     'Multiple Sclerosis',                   '2018-06-22', 'active'],
      [IDS.pat18, IDS.prov1, 'F41.1',   'Generalized Anxiety Disorder',         '2020-01-15', 'chronic'],
      // Charles Hall (pat19)
      [IDS.pat19, IDS.prov1, 'J06.9',  'Acute Upper Respiratory Infection',     '2025-10-12', 'resolved'],
      [IDS.pat19, IDS.prov1, 'M54.5',  'Low Back Pain',                         '2025-08-20', 'active'],
      // Betty Allen (pat20)
      [IDS.pat20, IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2003-11-18', 'chronic'],
      [IDS.pat20, IDS.prov1, 'E03.9',  'Hypothyroidism',                        '2009-04-22', 'chronic'],
      [IDS.pat20, IDS.prov1, 'M81.0',  'Osteoporosis',                          '2015-06-30', 'chronic'],
      [IDS.pat20, IDS.prov1, 'I10',    'Essential Hypertension',                '2005-02-14', 'chronic'],
      // Daniel Young (pat21)
      [IDS.pat21, IDS.prov1, 'M23.200', 'Derangement of anterior cruciate ligament', '2024-09-15', 'active'],
      [IDS.pat21, IDS.prov1, 'M79.3',   'Panniculitis',                         '2025-01-08', 'resolved'],
      // Helen King (pat22)
      [IDS.pat22, IDS.prov1, 'I10',    'Essential Hypertension',                '2017-05-12', 'chronic'],
      [IDS.pat22, IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2022-09-30', 'active'],
      [IDS.pat22, IDS.prov1, 'J45.20', 'Mild persistent asthma',                '2019-11-22', 'chronic'],
      // Paul Wright (pat23)
      [IDS.pat23, IDS.prov1, 'I25.10', 'Coronary Artery Disease',               '2019-03-14', 'chronic'],
      [IDS.pat23, IDS.prov1, 'I10',    'Essential Hypertension',                '2016-08-05', 'chronic'],
      [IDS.pat23, IDS.prov1, 'E78.5',  'Hyperlipidemia',                        '2018-01-20', 'chronic'],
      // Sandra Scott (pat24)
      [IDS.pat24, IDS.prov1, 'F32.1',  'Major depressive disorder, moderate',   '2024-06-18', 'active'],
      [IDS.pat24, IDS.prov1, 'F41.1',  'Generalized Anxiety Disorder',          '2024-06-18', 'active'],
      // George Green (pat25)
      [IDS.pat25, IDS.prov1, 'E11.9',  'Type 2 Diabetes Mellitus',              '2021-07-20', 'active'],
      [IDS.pat25, IDS.prov1, 'I10',    'Essential Hypertension',                '2020-03-08', 'chronic'],
      [IDS.pat25, IDS.prov1, 'E78.5',  'Hyperlipidemia',                        '2021-07-20', 'active'],
    ];
    for (const [patId, provId, icd, desc, date, status] of diagnoses) {
      await client.query(
        'INSERT INTO diagnoses (patient_id, provider_id, icd_code, description, diagnosed_date, status) VALUES ($1,$2,$3,$4,$5,$6)',
        [patId, provId, icd, desc, date, status]
      );
    }
    console.log('✅ Diagnoses seeded (64)');

    // ========== DATE HELPERS ==========
    const now = new Date();
    const future = (days, hour = 10) => {
      const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString();
    };
    const past = (days, hour = 10) => {
      const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d.toISOString();
    };
    const pastDate = (daysAgo) => {
      const d = new Date(now); d.setDate(d.getDate() - daysAgo); return d.toISOString().split('T')[0];
    };
    const dueDate = (daysFromNow) => {
      const d = new Date(now); d.setDate(d.getDate() + daysFromNow); return d.toISOString().split('T')[0];
    };
    // weekday(dayOfWeek, weekOffset, hour) — deterministic schedule helper
    // dayOfWeek: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
    // weekOffset: 0=this calendar week, 1=next week, etc.
    // Anchors to Monday of the week containing 'now' (same logic as date-fns startOfWeek weekStartsOn:1)
    const weekday = (dayOfWeek, weekOffset, hour = 10) => {
      const d = new Date(now);
      const currentDay = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
      const daysToThisMonday = currentDay === 0 ? -6 : 1 - currentDay;
      d.setDate(d.getDate() + daysToThisMonday + (dayOfWeek - 1) + weekOffset * 7);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const confirm = () => 'CC-' + Math.random().toString(36).substr(2, 9).toUpperCase();

    // ========== APPOINTMENTS (~85) ==========
    const apptIds = {};
    for (let i = 1; i <= 340; i++) apptIds[`a${i}`] = uuidv4();

    // [id, patId, provId, scheduledAt, duration, type, status, chiefComplaint, location]
    const appointments = [
      // ── John Smith (pat1) ── 12 appointments spanning 2 years
      [apptIds.a1,  IDS.pat1, IDS.prov1, past(7, 9),    30, 'office_visit', 'completed',  'Diabetes follow-up and A1C check',          'Building A, Room 302'],
      [apptIds.a2,  IDS.pat1, IDS.prov1, past(21, 14),  30, 'telehealth',   'completed',  'Hypertension medication review',             'Telehealth'],
      [apptIds.a3,  IDS.pat1, IDS.prov1, past(30, 10),    30, 'office_visit', 'completed',  'Annual wellness exam',                       'Building A, Room 302'],
      [apptIds.a4,  IDS.pat1, IDS.prov1, past(60, 11),    45, 'office_visit', 'completed',  'Cardiac risk evaluation',                    'Building A, Room 302'],
      [apptIds.a5,  IDS.pat1, IDS.prov1, past(10, 14),    30, 'office_visit', 'cancelled',  'Routine follow-up (patient cancelled)',       'Building A, Room 302'],
      [apptIds.a6,  IDS.pat1, IDS.prov1, past(90, 10),    30, 'office_visit', 'completed',  'Quarterly diabetes management',              'Building A, Room 302'],
      [apptIds.a7,  IDS.pat1, IDS.prov1, past(180, 9),    30, 'telehealth',   'completed',  '6-month medication review',                  'Telehealth'],
      [apptIds.a8,  IDS.pat1, IDS.prov1, past(270, 10),   30, 'office_visit', 'completed',  'Quarterly diabetes and BP check',            'Building A, Room 302'],
      [apptIds.a9,  IDS.pat1, IDS.prov1, past(365, 9),    30, 'office_visit', 'completed',  'Annual wellness exam',                       'Building A, Room 302'],
      [apptIds.a10, IDS.pat1, IDS.prov1, past(450, 10),   30, 'office_visit', 'completed',  'Diabetes management, HbA1c review',          'Building A, Room 302'],
      [apptIds.a11, IDS.pat1, IDS.prov1, past(545, 9),    30, 'office_visit', 'completed',  '6-month follow-up, statin adjustment',       'Building A, Room 302'],
      [apptIds.a12, IDS.pat1, IDS.prov1, past(635, 10),   30, 'office_visit', 'completed',  'Annual wellness, 2 years ago',               'Building A, Room 302'],
      [apptIds.a13, IDS.pat1, IDS.prov1, past(720, 9),    30, 'office_visit', 'completed',  'Initial diabetes workup',                   'Building A, Room 302'],

      // ── Mary Johnson (pat2) ── 7 appointments
      [apptIds.a14, IDS.pat2, IDS.prov1, past(3, 10),    45, 'office_visit', 'completed',  'Heart failure management',                   'Building A, Room 302'],
      [apptIds.a15, IDS.pat2, IDS.prov1, past(14, 9),     45, 'office_visit', 'completed',  'EKG and stress test results review',         'Building A, Room 302'],
      [apptIds.a16, IDS.pat2, IDS.prov1, past(45, 10),    45, 'office_visit', 'completed',  'BNP follow-up, diuretic adjustment',         'Building A, Room 302'],
      [apptIds.a17, IDS.pat2, IDS.prov1, past(90, 9),     30, 'telehealth',   'completed',  'Fluid management check-in',                  'Telehealth'],
      [apptIds.a18, IDS.pat2, IDS.prov1, past(180, 10),   45, 'office_visit', 'completed',  'Follow-up review, echo results',             'Building A, Room 302'],
      [apptIds.a19, IDS.pat2, IDS.prov1, past(365, 9),    45, 'office_visit', 'completed',  'Annual evaluation',                          'Building A, Room 302'],
      [apptIds.a20, IDS.pat2, IDS.prov1, past(545, 10),   45, 'office_visit', 'completed',  'Initial assessment',                         'Building A, Room 302'],

      // ── Robert Davis (pat3) ── 5 appointments
      [apptIds.a21, IDS.pat3, IDS.prov1, past(14, 10),   30, 'office_visit', 'completed',  'Asthma review and inhaler renewal',          'Building A, Room 302'],
      [apptIds.a22, IDS.pat3, IDS.prov1, past(7, 13),     30, 'office_visit', 'completed',  'Chest congestion evaluation',                'Building A, Room 302'],
      [apptIds.a23, IDS.pat3, IDS.prov1, past(90, 10),    30, 'office_visit', 'completed',  'Asthma management, peak flow review',        'Building A, Room 302'],
      [apptIds.a24, IDS.pat3, IDS.prov1, past(270, 11),   45, 'office_visit', 'completed',  'Pulmonary function testing',                 'Building A, Room 302'],
      [apptIds.a25, IDS.pat3, IDS.prov1, past(365, 10),   30, 'office_visit', 'completed',  'Annual asthma review',                       'Building A, Room 302'],

      // ── Jennifer Wilson (pat4) ── 4 appointments
      [apptIds.a26, IDS.pat4, IDS.prov1, past(14, 10),   30, 'office_visit', 'completed',  'Prenatal care - 28 week visit',              'Building A, Room 302'],
      [apptIds.a27, IDS.pat4, IDS.prov1, past(14, 11),    30, 'office_visit', 'completed',  'Prenatal care - 24 week visit',              'Building A, Room 302'],
      [apptIds.a28, IDS.pat4, IDS.prov1, past(60, 10),    30, 'office_visit', 'completed',  'Prenatal care - 20 week anatomy scan',       'Building A, Room 302'],
      [apptIds.a29, IDS.pat4, IDS.prov1, past(180, 9),    30, 'office_visit', 'completed',  'Annual wellness exam',                       'Building A, Room 302'],

      // ── Michael Brown (pat5) ── 7 appointments
      [apptIds.a30, IDS.pat5, IDS.prov1, past(10, 9),    45, 'office_visit', 'completed',  'BP and diabetes medication review',          'Building A, Room 302'],
      [apptIds.a31, IDS.pat5, IDS.prov1, past(20, 14),    30, 'telehealth',   'completed',  'Blood pressure telehealth check-in',         'Telehealth'],
      [apptIds.a32, IDS.pat5, IDS.prov1, past(60, 10),    45, 'office_visit', 'completed',  'Metabolic syndrome evaluation',              'Building A, Room 302'],
      [apptIds.a33, IDS.pat5, IDS.prov1, past(120, 11),   30, 'office_visit', 'completed',  'Hypertension follow-up, HCTZ titration',     'Building A, Room 302'],
      [apptIds.a34, IDS.pat5, IDS.prov1, past(270, 10),   45, 'office_visit', 'completed',  'Diabetes and BP management',                 'Building A, Room 302'],
      [apptIds.a35, IDS.pat5, IDS.prov1, past(365, 9),    45, 'office_visit', 'completed',  'Annual physical, new diabetes diagnosis',    'Building A, Room 302'],
      [apptIds.a36, IDS.pat5, IDS.prov1, past(545, 10),   30, 'office_visit', 'completed',  'Initial hypertension workup',                'Building A, Room 302'],

      // ── Patricia Martinez (pat6) ── 6 appointments
      [apptIds.a37, IDS.pat6, IDS.prov1, past(5, 11),    30, 'office_visit', 'completed',  'Thyroid panel review, dose adjustment',      'Building A, Room 302'],
      [apptIds.a38, IDS.pat6, IDS.prov1, past(45, 10),    30, 'office_visit', 'completed',  'Thyroid medication adjustment',              'Building A, Room 302'],
      [apptIds.a39, IDS.pat6, IDS.prov1, past(135, 9),    30, 'office_visit', 'completed',  'TSH follow-up, 3-month recheck',             'Building A, Room 302'],
      [apptIds.a40, IDS.pat6, IDS.prov1, past(270, 10),   30, 'telehealth',   'completed',  'Telehealth follow-up',                       'Telehealth'],
      [apptIds.a41, IDS.pat6, IDS.prov1, past(365, 9),    45, 'office_visit', 'completed',  'Annual evaluation',                          'Building A, Room 302'],
      [apptIds.a42, IDS.pat6, IDS.prov1, past(545, 10),   30, 'office_visit', 'completed',  'Initial workup',                             'Building A, Room 302'],

      // ── Christopher Jones (pat7) ── 6 appointments
      [apptIds.a43, IDS.pat7, IDS.prov1, past(7, 10),    45, 'office_visit', 'completed',  'Quarterly review',                           'Building A, Room 302'],
      [apptIds.a44, IDS.pat7, IDS.prov1, past(30, 9),     45, 'office_visit', 'completed',  'Motor assessment',                           'Building A, Room 302'],
      [apptIds.a45, IDS.pat7, IDS.prov1, past(120, 10),   45, 'office_visit', 'completed',  'Medication adjustment, tremor management',   'Building A, Room 302'],
      [apptIds.a46, IDS.pat7, IDS.prov1, past(90, 9),     30, 'office_visit', 'completed',  'Hypertension and DM follow-up',              'Building A, Room 302'],
      [apptIds.a47, IDS.pat7, IDS.prov1, past(270, 10),   45, 'office_visit', 'completed',  'Annual evaluation',                          'Building A, Room 302'],
      [apptIds.a48, IDS.pat7, IDS.prov1, past(365, 9),    45, 'office_visit', 'completed',  '1 year follow-up',                           'Building A, Room 302'],

      // ── Linda Garcia (pat8) ── 5 appointments
      [apptIds.a49, IDS.pat8, IDS.prov1, past(21, 10),   45, 'office_visit', 'completed',  'Quarterly clinic visit',                     'Building A, Room 302'],
      [apptIds.a50, IDS.pat8, IDS.prov1, past(45, 9),     45, 'office_visit', 'completed',  'Disease activity assessment',                'Building A, Room 302'],
      [apptIds.a51, IDS.pat8, IDS.prov1, past(135, 10),   45, 'office_visit', 'completed',  'MRI results review, treatment plan',         'Building A, Room 302'],
      [apptIds.a52, IDS.pat8, IDS.prov1, past(270, 9),    45, 'office_visit', 'completed',  'Follow-up, symptom management',              'Building A, Room 302'],
      [apptIds.a53, IDS.pat8, IDS.prov1, past(365, 10),   45, 'office_visit', 'completed',  'Annual review',                              'Building A, Room 302'],

      // ── Matthew Rodriguez (pat9) ── 3 appointments
      [apptIds.a54, IDS.pat9, IDS.prov1, past(30, 9),    30, 'office_visit', 'completed',  'Well visit - 20 year old',                   'Building A, Room 302'],
      [apptIds.a55, IDS.pat9, IDS.prov1, past(14, 10),    30, 'office_visit', 'completed',  'Sick visit - URI symptoms',                  'Building A, Room 302'],
      [apptIds.a56, IDS.pat9, IDS.prov1, past(180, 9),    30, 'office_visit', 'completed',  'Annual well visit, asthma management',       'Building A, Room 302'],

      // ── Barbara Lee (pat10) ── 7 appointments
      [apptIds.a57, IDS.pat10, IDS.prov1, past(2, 10),   30, 'office_visit', 'completed',  'Diabetes management',                        'Building A, Room 302'],
      [apptIds.a58, IDS.pat10, IDS.prov1, past(90, 9),    30, 'office_visit', 'completed',  'Annual physical and labs review',            'Building A, Room 302'],
      [apptIds.a59, IDS.pat10, IDS.prov1, past(180, 10),  30, 'office_visit', 'completed',  'Diabetes follow-up, insulin adjustment',     'Building A, Room 302'],
      [apptIds.a60, IDS.pat10, IDS.prov1, past(270, 9),   30, 'telehealth',   'completed',  'Diabetes telehealth check-in',               'Telehealth'],
      [apptIds.a61, IDS.pat10, IDS.prov1, past(365, 10),  30, 'office_visit', 'completed',  'Annual wellness exam',                       'Building A, Room 302'],
      [apptIds.a62, IDS.pat10, IDS.prov1, past(270, 14),  45, 'office_visit', 'completed',  'AFib evaluation and management',             'Building A, Room 302'],
      [apptIds.a63, IDS.pat10, IDS.prov1, past(545, 9),   30, 'office_visit', 'completed',  'Annual wellness exam - 18 months ago',       'Building A, Room 302'],

      // ── William Taylor (pat11) ── 5 appointments
      [apptIds.a64, IDS.pat11, IDS.prov1, past(5, 10),   45, 'office_visit', 'completed',  'Follow-up, AFib management',                 'Building A, Room 302'],
      [apptIds.a65, IDS.pat11, IDS.prov1, past(30, 9),    45, 'office_visit', 'completed',  'Echo results, HF management',                'Building A, Room 302'],
      [apptIds.a66, IDS.pat11, IDS.prov1, past(90, 10),   45, 'office_visit', 'completed',  'Cardiac cath follow-up',                     'Building A, Room 302'],
      [apptIds.a67, IDS.pat11, IDS.prov1, past(270, 9),   45, 'office_visit', 'completed',  'Evaluation',                                 'Building A, Room 302'],
      [apptIds.a68, IDS.pat11, IDS.prov1, past(365, 10),  45, 'office_visit', 'completed',  'Annual review - 1 year ago',                 'Building A, Room 302'],

      // ── Elizabeth Thomas (pat12) ── 4 appointments
      [apptIds.a69, IDS.pat12, IDS.prov1, past(10, 11),  30, 'office_visit', 'completed',  'Annual physical exam',                       'Building A, Room 302'],
      [apptIds.a70, IDS.pat12, IDS.prov1, past(20, 10),   30, 'office_visit', 'completed',  'Diabetes follow-up - 3 months',              'Building A, Room 302'],
      [apptIds.a71, IDS.pat12, IDS.prov1, past(180, 9),   30, 'office_visit', 'completed',  'Annual physical',                            'Building A, Room 302'],
      [apptIds.a72, IDS.pat12, IDS.prov1, past(90, 10),   45, 'office_visit', 'completed',  'Diverticulosis management, consult',         'Building A, Room 302'],

      // ── James Jackson (pat13) ── 5 appointments
      [apptIds.a73, IDS.pat13, IDS.prov1, past(3, 9),    30, 'office_visit', 'completed',  'Complex geriatric case management',          'Building A, Room 302'],
      [apptIds.a74, IDS.pat13, IDS.prov1, past(14, 10),   30, 'office_visit', 'completed',  'Medication reconciliation and review',       'Building A, Room 302'],
      [apptIds.a75, IDS.pat13, IDS.prov1, past(60, 9),    45, 'office_visit', 'completed',  'CKD and diabetes management',                'Building A, Room 302'],
      [apptIds.a76, IDS.pat13, IDS.prov1, past(180, 10),  45, 'office_visit', 'completed',  'Quarterly complex care visit',               'Building A, Room 302'],
      [apptIds.a77, IDS.pat13, IDS.prov1, past(365, 9),   45, 'office_visit', 'completed',  'Annual wellness exam',                       'Building A, Room 302'],

      // ── Susan White (pat14) ── 3 appointments
      [apptIds.a78, IDS.pat14, IDS.prov1, past(21, 10),  30, 'office_visit', 'completed',  'Prenatal care - 32 week visit',              'Building A, Room 302'],
      [apptIds.a79, IDS.pat14, IDS.prov1, past(14, 9),    30, 'office_visit', 'completed',  'Prenatal care - 28 week visit',              'Building A, Room 302'],
      [apptIds.a80, IDS.pat14, IDS.prov1, past(45, 10),   30, 'office_visit', 'completed',  'Prenatal - gestational HTN evaluation',      'Building A, Room 302'],

      // ── David Harris (pat15) ── 4 appointments
      [apptIds.a81, IDS.pat15, IDS.prov1, past(7, 10),   45, 'office_visit', 'completed',  'COPD management, spirometry review',         'Building A, Room 302'],
      [apptIds.a82, IDS.pat15, IDS.prov1, past(30, 9),    45, 'office_visit', 'completed',  'Pulmonary function test results',            'Building A, Room 302'],
      [apptIds.a83, IDS.pat15, IDS.prov1, past(120, 10),  45, 'office_visit', 'completed',  'COPD exacerbation follow-up',                'Building A, Room 302'],
      [apptIds.a84, IDS.pat15, IDS.prov1, past(365, 9),   45, 'office_visit', 'completed',  'Annual review',                              'Building A, Room 302'],

      // ── Karen Clark (pat16) ── 3 appointments
      [apptIds.a85, IDS.pat16, IDS.prov1, past(14, 10),  45, 'office_visit', 'completed',  'Follow-up, biologic review',                'Building A, Room 302'],
      [apptIds.a86, IDS.pat16, IDS.prov1, past(45, 9),   45, 'office_visit', 'completed',   'Joint assessment, inflammation markers',     'Building A, Room 302'],
      [apptIds.a87, IDS.pat16, IDS.prov1, past(180, 10), 45, 'office_visit', 'completed',   'Biologic therapy initiation',               'Building A, Room 302'],

      // ── Richard Lewis (pat17) ── 3 appointments
      [apptIds.a88, IDS.pat17, IDS.prov1, past(21, 10),  45, 'office_visit', 'completed',  'Crohn\'s disease follow-up',                'Building A, Room 302'],
      [apptIds.a89, IDS.pat17, IDS.prov1, past(30, 9),   45, 'office_visit', 'completed',   'Colonoscopy results review',                'Building A, Room 302'],
      [apptIds.a90, IDS.pat17, IDS.prov1, past(180, 10), 45, 'office_visit', 'completed',   'GI inflammation management',               'Building A, Room 302'],

      // ════════════════════════════════════════════════════════════
      // DETERMINISTIC SCHEDULE — same patient at same slot every week
      //   Mon: pat1@9am  pat2@10am  pat3@11am  pat4@2pm
      //   Tue: pat5@9am  pat6@10am  pat7@11am  pat8@2pm
      //   Wed: pat9@9am  pat10@10am pat11@11am pat12@2pm
      //   Thu: pat13@9am pat14@10am pat15@11am pat16@2pm
      //   Fri: pat17@9am pat18@10am pat19@11am pat20@2pm
      // ════════════════════════════════════════════════════════════
      // ── WEEK 0 ──
      [apptIds.a91 , IDS.pat1 , IDS.prov1, weekday(1, 0,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a92 , IDS.pat2 , IDS.prov1, weekday(1, 0, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a93 , IDS.pat3 , IDS.prov1, weekday(1, 0, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a94 , IDS.pat4 , IDS.prov1, weekday(1, 0, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a95 , IDS.pat5 , IDS.prov1, weekday(2, 0,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a96 , IDS.pat6 , IDS.prov1, weekday(2, 0, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a97 , IDS.pat7 , IDS.prov1, weekday(2, 0, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a98 , IDS.pat8 , IDS.prov1, weekday(2, 0, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a99 , IDS.pat9 , IDS.prov1, weekday(3, 0,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a100, IDS.pat10, IDS.prov1, weekday(3, 0, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a101, IDS.pat11, IDS.prov1, weekday(3, 0, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a102, IDS.pat12, IDS.prov1, weekday(3, 0, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a103, IDS.pat13, IDS.prov1, weekday(4, 0,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a104, IDS.pat14, IDS.prov1, weekday(4, 0, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a105, IDS.pat15, IDS.prov1, weekday(4, 0, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a106, IDS.pat16, IDS.prov1, weekday(4, 0, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a107, IDS.pat17, IDS.prov1, weekday(5, 0,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a108, IDS.pat18, IDS.prov1, weekday(5, 0, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a109, IDS.pat19, IDS.prov1, weekday(5, 0, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a110, IDS.pat20, IDS.prov1, weekday(5, 0, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 1 ──
      [apptIds.a111, IDS.pat1 , IDS.prov1, weekday(1, 1,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a112, IDS.pat2 , IDS.prov1, weekday(1, 1, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a113, IDS.pat3 , IDS.prov1, weekday(1, 1, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a114, IDS.pat4 , IDS.prov1, weekday(1, 1, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a115, IDS.pat5 , IDS.prov1, weekday(2, 1,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a116, IDS.pat6 , IDS.prov1, weekday(2, 1, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a117, IDS.pat7 , IDS.prov1, weekday(2, 1, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a118, IDS.pat8 , IDS.prov1, weekday(2, 1, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a119, IDS.pat9 , IDS.prov1, weekday(3, 1,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a120, IDS.pat10, IDS.prov1, weekday(3, 1, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a121, IDS.pat11, IDS.prov1, weekday(3, 1, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a122, IDS.pat12, IDS.prov1, weekday(3, 1, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a123, IDS.pat13, IDS.prov1, weekday(4, 1,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a124, IDS.pat14, IDS.prov1, weekday(4, 1, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a125, IDS.pat15, IDS.prov1, weekday(4, 1, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a126, IDS.pat16, IDS.prov1, weekday(4, 1, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a127, IDS.pat17, IDS.prov1, weekday(5, 1,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a128, IDS.pat18, IDS.prov1, weekday(5, 1, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a129, IDS.pat19, IDS.prov1, weekday(5, 1, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a130, IDS.pat20, IDS.prov1, weekday(5, 1, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 2 ──
      [apptIds.a131, IDS.pat1 , IDS.prov1, weekday(1, 2,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a132, IDS.pat2 , IDS.prov1, weekday(1, 2, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a133, IDS.pat3 , IDS.prov1, weekday(1, 2, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a134, IDS.pat4 , IDS.prov1, weekday(1, 2, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a135, IDS.pat5 , IDS.prov1, weekday(2, 2,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a136, IDS.pat6 , IDS.prov1, weekday(2, 2, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a137, IDS.pat7 , IDS.prov1, weekday(2, 2, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a138, IDS.pat8 , IDS.prov1, weekday(2, 2, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a139, IDS.pat9 , IDS.prov1, weekday(3, 2,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a140, IDS.pat10, IDS.prov1, weekday(3, 2, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a141, IDS.pat11, IDS.prov1, weekday(3, 2, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a142, IDS.pat12, IDS.prov1, weekday(3, 2, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a143, IDS.pat13, IDS.prov1, weekday(4, 2,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a144, IDS.pat14, IDS.prov1, weekday(4, 2, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a145, IDS.pat15, IDS.prov1, weekday(4, 2, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a146, IDS.pat16, IDS.prov1, weekday(4, 2, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a147, IDS.pat17, IDS.prov1, weekday(5, 2,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a148, IDS.pat18, IDS.prov1, weekday(5, 2, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a149, IDS.pat19, IDS.prov1, weekday(5, 2, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a150, IDS.pat20, IDS.prov1, weekday(5, 2, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 3 ──
      [apptIds.a151, IDS.pat1 , IDS.prov1, weekday(1, 3,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a152, IDS.pat2 , IDS.prov1, weekday(1, 3, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a153, IDS.pat3 , IDS.prov1, weekday(1, 3, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a154, IDS.pat4 , IDS.prov1, weekday(1, 3, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a155, IDS.pat5 , IDS.prov1, weekday(2, 3,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a156, IDS.pat6 , IDS.prov1, weekday(2, 3, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a157, IDS.pat7 , IDS.prov1, weekday(2, 3, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a158, IDS.pat8 , IDS.prov1, weekday(2, 3, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a159, IDS.pat9 , IDS.prov1, weekday(3, 3,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a160, IDS.pat10, IDS.prov1, weekday(3, 3, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a161, IDS.pat11, IDS.prov1, weekday(3, 3, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a162, IDS.pat12, IDS.prov1, weekday(3, 3, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a163, IDS.pat13, IDS.prov1, weekday(4, 3,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a164, IDS.pat14, IDS.prov1, weekday(4, 3, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a165, IDS.pat15, IDS.prov1, weekday(4, 3, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a166, IDS.pat16, IDS.prov1, weekday(4, 3, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a167, IDS.pat17, IDS.prov1, weekday(5, 3,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a168, IDS.pat18, IDS.prov1, weekday(5, 3, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a169, IDS.pat19, IDS.prov1, weekday(5, 3, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a170, IDS.pat20, IDS.prov1, weekday(5, 3, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 4 ──
      [apptIds.a171, IDS.pat1 , IDS.prov1, weekday(1, 4,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a172, IDS.pat2 , IDS.prov1, weekday(1, 4, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a173, IDS.pat3 , IDS.prov1, weekday(1, 4, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a174, IDS.pat4 , IDS.prov1, weekday(1, 4, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a175, IDS.pat5 , IDS.prov1, weekday(2, 4,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a176, IDS.pat6 , IDS.prov1, weekday(2, 4, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a177, IDS.pat7 , IDS.prov1, weekday(2, 4, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a178, IDS.pat8 , IDS.prov1, weekday(2, 4, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a179, IDS.pat9 , IDS.prov1, weekday(3, 4,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a180, IDS.pat10, IDS.prov1, weekday(3, 4, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a181, IDS.pat11, IDS.prov1, weekday(3, 4, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a182, IDS.pat12, IDS.prov1, weekday(3, 4, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a183, IDS.pat13, IDS.prov1, weekday(4, 4,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a184, IDS.pat14, IDS.prov1, weekday(4, 4, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a185, IDS.pat15, IDS.prov1, weekday(4, 4, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a186, IDS.pat16, IDS.prov1, weekday(4, 4, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a187, IDS.pat17, IDS.prov1, weekday(5, 4,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a188, IDS.pat18, IDS.prov1, weekday(5, 4, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a189, IDS.pat19, IDS.prov1, weekday(5, 4, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a190, IDS.pat20, IDS.prov1, weekday(5, 4, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 5 ──
      [apptIds.a191, IDS.pat1 , IDS.prov1, weekday(1, 5,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a192, IDS.pat2 , IDS.prov1, weekday(1, 5, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a193, IDS.pat3 , IDS.prov1, weekday(1, 5, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a194, IDS.pat4 , IDS.prov1, weekday(1, 5, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a195, IDS.pat5 , IDS.prov1, weekday(2, 5,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a196, IDS.pat6 , IDS.prov1, weekday(2, 5, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a197, IDS.pat7 , IDS.prov1, weekday(2, 5, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a198, IDS.pat8 , IDS.prov1, weekday(2, 5, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a199, IDS.pat9 , IDS.prov1, weekday(3, 5,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a200, IDS.pat10, IDS.prov1, weekday(3, 5, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a201, IDS.pat11, IDS.prov1, weekday(3, 5, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a202, IDS.pat12, IDS.prov1, weekday(3, 5, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a203, IDS.pat13, IDS.prov1, weekday(4, 5,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a204, IDS.pat14, IDS.prov1, weekday(4, 5, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a205, IDS.pat15, IDS.prov1, weekday(4, 5, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a206, IDS.pat16, IDS.prov1, weekday(4, 5, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a207, IDS.pat17, IDS.prov1, weekday(5, 5,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a208, IDS.pat18, IDS.prov1, weekday(5, 5, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a209, IDS.pat19, IDS.prov1, weekday(5, 5, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a210, IDS.pat20, IDS.prov1, weekday(5, 5, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 6 ──
      [apptIds.a211, IDS.pat1 , IDS.prov1, weekday(1, 6,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a212, IDS.pat2 , IDS.prov1, weekday(1, 6, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a213, IDS.pat3 , IDS.prov1, weekday(1, 6, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a214, IDS.pat4 , IDS.prov1, weekday(1, 6, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a215, IDS.pat5 , IDS.prov1, weekday(2, 6,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a216, IDS.pat6 , IDS.prov1, weekday(2, 6, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a217, IDS.pat7 , IDS.prov1, weekday(2, 6, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a218, IDS.pat8 , IDS.prov1, weekday(2, 6, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a219, IDS.pat9 , IDS.prov1, weekday(3, 6,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a220, IDS.pat10, IDS.prov1, weekday(3, 6, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a221, IDS.pat11, IDS.prov1, weekday(3, 6, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a222, IDS.pat12, IDS.prov1, weekday(3, 6, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a223, IDS.pat13, IDS.prov1, weekday(4, 6,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a224, IDS.pat14, IDS.prov1, weekday(4, 6, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a225, IDS.pat15, IDS.prov1, weekday(4, 6, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a226, IDS.pat16, IDS.prov1, weekday(4, 6, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a227, IDS.pat17, IDS.prov1, weekday(5, 6,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a228, IDS.pat18, IDS.prov1, weekday(5, 6, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a229, IDS.pat19, IDS.prov1, weekday(5, 6, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a230, IDS.pat20, IDS.prov1, weekday(5, 6, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 7 ──
      [apptIds.a231, IDS.pat1 , IDS.prov1, weekday(1, 7,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a232, IDS.pat2 , IDS.prov1, weekday(1, 7, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a233, IDS.pat3 , IDS.prov1, weekday(1, 7, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a234, IDS.pat4 , IDS.prov1, weekday(1, 7, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a235, IDS.pat5 , IDS.prov1, weekday(2, 7,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a236, IDS.pat6 , IDS.prov1, weekday(2, 7, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a237, IDS.pat7 , IDS.prov1, weekday(2, 7, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a238, IDS.pat8 , IDS.prov1, weekday(2, 7, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a239, IDS.pat9 , IDS.prov1, weekday(3, 7,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a240, IDS.pat10, IDS.prov1, weekday(3, 7, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a241, IDS.pat11, IDS.prov1, weekday(3, 7, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a242, IDS.pat12, IDS.prov1, weekday(3, 7, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a243, IDS.pat13, IDS.prov1, weekday(4, 7,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a244, IDS.pat14, IDS.prov1, weekday(4, 7, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a245, IDS.pat15, IDS.prov1, weekday(4, 7, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a246, IDS.pat16, IDS.prov1, weekday(4, 7, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a247, IDS.pat17, IDS.prov1, weekday(5, 7,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a248, IDS.pat18, IDS.prov1, weekday(5, 7, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a249, IDS.pat19, IDS.prov1, weekday(5, 7, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a250, IDS.pat20, IDS.prov1, weekday(5, 7, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 8 ──
      [apptIds.a251, IDS.pat1 , IDS.prov1, weekday(1, 8,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a252, IDS.pat2 , IDS.prov1, weekday(1, 8, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a253, IDS.pat3 , IDS.prov1, weekday(1, 8, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a254, IDS.pat4 , IDS.prov1, weekday(1, 8, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a255, IDS.pat5 , IDS.prov1, weekday(2, 8,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a256, IDS.pat6 , IDS.prov1, weekday(2, 8, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a257, IDS.pat7 , IDS.prov1, weekday(2, 8, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a258, IDS.pat8 , IDS.prov1, weekday(2, 8, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a259, IDS.pat9 , IDS.prov1, weekday(3, 8,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a260, IDS.pat10, IDS.prov1, weekday(3, 8, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a261, IDS.pat11, IDS.prov1, weekday(3, 8, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a262, IDS.pat12, IDS.prov1, weekday(3, 8, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a263, IDS.pat13, IDS.prov1, weekday(4, 8,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a264, IDS.pat14, IDS.prov1, weekday(4, 8, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a265, IDS.pat15, IDS.prov1, weekday(4, 8, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a266, IDS.pat16, IDS.prov1, weekday(4, 8, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a267, IDS.pat17, IDS.prov1, weekday(5, 8,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a268, IDS.pat18, IDS.prov1, weekday(5, 8, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a269, IDS.pat19, IDS.prov1, weekday(5, 8, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a270, IDS.pat20, IDS.prov1, weekday(5, 8, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 9 ──
      [apptIds.a271, IDS.pat1 , IDS.prov1, weekday(1, 9,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a272, IDS.pat2 , IDS.prov1, weekday(1, 9, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a273, IDS.pat3 , IDS.prov1, weekday(1, 9, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a274, IDS.pat4 , IDS.prov1, weekday(1, 9, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a275, IDS.pat5 , IDS.prov1, weekday(2, 9,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a276, IDS.pat6 , IDS.prov1, weekday(2, 9, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a277, IDS.pat7 , IDS.prov1, weekday(2, 9, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a278, IDS.pat8 , IDS.prov1, weekday(2, 9, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a279, IDS.pat9 , IDS.prov1, weekday(3, 9,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a280, IDS.pat10, IDS.prov1, weekday(3, 9, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a281, IDS.pat11, IDS.prov1, weekday(3, 9, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a282, IDS.pat12, IDS.prov1, weekday(3, 9, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a283, IDS.pat13, IDS.prov1, weekday(4, 9,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a284, IDS.pat14, IDS.prov1, weekday(4, 9, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a285, IDS.pat15, IDS.prov1, weekday(4, 9, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a286, IDS.pat16, IDS.prov1, weekday(4, 9, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a287, IDS.pat17, IDS.prov1, weekday(5, 9,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a288, IDS.pat18, IDS.prov1, weekday(5, 9, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a289, IDS.pat19, IDS.prov1, weekday(5, 9, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a290, IDS.pat20, IDS.prov1, weekday(5, 9, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 10 ──
      [apptIds.a291, IDS.pat1 , IDS.prov1, weekday(1, 10,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a292, IDS.pat2 , IDS.prov1, weekday(1, 10, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a293, IDS.pat3 , IDS.prov1, weekday(1, 10, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a294, IDS.pat4 , IDS.prov1, weekday(1, 10, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a295, IDS.pat5 , IDS.prov1, weekday(2, 10,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a296, IDS.pat6 , IDS.prov1, weekday(2, 10, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a297, IDS.pat7 , IDS.prov1, weekday(2, 10, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a298, IDS.pat8 , IDS.prov1, weekday(2, 10, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a299, IDS.pat9 , IDS.prov1, weekday(3, 10,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a300, IDS.pat10, IDS.prov1, weekday(3, 10, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a301, IDS.pat11, IDS.prov1, weekday(3, 10, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a302, IDS.pat12, IDS.prov1, weekday(3, 10, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a303, IDS.pat13, IDS.prov1, weekday(4, 10,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a304, IDS.pat14, IDS.prov1, weekday(4, 10, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a305, IDS.pat15, IDS.prov1, weekday(4, 10, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a306, IDS.pat16, IDS.prov1, weekday(4, 10, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a307, IDS.pat17, IDS.prov1, weekday(5, 10,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a308, IDS.pat18, IDS.prov1, weekday(5, 10, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a309, IDS.pat19, IDS.prov1, weekday(5, 10, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a310, IDS.pat20, IDS.prov1, weekday(5, 10, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 11 ──
      [apptIds.a311, IDS.pat1 , IDS.prov1, weekday(1, 11,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a312, IDS.pat2 , IDS.prov1, weekday(1, 11, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a313, IDS.pat3 , IDS.prov1, weekday(1, 11, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a314, IDS.pat4 , IDS.prov1, weekday(1, 11, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a315, IDS.pat5 , IDS.prov1, weekday(2, 11,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a316, IDS.pat6 , IDS.prov1, weekday(2, 11, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a317, IDS.pat7 , IDS.prov1, weekday(2, 11, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a318, IDS.pat8 , IDS.prov1, weekday(2, 11, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
      [apptIds.a319, IDS.pat9 , IDS.prov1, weekday(3, 11,  9), 30, 'office_visit', 'scheduled', 'Asthma and respiratory management',                 'Building A, Room 302'],
      [apptIds.a320, IDS.pat10, IDS.prov1, weekday(3, 11, 10), 30, 'follow_up'   , 'scheduled', 'Diabetes and osteoporosis management',              'Building A, Room 302'],
      [apptIds.a321, IDS.pat11, IDS.prov1, weekday(3, 11, 11), 30, 'office_visit', 'scheduled', 'Heart failure and AFib management',                 'Building A, Room 302'],
      [apptIds.a322, IDS.pat12, IDS.prov1, weekday(3, 11, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and gastrointestinal follow-up',           'Building A, Room 302'],
      [apptIds.a323, IDS.pat13, IDS.prov1, weekday(4, 11,  9), 30, 'office_visit', 'scheduled', 'Complex geriatric care and CKD management',         'Building A, Room 302'],
      [apptIds.a324, IDS.pat14, IDS.prov1, weekday(4, 11, 10), 30, 'follow_up'   , 'scheduled', 'Prenatal and gestational hypertension care',        'Building A, Room 302'],
      [apptIds.a325, IDS.pat15, IDS.prov1, weekday(4, 11, 11), 30, 'office_visit', 'scheduled', 'COPD and pulmonary management',                     'Building A, Room 302'],
      [apptIds.a326, IDS.pat16, IDS.prov1, weekday(4, 11, 14), 30, 'follow_up'   , 'scheduled', 'Rheumatoid arthritis and biologic therapy review',  'Building A, Room 302'],
      [apptIds.a327, IDS.pat17, IDS.prov1, weekday(5, 11,  9), 30, 'office_visit', 'scheduled', 'Crohn\'s disease management',                        'Building A, Room 302'],
      [apptIds.a328, IDS.pat18, IDS.prov1, weekday(5, 11, 10), 30, 'follow_up'   , 'scheduled', 'Migraine and multiple sclerosis management',        'Building A, Room 302'],
      [apptIds.a329, IDS.pat19, IDS.prov1, weekday(5, 11, 11), 30, 'office_visit', 'scheduled', 'Low back pain and general wellness',                'Building A, Room 302'],
      [apptIds.a330, IDS.pat20, IDS.prov1, weekday(5, 11, 14), 30, 'follow_up'   , 'scheduled', 'Diabetes and hypothyroidism management',            'Building A, Room 302'],
      // ── WEEK 12 ──
      [apptIds.a331, IDS.pat1 , IDS.prov1, weekday(1, 12,  9), 30, 'office_visit', 'scheduled', 'Diabetes and hypertension follow-up',               'Building A, Room 302'],
      [apptIds.a332, IDS.pat2 , IDS.prov1, weekday(1, 12, 10), 30, 'follow_up'   , 'scheduled', 'Heart failure management and cardiac review',       'Building A, Room 302'],
      [apptIds.a333, IDS.pat3 , IDS.prov1, weekday(1, 12, 11), 30, 'office_visit', 'scheduled', 'Asthma management and inhaler review',              'Building A, Room 302'],
      [apptIds.a334, IDS.pat4 , IDS.prov1, weekday(1, 12, 14), 30, 'follow_up'   , 'scheduled', 'Prenatal care visit',                               'Building A, Room 302'],
      [apptIds.a335, IDS.pat5 , IDS.prov1, weekday(2, 12,  9), 30, 'office_visit', 'scheduled', 'Hypertension and diabetes review',                  'Building A, Room 302'],
      [apptIds.a336, IDS.pat6 , IDS.prov1, weekday(2, 12, 10), 30, 'follow_up'   , 'scheduled', 'Hypothyroidism and thyroid management',             'Building A, Room 302'],
      [apptIds.a337, IDS.pat7 , IDS.prov1, weekday(2, 12, 11), 30, 'office_visit', 'scheduled', 'Parkinson\'s disease management',                    'Building A, Room 302'],
      [apptIds.a338, IDS.pat8 , IDS.prov1, weekday(2, 12, 14), 30, 'follow_up'   , 'scheduled', 'Multiple sclerosis follow-up',                      'Building A, Room 302'],
    ];
    for (const [id, patId, provId, scheduledAt, duration, type, status, complaint, location] of appointments) {
      await client.query(`
        INSERT INTO appointments (id, patient_id, provider_id, scheduled_at, duration_minutes, type, status, chief_complaint, location)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [id, patId, provId, scheduledAt, duration, type, status, complaint, location]);
    }
    console.log('✅ Appointments seeded (130)');

    // ========== VITAL SIGNS ==========
    // [patId, apptId, recordedAt, bpSys, bpDia, hr, temp, rr, o2, weight, height, bmi, pain]
    const vitals = [
      // John Smith — trending BP & weight improvement over 2 years
      [IDS.pat1, apptIds.a3,  past(30, 10),  128, 82, 74, 98.6, 16, 98, 193.2, 70.0, 27.7, 1],
      [IDS.pat1, apptIds.a4,  past(60, 11),  130, 84, 76, 98.4, 16, 98, 194.0, 70.0, 27.8, 0],
      [IDS.pat1, apptIds.a6,  past(90, 10),  132, 84, 75, 98.5, 16, 98, 194.8, 70.0, 27.9, 1],
      [IDS.pat1, apptIds.a7,  past(180, 9),  134, 86, 77, 98.6, 17, 97, 196.0, 70.0, 28.1, 2],
      [IDS.pat1, apptIds.a8,  past(270, 10), 136, 87, 78, 98.5, 16, 97, 197.0, 70.0, 28.2, 1],
      [IDS.pat1, apptIds.a9,  past(365, 9),  138, 88, 79, 98.7, 17, 97, 198.5, 70.0, 28.5, 2],
      [IDS.pat1, apptIds.a10, past(450, 10), 140, 90, 80, 98.6, 17, 97, 200.0, 70.0, 28.7, 2],
      [IDS.pat1, apptIds.a11, past(545, 9),  142, 91, 81, 98.4, 17, 97, 201.5, 70.0, 28.9, 1],
      [IDS.pat1, apptIds.a12, past(635, 10), 145, 92, 82, 98.6, 18, 96, 203.0, 70.0, 29.1, 3],
      [IDS.pat1, apptIds.a13, past(720, 9),  148, 94, 84, 98.8, 18, 96, 205.0, 70.0, 29.4, 2],
      // Mary Johnson — elevated BP, weight concern
      [IDS.pat2, apptIds.a15, past(14, 9),   145, 92, 88, 98.8, 18, 96, 158.6, 65.0, 26.4, 3],
      [IDS.pat2, apptIds.a16, past(45, 10),  148, 94, 90, 98.9, 19, 95, 160.2, 65.0, 26.6, 3],
      [IDS.pat2, apptIds.a18, past(180, 10), 150, 95, 86, 98.7, 18, 96, 157.4, 65.0, 26.2, 2],
      [IDS.pat2, apptIds.a19, past(365, 9),  155, 97, 92, 99.0, 20, 95, 162.0, 65.0, 26.9, 4],
      // Robert Davis — asthma patient, lower o2 on bad days
      [IDS.pat3, apptIds.a22, past(7, 13),   118, 76, 82, 99.1, 20, 95, 172.0, 69.0, 25.4, 1],
      [IDS.pat3, apptIds.a23, past(90, 10),  120, 78, 80, 98.6, 18, 97, 171.0, 69.0, 25.2, 1],
      [IDS.pat3, apptIds.a25, past(365, 10), 118, 75, 78, 98.4, 16, 98, 169.5, 69.0, 25.0, 0],
      // Michael Brown — high BP, overweight
      [IDS.pat5, apptIds.a31, past(20, 14),  156, 98, 90, 98.2, 16, 98, 210.8, 68.5, 31.0, 0],
      [IDS.pat5, apptIds.a32, past(60, 10),  152, 96, 88, 98.4, 16, 98, 212.5, 68.5, 31.3, 1],
      [IDS.pat5, apptIds.a33, past(120, 11), 158, 99, 91, 98.3, 17, 97, 214.0, 68.5, 31.5, 0],
      [IDS.pat5, apptIds.a34, past(270, 10), 162, 100, 89, 98.5, 17, 97, 215.2, 68.5, 31.7, 2],
      [IDS.pat5, apptIds.a35, past(365, 9),  168, 104, 93, 98.6, 18, 97, 216.0, 68.5, 31.8, 1],
      // Patricia Martinez
      [IDS.pat6, apptIds.a38, past(45, 10),  110, 72, 68, 98.7, 14, 99, 135.2, 63.0, 23.9, 0],
      [IDS.pat6, apptIds.a39, past(135, 9),  112, 73, 70, 98.5, 14, 99, 136.0, 63.0, 24.1, 0],
      [IDS.pat6, apptIds.a41, past(365, 9),  114, 74, 72, 98.6, 15, 99, 138.0, 63.0, 24.4, 0],
      // Christopher Jones — Parkinson's, mild hypertension
      [IDS.pat7, apptIds.a44, past(30, 9),   135, 84, 72, 98.4, 15, 98, 178.0, 68.0, 27.0, 2],
      [IDS.pat7, apptIds.a45, past(120, 10), 138, 86, 74, 98.5, 15, 97, 179.5, 68.0, 27.2, 3],
      [IDS.pat7, apptIds.a47, past(270, 10), 140, 88, 76, 98.6, 16, 97, 181.0, 68.0, 27.5, 3],
      // Linda Garcia — MS, normal vitals but pain concern
      [IDS.pat8, apptIds.a50, past(45, 9),   118, 74, 78, 98.8, 16, 99, 145.0, 66.0, 23.4, 5],
      [IDS.pat8, apptIds.a51, past(135, 10), 120, 76, 80, 98.7, 16, 98, 146.0, 66.0, 23.6, 6],
      [IDS.pat8, apptIds.a53, past(365, 10), 116, 72, 76, 98.5, 15, 99, 143.0, 66.0, 23.1, 4],
      // Barbara Lee — elderly diabetic
      [IDS.pat10, apptIds.a58, past(90, 9),  138, 88, 76, 98.5, 15, 97, 162.4, 62.5, 29.0, 1],
      [IDS.pat10, apptIds.a59, past(180, 10),140, 90, 78, 98.4, 15, 97, 163.0, 62.5, 29.1, 2],
      [IDS.pat10, apptIds.a61, past(365, 10),142, 91, 80, 98.6, 16, 96, 165.0, 62.5, 29.5, 2],
      // William Taylor — cardiac patient
      [IDS.pat11, apptIds.a65, past(30, 9),  142, 88, 72, 98.4, 15, 97, 188.0, 70.5, 26.6, 1],
      [IDS.pat11, apptIds.a66, past(90, 10), 145, 90, 76, 98.5, 16, 96, 190.0, 70.5, 26.9, 2],
      [IDS.pat11, apptIds.a68, past(365, 10),148, 92, 80, 98.7, 17, 96, 192.0, 70.5, 27.2, 2],
      // Elizabeth Thomas
      [IDS.pat12, apptIds.a70, past(20, 10), 122, 78, 74, 98.5, 15, 99, 155.0, 65.5, 25.5, 0],
      [IDS.pat12, apptIds.a71, past(180, 9), 120, 76, 72, 98.4, 14, 99, 153.0, 65.5, 25.1, 0],
      // James Jackson — elderly, multiple comorbidities
      [IDS.pat13, apptIds.a74, past(14, 10), 148, 90, 68, 98.3, 15, 97, 172.0, 67.0, 26.9, 3],
      [IDS.pat13, apptIds.a75, past(60, 9),  150, 92, 70, 98.4, 16, 96, 173.0, 67.0, 27.1, 4],
      [IDS.pat13, apptIds.a77, past(365, 9), 152, 94, 72, 98.5, 16, 96, 175.0, 67.0, 27.4, 3],
      // David Harris — COPD patient, low O2 sat
      [IDS.pat15, apptIds.a82, past(30, 9),  130, 82, 82, 98.2, 22, 92, 182.0, 70.0, 26.1, 2],
      [IDS.pat15, apptIds.a83, past(120, 10),135, 85, 88, 98.6, 24, 90, 183.0, 70.0, 26.2, 3],
      // Karen Clark — rheumatology, joint pain
      [IDS.pat16, apptIds.a86, past(45, 9),  118, 75, 76, 98.7, 15, 99, 148.0, 64.0, 25.4, 6],
      [IDS.pat16, apptIds.a87, past(180, 10),120, 76, 78, 98.8, 15, 99, 149.0, 64.0, 25.5, 7],
      // Richard Lewis — GI patient
      [IDS.pat17, apptIds.a89, past(30, 9),  118, 74, 72, 98.6, 14, 99, 175.0, 71.0, 24.4, 4],
      [IDS.pat17, apptIds.a90, past(180, 10),116, 73, 70, 98.5, 14, 99, 177.0, 71.0, 24.7, 3],
    ];
    for (const [patId, apptId, recordedAt, bps, bpd, hr, temp, rr, o2, weight, height, bmi, pain] of vitals) {
      await client.query(`
        INSERT INTO vital_signs (patient_id, appointment_id, recorded_at, blood_pressure_systolic,
          blood_pressure_diastolic, heart_rate, temperature, respiratory_rate, oxygen_saturation,
          weight, height, bmi, pain_level)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [patId, apptId, recordedAt, bps, bpd, hr, temp, rr, o2, weight, height, bmi, pain]);
    }
    console.log('✅ Vital signs seeded (49)');

    // ========== LAB RESULTS ==========
    // [patId, provId, orderedAt, resultedAt, testName, testCode, value, unit, refRange, status, panel, notes]
    const labs = [
      // ── John Smith A1C trend (2 years) — improving from 9.2% to 7.4% ──
      [IDS.pat1, IDS.prov1, past(720), past(719), 'Hemoglobin A1c',      'A1C',   '9.2',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Poorly controlled - starting intensified regimen'],
      [IDS.pat1, IDS.prov1, past(720), past(719), 'Glucose, Fasting',    'GLU',   '185',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  'Significantly elevated'],
      [IDS.pat1, IDS.prov1, past(720), past(719), 'Total Cholesterol',   'CHOL',  '242',    'mg/dL', '< 200 mg/dL',  'abnormal',  'Lipid Panel',      'High - initiating statin therapy'],
      [IDS.pat1, IDS.prov1, past(720), past(719), 'LDL Cholesterol',     'LDL',   '168',    'mg/dL', '< 100 mg/dL',  'abnormal',  'Lipid Panel',      'Markedly elevated'],
      [IDS.pat1, IDS.prov1, past(720), past(719), 'HDL Cholesterol',     'HDL',   '42',     'mg/dL', '> 40 mg/dL',   'resulted',  'Lipid Panel',      null],
      [IDS.pat1, IDS.prov1, past(635), past(634), 'Hemoglobin A1c',      'A1C',   '8.9',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Improving trend'],
      [IDS.pat1, IDS.prov1, past(635), past(634), 'Glucose, Fasting',    'GLU',   '172',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(545), past(544), 'Hemoglobin A1c',      'A1C',   '8.5',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Continuing to improve'],
      [IDS.pat1, IDS.prov1, past(545), past(544), 'Glucose, Fasting',    'GLU',   '165',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(545), past(544), 'Total Cholesterol',   'CHOL',  '228',    'mg/dL', '< 200 mg/dL',  'abnormal',  'Lipid Panel',      'Improved on Atorvastatin 20mg'],
      [IDS.pat1, IDS.prov1, past(545), past(544), 'LDL Cholesterol',     'LDL',   '155',    'mg/dL', '< 100 mg/dL',  'abnormal',  'Lipid Panel',      null],
      [IDS.pat1, IDS.prov1, past(450), past(449), 'Hemoglobin A1c',      'A1C',   '8.3',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   null],
      [IDS.pat1, IDS.prov1, past(450), past(449), 'Glucose, Fasting',    'GLU',   '156',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(365), past(364), 'Hemoglobin A1c',      'A1C',   '8.1',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Dose increase Metformin recommended'],
      [IDS.pat1, IDS.prov1, past(365), past(364), 'Glucose, Fasting',    'GLU',   '148',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(365), past(364), 'Creatinine',          'CREAT', '0.9',    'mg/dL', '0.7-1.2 mg/dL', 'resulted',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(365), past(364), 'Total Cholesterol',   'CHOL',  '222',    'mg/dL', '< 200 mg/dL',  'abnormal',  'Lipid Panel',      'Dose increased to Atorvastatin 40mg'],
      [IDS.pat1, IDS.prov1, past(365), past(364), 'LDL Cholesterol',     'LDL',   '148',    'mg/dL', '< 100 mg/dL',  'abnormal',  'Lipid Panel',      null],
      [IDS.pat1, IDS.prov1, past(270), past(269), 'Hemoglobin A1c',      'A1C',   '8.0',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   null],
      [IDS.pat1, IDS.prov1, past(270), past(269), 'Glucose, Fasting',    'GLU',   '145',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(180), past(179), 'Hemoglobin A1c',      'A1C',   '7.8',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Good improvement, near target'],
      [IDS.pat1, IDS.prov1, past(180), past(179), 'Glucose, Fasting',    'GLU',   '142',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(180), past(179), 'Total Cholesterol',   'CHOL',  '218',    'mg/dL', '< 200 mg/dL',  'abnormal',  'Lipid Panel',      'Borderline high'],
      [IDS.pat1, IDS.prov1, past(180), past(179), 'LDL Cholesterol',     'LDL',   '142',    'mg/dL', '< 100 mg/dL',  'abnormal',  'Lipid Panel',      'Above target for diabetic'],
      [IDS.pat1, IDS.prov1, past(180), past(179), 'HDL Cholesterol',     'HDL',   '48',     'mg/dL', '> 40 mg/dL',   'resulted',  'Lipid Panel',      null],
      [IDS.pat1, IDS.prov1, past(90),  past(89),  'Hemoglobin A1c',      'A1C',   '7.6',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'On target, continue current regimen'],
      [IDS.pat1, IDS.prov1, past(90),  past(89),  'Glucose, Fasting',    'GLU',   '138',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(90),  past(89),  'Creatinine',          'CREAT', '0.9',    'mg/dL', '0.7-1.2 mg/dL', 'resulted',  'Metabolic Panel',  null],
      [IDS.pat1, IDS.prov1, past(30),  past(29),  'Hemoglobin A1c',      'A1C',   '7.4',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Best result yet - approaching target < 7%'],
      [IDS.pat1, IDS.prov1, past(30),  past(29),  'Glucose, Fasting',    'GLU',   '132',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  'Improved significantly'],
      [IDS.pat1, IDS.prov1, past(30),  past(29),  'Total Cholesterol',   'CHOL',  '202',    'mg/dL', '< 200 mg/dL',  'abnormal',  'Lipid Panel',      'Nearly at goal'],
      [IDS.pat1, IDS.prov1, past(30),  past(29),  'LDL Cholesterol',     'LDL',   '122',    'mg/dL', '< 100 mg/dL',  'abnormal',  'Lipid Panel',      'Improving on high-dose statin'],
      [IDS.pat1, IDS.prov1, past(30),  past(29),  'HDL Cholesterol',     'HDL',   '52',     'mg/dL', '> 40 mg/dL',   'resulted',  'Lipid Panel',      null],
      [IDS.pat1, IDS.prov1, past(3),   null,       'Complete Blood Count', 'CBC',  null,     null,    null,            'pending',   'CBC Panel',        'Ordered - results pending'],

      // ── Mary Johnson — cardiac trending ──
      [IDS.pat2, IDS.prov1, past(365), past(364), 'BNP',                 'BNP',   '220',    'pg/mL', '< 100 pg/mL',  'abnormal',  'Cardiac Panel',    'Elevated - CHF diagnosis'],
      [IDS.pat2, IDS.prov1, past(365), past(364), 'eGFR',               'EGFR',  '58',     'mL/min','> 60 mL/min',   'abnormal',  'Renal Panel',      'Mildly reduced'],
      [IDS.pat2, IDS.prov1, past(180), past(179), 'BNP',                 'BNP',   '340',    'pg/mL', '< 100 pg/mL',  'abnormal',  'Cardiac Panel',    'Worsening - medication adjustment needed'],
      [IDS.pat2, IDS.prov1, past(180), past(179), 'Troponin I',          'TROP-I','0.02',   'ng/mL', '< 0.04 ng/mL', 'resulted',  'Cardiac Panel',    'Normal'],
      [IDS.pat2, IDS.prov1, past(14),  past(13),  'BNP',                 'BNP',   '485',    'pg/mL', '< 100 pg/mL',  'critical',  'Cardiac Panel',    'CRITICAL - acute decompensation'],
      [IDS.pat2, IDS.prov1, past(14),  past(13),  'Troponin I',          'TROP-I','0.02',   'ng/mL', '< 0.04 ng/mL', 'resulted',  'Cardiac Panel',    'Within normal limits'],
      [IDS.pat2, IDS.prov1, past(14),  past(13),  'eGFR',               'EGFR',  '52',     'mL/min','> 60 mL/min',   'abnormal',  'Renal Panel',      'Mild kidney impairment'],
      [IDS.pat2, IDS.prov1, past(14),  past(13),  'Sodium',              'NA',    '138',    'mEq/L', '136-145 mEq/L', 'resulted',  'Electrolyte Panel', null],
      [IDS.pat2, IDS.prov1, past(14),  past(13),  'Potassium',           'K',     '3.8',    'mEq/L', '3.5-5.0 mEq/L', 'resulted',  'Electrolyte Panel', null],

      // ── Robert Davis — asthma ──
      [IDS.pat3, IDS.prov1, past(7),   past(7),   'Peak Flow',           'PF',    '380',    'L/min', '> 400 L/min',  'abnormal',  'Pulmonary Panel',  'Below predicted normal'],
      [IDS.pat3, IDS.prov1, past(7),   past(7),   'SpO2 at Rest',        'SPO2',  '96',     '%',     '95-100%',       'resulted',  'Pulmonary Panel',  null],
      [IDS.pat3, IDS.prov1, past(270), past(269), 'FEV1',                'FEV1',  '82',     '%pred', '> 80%',         'resulted',  'Pulmonary Function', 'Mild obstruction'],
      [IDS.pat3, IDS.prov1, past(270), past(269), 'FVC',                 'FVC',   '88',     '%pred', '> 80%',         'resulted',  'Pulmonary Function', null],

      // ── Michael Brown ──
      [IDS.pat5, IDS.prov1, past(365), past(364), 'Hemoglobin A1c',      'A1C',   '6.9',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'New diabetes diagnosis'],
      [IDS.pat5, IDS.prov1, past(365), past(364), 'Glucose, Fasting',    'GLU',   '128',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  'Prediabetes/new DM2'],
      [IDS.pat5, IDS.prov1, past(270), past(269), 'Hemoglobin A1c',      'A1C',   '7.2',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Worsening - Metformin added'],
      [IDS.pat5, IDS.prov1, past(20),  past(19),  'Hemoglobin A1c',      'A1C',   '7.5',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Suboptimal control'],
      [IDS.pat5, IDS.prov1, past(20),  past(19),  'Potassium',           'K',     '3.6',    'mEq/L', '3.5-5.0 mEq/L', 'resulted',  'Metabolic Panel',  null],

      // ── Patricia Martinez — thyroid trending ──
      [IDS.pat6, IDS.prov1, past(545), past(544), 'TSH',                 'TSH',   '9.2',    'mIU/L', '0.4-4.0 mIU/L', 'abnormal',  'Thyroid Panel',    'Markedly elevated - Levothyroxine initiated'],
      [IDS.pat6, IDS.prov1, past(545), past(544), 'Free T4',             'FT4',   '0.5',    'ng/dL', '0.8-1.8 ng/dL', 'abnormal',  'Thyroid Panel',    'Low - hypothyroid'],
      [IDS.pat6, IDS.prov1, past(365), past(364), 'TSH',                 'TSH',   '7.4',    'mIU/L', '0.4-4.0 mIU/L', 'abnormal',  'Thyroid Panel',    'Improving on 50mcg'],
      [IDS.pat6, IDS.prov1, past(270), past(269), 'TSH',                 'TSH',   '6.8',    'mIU/L', '0.4-4.0 mIU/L', 'abnormal',  'Thyroid Panel',    'Dose increased to 75mcg'],
      [IDS.pat6, IDS.prov1, past(270), past(269), 'Free T4',             'FT4',   '0.7',    'ng/dL', '0.8-1.8 ng/dL', 'abnormal',  'Thyroid Panel',    'Still low'],
      [IDS.pat6, IDS.prov1, past(135), past(134), 'TSH',                 'TSH',   '4.9',    'mIU/L', '0.4-4.0 mIU/L', 'abnormal',  'Thyroid Panel',    'Near normal range'],
      [IDS.pat6, IDS.prov1, past(45),  past(44),  'TSH',                 'TSH',   '3.2',    'mIU/L', '0.4-4.0 mIU/L', 'resulted',  'Thyroid Panel',    'Within normal range - excellent response'],
      [IDS.pat6, IDS.prov1, past(45),  past(44),  'Free T4',             'FT4',   '1.1',    'ng/dL', '0.8-1.8 ng/dL', 'resulted',  'Thyroid Panel',    null],
      [IDS.pat6, IDS.prov1, past(5),   null,       'TSH',                 'TSH',   null,     null,    null,            'pending',   'Thyroid Panel',    'Routine 6-month check'],

      // ── Christopher Jones — Parkinson's labs ──
      [IDS.pat7, IDS.prov1, past(90),  past(89),  'Glucose, Fasting',    'GLU',   '135',    'mg/dL', '70-100 mg/dL',  'abnormal',  'Metabolic Panel',  'New DM2 - started Metformin'],
      [IDS.pat7, IDS.prov1, past(90),  past(89),  'BMP - Comprehensive', 'BMP',   null,     null,    null,            'resulted',  'Metabolic Panel',  'All values within normal limits except glucose'],

      // ── Barbara Lee — long-term diabetes & osteoporosis ──
      [IDS.pat10, IDS.prov1, past(545), past(544), 'Hemoglobin A1c',     'A1C',   '9.0',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Insulin therapy intensified'],
      [IDS.pat10, IDS.prov1, past(365), past(364), 'Hemoglobin A1c',     'A1C',   '8.8',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Slow improvement'],
      [IDS.pat10, IDS.prov1, past(365), past(364), 'Bone Density (DEXA)','DEXA',  '-2.8',   'T-score','>-1.0',        'abnormal',  'Bone Panel',       'Osteoporosis confirmed, Alendronate continued'],
      [IDS.pat10, IDS.prov1, past(270), past(269), 'Hemoglobin A1c',     'A1C',   '8.6',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   null],
      [IDS.pat10, IDS.prov1, past(180), past(179), 'Hemoglobin A1c',     'A1C',   '8.4',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   null],
      [IDS.pat10, IDS.prov1, past(90),  past(89),  'Hemoglobin A1c',     'A1C',   '8.2',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Slowly improving'],
      [IDS.pat10, IDS.prov1, past(5),   null,       'Hemoglobin A1c',     'A1C',   null,     null,    null,            'pending',   'Diabetic Panel',   'Ordered at today\'s visit'],

      // ── William Taylor — AFib & heart failure ──
      [IDS.pat11, IDS.prov1, past(90),  past(89),  'BNP',                 'BNP',   '320',    'pg/mL', '< 100 pg/mL',  'abnormal',  'Cardiac Panel',    'Elevated - CHF management'],
      [IDS.pat11, IDS.prov1, past(90),  past(89),  'INR',                 'INR',   '2.4',    '',      '2.0-3.0',       'resulted',  'Coagulation Panel','Therapeutic - on Warfarin'],
      [IDS.pat11, IDS.prov1, past(30),  past(29),  'BNP',                 'BNP',   '280',    'pg/mL', '< 100 pg/mL',  'abnormal',  'Cardiac Panel',    'Slight improvement'],
      [IDS.pat11, IDS.prov1, past(30),  past(29),  'INR',                 'INR',   '2.7',    '',      '2.0-3.0',       'resulted',  'Coagulation Panel','Therapeutic'],

      // ── James Jackson — complex elderly ──
      [IDS.pat13, IDS.prov1, past(60),  past(59),  'Hemoglobin A1c',     'A1C',   '8.9',    '%',     '< 5.7%',        'abnormal',  'Diabetic Panel',   'Poorly controlled, frailty consideration'],
      [IDS.pat13, IDS.prov1, past(60),  past(59),  'Creatinine',         'CREAT', '1.8',    'mg/dL', '0.7-1.2 mg/dL', 'abnormal',  'Renal Panel',      'Stage 3 CKD - watch nephrotoxins'],
      [IDS.pat13, IDS.prov1, past(60),  past(59),  'eGFR',              'EGFR',  '38',     'mL/min','> 60 mL/min',   'abnormal',  'Renal Panel',      'CKD Stage 3b - nephrology consult ordered'],
      [IDS.pat13, IDS.prov1, past(14),  past(13),  'Potassium',          'K',     '5.2',    'mEq/L', '3.5-5.0 mEq/L', 'abnormal',  'Electrolyte Panel','Mildly elevated - watch for hyperkalemia'],

      // ── David Harris — COPD ──
      [IDS.pat15, IDS.prov1, past(365), past(364), 'FEV1',               'FEV1',  '52',     '%pred', '> 80%',         'abnormal',  'Pulmonary Function','Moderate COPD (GOLD Stage 2)'],
      [IDS.pat15, IDS.prov1, past(365), past(364), 'FVC',                'FVC',   '68',     '%pred', '> 80%',         'abnormal',  'Pulmonary Function',null],
      [IDS.pat15, IDS.prov1, past(30),  past(29),  'FEV1',               'FEV1',  '48',     '%pred', '> 80%',         'abnormal',  'Pulmonary Function','Worsening - GOLD Stage 3 now'],
      [IDS.pat15, IDS.prov1, past(30),  past(29),  'SpO2 at Rest',       'SPO2',  '92',     '%',     '95-100%',       'abnormal',  'Pulmonary Panel',  'Low at rest - supplemental O2 discussed'],

      // ── Karen Clark — RA/Lupus inflammation markers ──
      [IDS.pat16, IDS.prov1, past(180), past(179), 'Rheumatoid Factor',  'RF',    '120',    'IU/mL', '< 14 IU/mL',   'abnormal',  'Rheumatology Panel','Markedly elevated'],
      [IDS.pat16, IDS.prov1, past(180), past(179), 'CRP (C-Reactive Protein)', 'CRP', '4.8', 'mg/L','< 1.0 mg/L',   'abnormal',  'Inflammation Panel','High - active disease'],
      [IDS.pat16, IDS.prov1, past(180), past(179), 'Anti-CCP Antibodies','ANTI-CCP','210', 'U/mL','< 20 U/mL',     'abnormal',  'Rheumatology Panel','Highly positive - RA confirmed'],
      [IDS.pat16, IDS.prov1, past(45),  past(44),  'CRP',                'CRP',   '2.1',    'mg/L', '< 1.0 mg/L',   'abnormal',  'Inflammation Panel','Improving on biologic therapy'],

      // ── Richard Lewis — GI/Crohn's ──
      [IDS.pat17, IDS.prov1, past(180), past(179), 'Fecal Calprotectin', 'FCAL',  '450',    'µg/g',  '< 50 µg/g',    'abnormal',  'GI Panel',         'Active intestinal inflammation'],
      [IDS.pat17, IDS.prov1, past(180), past(179), 'CRP',                'CRP',   '3.2',    'mg/L',  '< 1.0 mg/L',   'abnormal',  'Inflammation Panel','Elevated - active Crohn\'s'],
      [IDS.pat17, IDS.prov1, past(30),  past(29),  'Fecal Calprotectin', 'FCAL',  '280',    'µg/g',  '< 50 µg/g',    'abnormal',  'GI Panel',         'Improving on biologic therapy'],
    ];
    for (const [patId, provId, orderedAt, resultedAt, testName, testCode, value, unit, refRange, status, panel, notes] of labs) {
      await client.query(`
        INSERT INTO lab_results (patient_id, provider_id, ordered_at, resulted_at, test_name, test_code,
          value, unit, reference_range, status, panel_name, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [patId, provId, orderedAt, resultedAt, testName, testCode, value, unit, refRange, status, panel, notes]);
    }
    console.log('✅ Lab results seeded (78)');

    // ========== MEDICATIONS ==========
    // [patId, provId, name, genericName, dosage, frequency, route, startDate, endDate, status, instructions, refills]
    const meds = [
      // ── John Smith ──
      [IDS.pat1, IDS.prov1, 'Metformin',        'metformin HCl',              '1000mg',          'Twice daily',           'oral',        '2019-07-01', null,         'active',       'Take with meals to reduce GI upset', 3],
      [IDS.pat1, IDS.prov1, 'Lisinopril',       'lisinopril',                 '10mg',            'Once daily',            'oral',        '2018-04-01', null,         'active',       'Take in the morning; monitor for dry cough', 5],
      [IDS.pat1, IDS.prov1, 'Atorvastatin',     'atorvastatin calcium',       '40mg',            'Once daily at bedtime', 'oral',        '2020-02-01', null,         'active',       'Take at bedtime; avoid grapefruit', 2],
      [IDS.pat1, IDS.prov1, 'Aspirin',          'aspirin',                    '81mg',            'Once daily',            'oral',        '2019-07-01', null,         'active',       'Take with food', 11],
      [IDS.pat1, IDS.prov1, 'Glucophage XR',    'metformin extended-release', '500mg',           'Once daily',            'oral',        '2018-01-01', '2019-06-30', 'discontinued', 'Switched to regular Metformin - better glycemic control', 0],

      // ── Mary Johnson ──
      [IDS.pat2, IDS.prov1, 'Carvedilol',       'carvedilol',                 '25mg',            'Twice daily',           'oral',        '2021-09-01', null,         'active',       'Do not stop abruptly; take with food', 2],
      [IDS.pat2, IDS.prov1, 'Furosemide',       'furosemide',                 '40mg',            'Once daily',            'oral',        '2022-03-01', null,         'active',       'Take in the morning; monitor fluid intake; daily weights', 4],
      [IDS.pat2, IDS.prov1, 'Spironolactone',   'spironolactone',             '25mg',            'Once daily',            'oral',        '2022-03-01', null,         'active',       'Monitor potassium levels', 0],
      [IDS.pat2, IDS.prov1, 'Lisinopril',       'lisinopril',                 '5mg',             'Once daily',            'oral',        '2021-09-01', null,         'active',       'Monitor renal function and electrolytes', 3],
      [IDS.pat2, IDS.prov1, 'Warfarin',         'warfarin sodium',            '5mg',             'Once daily',            'oral',        '2022-08-01', null,         'active',       'INR target 2-3; avoid NSAIDs; consistent vitamin K intake', 0],
      [IDS.pat2, IDS.prov1, 'Digoxin',          'digoxin',                    '0.125mg',         'Once daily',            'oral',        '2022-09-01', null,         'active',       'Monitor digoxin level and potassium', 1],

      // ── Robert Davis ──
      [IDS.pat3, IDS.prov1, 'Albuterol Inhaler','albuterol sulfate',          '90mcg/actuation', 'As needed (2 puffs)',   'inhalation',  '2015-05-01', null,         'active',       'Use for acute bronchospasm; max 8 puffs/day', 1],
      [IDS.pat3, IDS.prov1, 'Fluticasone',      'fluticasone propionate',     '110mcg',          'Twice daily (2 puffs)', 'inhalation',  '2020-01-01', null,         'active',       'Rinse mouth after use to prevent oral thrush', 0],
      [IDS.pat3, IDS.prov1, 'Montelukast',      'montelukast sodium',         '10mg',            'Once daily at bedtime', 'oral',        '2021-03-01', null,         'active',       'For allergic rhinitis and asthma maintenance', 2],

      // ── Jennifer Wilson ──
      [IDS.pat4, IDS.prov1, 'Prenatal Vitamins','prenatal multivitamin',      '1 tablet',        'Once daily',            'oral',        '2025-01-15', null,         'active',       'Take with food; contains folic acid, iron, DHA', 3],
      [IDS.pat4, IDS.prov1, 'Labetalol',        'labetalol HCl',              '200mg',           'Twice daily',           'oral',        '2025-03-01', null,         'active',       'Monitor BP twice daily; do not stop abruptly', 2],

      // ── Michael Brown ──
      [IDS.pat5, IDS.prov1, 'Amlodipine',       'amlodipine besylate',        '10mg',            'Once daily',            'oral',        '2020-12-01', null,         'active',       'Can cause ankle swelling; report to doctor', 5],
      [IDS.pat5, IDS.prov1, 'Metformin',        'metformin HCl',              '1000mg',          'Twice daily',           'oral',        '2021-06-01', null,         'active',       'Take with meals; start with 500mg if GI upset', 3],
      [IDS.pat5, IDS.prov1, 'Hydrochlorothiazide','hydrochlorothiazide',      '25mg',            'Once daily',            'oral',        '2021-01-01', null,         'active',       'Take in the morning; monitor electrolytes', 6],
      [IDS.pat5, IDS.prov1, 'Lisinopril',       'lisinopril',                 '20mg',            'Once daily',            'oral',        '2022-01-01', null,         'active',       'Monitor BP and renal function; avoid NSAIDs', 4],

      // ── Patricia Martinez ──
      [IDS.pat6, IDS.prov1, 'Levothyroxine',       'levothyroxine sodium',       '75mcg',           'Once daily',            'oral',        '2022-08-01', null,         'active',       'Take 30 min before breakfast on empty stomach; no calcium/iron within 4h', 1],

      // ── Christopher Jones ──
      [IDS.pat7, IDS.prov1, 'Carbidopa/Levodopa',  'carbidopa-levodopa',         '25-100mg',        'Three times daily',     'oral',        '2020-04-01', null,         'active',       'Protein can reduce absorption; take on empty stomach if possible', 2],
      [IDS.pat7, IDS.prov1, 'Rasagiline',          'rasagiline mesylate',        '1mg',             'Once daily',            'oral',        '2021-01-01', null,         'active',       'Avoid tyramine-rich foods; report impulse control issues', 0],
      [IDS.pat7, IDS.prov1, 'Lisinopril',          'lisinopril',                 '20mg',            'Once daily',            'oral',        '2017-10-01', null,         'active',       'Monitor blood pressure; avoid NSAIDs', 4],
      [IDS.pat7, IDS.prov1, 'Metformin',           'metformin HCl',              '500mg',           'Once daily',            'oral',        '2023-07-01', null,         'active',       'New DM2 - start low, increase as tolerated', 3],

      // ── Linda Garcia ──
      [IDS.pat8, IDS.prov1, 'Interferon Beta-1a',  'interferon beta-1a',         '30mcg',           'Once weekly IM',        'injection',   '2020-01-01', null,         'active',       'Self-inject in thigh or abdomen; rotate sites; flu-like symptoms common', 1],
      [IDS.pat8, IDS.prov1, 'Baclofen',            'baclofen',                   '10mg',            'Three times daily',     'oral',        '2021-03-01', null,         'active',       'Do not stop abruptly - taper to avoid withdrawal seizures', 0],
      [IDS.pat8, IDS.prov1, 'Amantadine',          'amantadine HCl',             '100mg',           'Twice daily',           'oral',        '2022-06-01', null,         'active',       'For MS fatigue; avoid in renal impairment', 2],

      // ── Matthew Rodriguez ──
      [IDS.pat9, IDS.prov1, 'Albuterol Inhaler',   'albuterol sulfate',          '90mcg/actuation', 'As needed (2 puffs)',   'inhalation',  '2023-08-15', null,         'active',       'Rescue inhaler for acute wheezing; use before exercise', 2],
      [IDS.pat9, IDS.prov1, 'Amoxicillin',         'amoxicillin',                '500mg',           'Three times daily x7d', 'oral',        pastDate(14), pastDate(7),  'completed',    'Complete full course for URI/sinusitis', 0],

      // ── Barbara Lee ──
      [IDS.pat10, IDS.prov1, 'Insulin Glargine',   'insulin glargine',           '22 units',        'Once daily at bedtime', 'subcutaneous','2015-01-01', null,         'active',       'Inject at same time each night; rotate sites; monitor for hypoglycemia', 2],
      [IDS.pat10, IDS.prov1, 'Alendronate',        'alendronate sodium',         '70mg',            'Once weekly',           'oral',        '2018-05-01', null,         'active',       'Take on empty stomach with full glass of water; remain upright 30 min after', 0],
      [IDS.pat10, IDS.prov1, 'Apixaban',           'apixaban',                   '5mg',             'Twice daily',           'oral',        '2023-11-15', null,         'active',       'For AFib stroke prevention; do not crush; no dose adjustments without MD', 1],
      [IDS.pat10, IDS.prov1, 'Lisinopril',         'lisinopril',                 '10mg',            'Once daily',            'oral',        '2012-09-01', null,         'active',       'Monitor BP; hold for SBP < 100 mmHg', 3],

      // ── William Taylor (pat11) ──
      [IDS.pat11, IDS.prov1, 'Carvedilol',         'carvedilol',                 '12.5mg',          'Twice daily',           'oral',        '2022-09-01', null,         'active',       'Take with food; do not stop abruptly', 2],
      [IDS.pat11, IDS.prov1, 'Furosemide',         'furosemide',                 '40mg',            'Once daily',            'oral',        '2022-09-01', null,         'active',       'Take in morning; monitor daily weight', 3],
      [IDS.pat11, IDS.prov1, 'Warfarin',           'warfarin sodium',            '5mg',             'Once daily',            'oral',        '2023-02-01', null,         'active',       'INR target 2-3; consistent vitamin K; avoid NSAIDs', 0],
      [IDS.pat11, IDS.prov1, 'Digoxin',            'digoxin',                    '0.125mg',         'Once daily',            'oral',        '2022-09-01', null,         'active',       'Monitor level; check K+ before each dose', 1],

      // ── Elizabeth Thomas (pat12) ──
      [IDS.pat12, IDS.prov1, 'Metformin',          'metformin HCl',              '500mg',           'Once daily with dinner','oral',        '2023-04-01', null,         'active',       'Start low dose; increase to 1000mg in 4 weeks if tolerated', 5],
      [IDS.pat12, IDS.prov1, 'Fiber Supplement',   'psyllium husk',              '1 tsp',           'Once daily',            'oral',        '2022-11-01', null,         'active',       'Mix in 8oz water; helps diverticulosis; increase fluid intake', 11],

      // ── James Jackson (pat13) ──
      [IDS.pat13, IDS.prov1, 'Insulin Glargine',   'insulin glargine',           '30 units',        'Once daily at bedtime', 'subcutaneous','2010-01-01', null,         'active',       'Long-acting insulin; do not mix with other insulins', 2],
      [IDS.pat13, IDS.prov1, 'Lisinopril',         'lisinopril',                 '5mg',             'Once daily',            'oral',        '2000-08-01', null,         'active',       'Reduced dose for CKD; monitor creatinine and K+', 3],
      [IDS.pat13, IDS.prov1, 'Atorvastatin',       'atorvastatin calcium',       '20mg',            'Once daily',            'oral',        '2008-05-01', null,         'active',       'Lower dose due to CKD and drug interactions', 2],
      [IDS.pat13, IDS.prov1, 'Aspirin',            'aspirin',                    '81mg',            'Once daily',            'oral',        '2005-03-01', null,         'active',       'Cardioprotective; take with food', 11],

      // ── Susan White (pat14) ──
      [IDS.pat14, IDS.prov1, 'Labetalol',          'labetalol HCl',              '200mg',           'Twice daily',           'oral',        '2025-03-01', null,         'active',       'Gestational HTN; monitor BP twice daily; do not stop abruptly', 2],
      [IDS.pat14, IDS.prov1, 'Prenatal DHA',       'docosahexaenoic acid',       '200mg',           'Once daily',            'oral',        '2025-01-15', null,         'active',       'Fetal brain development; take with prenatal vitamin', 3],

      // ── David Harris (pat15) ──
      [IDS.pat15, IDS.prov1, 'Tiotropium',         'tiotropium bromide',         '18mcg',           'Once daily (1 capsule)','inhalation',  '2018-10-01', null,         'active',       'Pierce capsule with HandiHaler; rinse mouth after use', 1],
      [IDS.pat15, IDS.prov1, 'Salmeterol/Fluticasone','salmeterol/fluticasone',  '50/500mcg',       'Twice daily (1 puff)',  'inhalation',  '2020-06-01', null,         'active',       'Long-acting combo inhaler; rinse mouth after use', 0],
      [IDS.pat15, IDS.prov1, 'Roflumilast',        'roflumilast',                '500mcg',          'Once daily',            'oral',        '2022-01-01', null,         'active',       'For severe COPD; may cause GI upset and weight loss', 2],
      [IDS.pat15, IDS.prov1, 'Rivaroxaban',        'rivaroxaban',                '20mg',            'Once daily with dinner','oral',        '2022-08-01', null,         'active',       'AFib anticoagulation; take with largest meal; avoid NSAIDs', 1],

      // ── Karen Clark (pat16) ──
      [IDS.pat16, IDS.prov1, 'Adalimumab',         'adalimumab',                 '40mg',            'Every 2 weeks',         'subcutaneous','2023-10-01', null,         'active',       'Biologic for RA/lupus; refrigerate; report infections immediately', 0],
      [IDS.pat16, IDS.prov1, 'Methotrexate',       'methotrexate sodium',        '15mg',            'Once weekly',           'oral',        '2019-05-01', null,         'active',       'Take folic acid 1mg daily; avoid alcohol; contraindicated in pregnancy', 1],
      [IDS.pat16, IDS.prov1, 'Folic Acid',         'folic acid',                 '1mg',             'Once daily',            'oral',        '2019-05-01', null,         'active',       'To reduce Methotrexate side effects; do not take same day as MTX', 5],
      [IDS.pat16, IDS.prov1, 'Prednisone',         'prednisone',                 '10mg',            'Once daily (taper)',    'oral',        pastDate(30), pastDate(10), 'completed',    'Taper as directed; do not stop abruptly; short course for flare', 0],

      // ── Richard Lewis (pat17) ──
      [IDS.pat17, IDS.prov1, 'Vedolizumab',        'vedolizumab',                '300mg IV',        'Every 8 weeks',         'intravenous', '2022-09-01', null,         'active',       'Infusion at GI clinic; monitor for infections and GI symptoms', 0],
      [IDS.pat17, IDS.prov1, 'Budesonide',         'budesonide',                 '9mg',             'Once daily x8 weeks',   'oral',        pastDate(60), pastDate(4),  'completed',    'For flare control; taper at end; take in morning', 0],
      [IDS.pat17, IDS.prov1, 'Pantoprazole',       'pantoprazole sodium',        '40mg',            'Once daily',            'oral',        '2016-08-01', null,         'active',       'GI protection; take 30 min before meals', 4],

      // ── Nancy Walker (pat18) ──
      [IDS.pat18, IDS.prov1, 'Sumatriptan',        'sumatriptan succinate',      '100mg',           'As needed (1 tab)',     'oral',        '2010-04-01', null,         'active',       'Max 2 tablets per 24h; do not use within 2h of ergotamines', 2],
      [IDS.pat18, IDS.prov1, 'Glatiramer Acetate', 'glatiramer acetate',         '40mg/mL',         'Three times per week',  'subcutaneous','2018-07-01', null,         'active',       'Rotate injection sites; mild skin reactions expected', 1],
      [IDS.pat18, IDS.prov1, 'Sertraline',         'sertraline HCl',             '100mg',           'Once daily',            'oral',        '2020-02-01', null,         'active',       'For anxiety/depression; do not stop abruptly; takes 4-6 weeks to work', 3],

      // ── Charles Hall (pat19) ──
      [IDS.pat19, IDS.prov1, 'Ibuprofen',          'ibuprofen',                  '600mg',           'Every 8h as needed',    'oral',        pastDate(20), pastDate(5),  'completed',    'Low back pain; take with food; short course', 0],

      // ── Betty Allen (pat20) ──
      [IDS.pat20, IDS.prov1, 'Insulin Glargine',   'insulin glargine',           '35 units',        'Once daily at bedtime', 'subcutaneous','2010-01-01', null,         'active',       'Long-acting insulin; rotate sites; log blood sugars', 2],
      [IDS.pat20, IDS.prov1, 'Levothyroxine',      'levothyroxine sodium',       '100mcg',          'Once daily',            'oral',        '2009-05-01', null,         'active',       'Take fasting; separate from calcium/iron by 4 hours', 1],
      [IDS.pat20, IDS.prov1, 'Alendronate',        'alendronate sodium',         '70mg',            'Once weekly',           'oral',        '2015-07-01', null,         'active',       'Take on empty stomach; sit upright 30 min after', 0],
      [IDS.pat20, IDS.prov1, 'Lisinopril',         'lisinopril',                 '5mg',             'Once daily',            'oral',        '2005-03-01', null,         'active',       'Gentle BP control in elderly; monitor potassium', 4],

      // ── Daniel Young (pat21) ──
      [IDS.pat21, IDS.prov1, 'Meloxicam',          'meloxicam',                  '15mg',            'Once daily',            'oral',        '2024-09-20', null,         'active',       'For ACL inflammation; take with food; short-term use', 2],
      [IDS.pat21, IDS.prov1, 'Tramadol',           'tramadol HCl',               '50mg',            'Every 6h as needed',    'oral',        '2024-09-20', pastDate(60), 'discontinued', 'Post-surgical pain; discontinued as patient transitioned to PT', 0],

      // ── Helen King (pat22) ──
      [IDS.pat22, IDS.prov1, 'Losartan',           'losartan potassium',         '50mg',            'Once daily',            'oral',        '2017-06-01', null,         'active',       'ARB for HTN; does not cause cough like ACE inhibitors', 5],
      [IDS.pat22, IDS.prov1, 'Metformin',          'metformin HCl',              '500mg',           'Once daily with dinner','oral',        '2022-10-01', null,         'active',       'Early diabetes; monitor for GI side effects', 5],
      [IDS.pat22, IDS.prov1, 'Montelukast',        'montelukast sodium',         '10mg',            'Once daily at bedtime', 'oral',        '2019-12-01', null,         'active',       'Asthma maintenance; also helps allergic rhinitis', 2],

      // ── Paul Wright (pat23) ──
      [IDS.pat23, IDS.prov1, 'Aspirin',            'aspirin',                    '81mg',            'Once daily',            'oral',        '2019-04-01', null,         'active',       'Antiplatelet for CAD; take with food', 11],
      [IDS.pat23, IDS.prov1, 'Metoprolol Succinate','metoprolol succinate',      '50mg',            'Once daily',            'oral',        '2019-04-01', null,         'active',       'Extended-release; do not crush; take with food', 3],
      [IDS.pat23, IDS.prov1, 'Rosuvastatin',       'rosuvastatin calcium',       '20mg',            'Once daily',            'oral',        '2018-02-01', null,         'active',       'Statin for hyperlipidemia and CAD prevention', 2],

      // ── Sandra Scott (pat24) ──
      [IDS.pat24, IDS.prov1, 'Escitalopram',       'escitalopram oxalate',       '10mg',            'Once daily',            'oral',        '2024-07-01', null,         'active',       'For depression/anxiety; takes 4-6 weeks; do not stop abruptly', 3],
      [IDS.pat24, IDS.prov1, 'Buspirone',          'buspirone HCl',              '10mg',            'Twice daily',           'oral',        '2024-07-01', null,         'active',       'For anxiety; may take 2-4 weeks; no withdrawal risk', 2],

      // ── George Green (pat25) ──
      [IDS.pat25, IDS.prov1, 'Metformin',          'metformin HCl',              '1000mg',          'Twice daily',           'oral',        '2021-08-01', null,         'active',       'Take with meals; increased to 1000mg for better control', 3],
      [IDS.pat25, IDS.prov1, 'Lisinopril',         'lisinopril',                 '10mg',            'Once daily',            'oral',        '2020-04-01', null,         'active',       'Monitor BP and renal function', 5],
      [IDS.pat25, IDS.prov1, 'Atorvastatin',       'atorvastatin calcium',       '20mg',            'Once daily at bedtime', 'oral',        '2021-08-01', null,         'active',       'Starting dose for hyperlipidemia; avoid grapefruit', 2],
    ];
    for (const [patId, provId, name, generic, dosage, freq, route, startDate, endDate, status, instructions, refills] of meds) {
      await client.query(`
        INSERT INTO medications (patient_id, provider_id, name, generic_name, dosage, frequency, route,
          start_date, end_date, status, instructions, refills_remaining)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [patId, provId, name, generic, dosage, freq, route, startDate, endDate, status, instructions, refills]);
    }
    console.log('✅ Medications seeded (68)');

    // ========== BILLS ==========
    const billIds = {};
    for (let i = 1; i <= 50; i++) billIds[`b${i}`] = uuidv4();

    // [id, patId, apptId, serviceDate, dueDate, total, insuranceAmt, patientAmt, paidAmt, status, description]
    const bills = [
      // ── John Smith — 12 bills spanning 2 years ──
      [billIds.b1,  IDS.pat1, apptIds.a13, pastDate(720), pastDate(690), 480.00,  384.00, 96.00,   96.00,  'paid',    'Annual Wellness Exam with Metabolic Panel (G0438, 80053)'],
      [billIds.b2,  IDS.pat1, apptIds.a12, pastDate(635), pastDate(605), 450.00,  360.00, 90.00,   90.00,  'paid',    'Office Visit - Diabetes Management (99214)'],
      [billIds.b3,  IDS.pat1, null,         pastDate(545), pastDate(515), 220.00,  176.00, 44.00,   44.00,  'paid',    'Laboratory Services - HbA1c, Lipid Panel (83036, 80061)'],
      [billIds.b4,  IDS.pat1, apptIds.a11, pastDate(545), pastDate(515), 380.00,  304.00, 76.00,   76.00,  'paid',    'Office Visit - Statin Adjustment Follow-up (99214)'],
      [billIds.b5,  IDS.pat1, apptIds.a10, pastDate(450), pastDate(420), 450.00,  360.00, 90.00,   90.00,  'paid',    'Office Visit - Quarterly Diabetes Review (99214)'],
      [billIds.b6,  IDS.pat1, null,         pastDate(365), pastDate(335), 215.00,  172.00, 43.00,   43.00,  'paid',    'Lab Services - Annual HbA1c, CMP (83036, 80053)'],
      [billIds.b7,  IDS.pat1, apptIds.a9,  pastDate(365), pastDate(335), 520.00,  416.00, 104.00,  104.00, 'paid',    'Annual Wellness Visit with Comprehensive Labs (G0439)'],
      [billIds.b8,  IDS.pat1, apptIds.a8,  pastDate(270), pastDate(240), 450.00,  360.00, 90.00,   90.00,  'paid',    'Office Visit - Diabetes & Hypertension Follow-up (99214)'],
      [billIds.b9,  IDS.pat1, apptIds.a7,  pastDate(180), pastDate(150), 195.00,  156.00, 39.00,   39.00,  'paid',    'Telehealth Visit - Medication Review (99213-95)'],
      [billIds.b10, IDS.pat1, null,         pastDate(180), pastDate(150), 210.00,  168.00, 42.00,   42.00,  'paid',    'Lab Services - HbA1c, Lipid Panel, CMP'],
      [billIds.b11, IDS.pat1, apptIds.a6,  pastDate(90),  pastDate(60),  450.00,  360.00, 90.00,   90.00,  'paid',    'Office Visit - Quarterly Diabetes Management (99214)'],
      [billIds.b12, IDS.pat1, apptIds.a4,  pastDate(60),  pastDate(30),  325.00,  260.00, 65.00,   65.00,  'paid',    'Cardiology Consultation (99243)'],
      [billIds.b13, IDS.pat1, null,         pastDate(45),  pastDate(15),  180.00,  0.00,   180.00,  0.00,   'overdue', 'Laboratory Services - Lipid Panel, HbA1c (uninsured portion)'],
      [billIds.b14, IDS.pat1, apptIds.a3,  pastDate(30),  dueDate(15),   450.00,  360.00, 90.00,   0.00,   'pending', 'Office Visit - Annual Wellness Exam (99214)'],

      // ── Mary Johnson — 6 bills ──
      [billIds.b15, IDS.pat2, apptIds.a20, pastDate(545), pastDate(515), 920.00,  736.00, 184.00,  184.00, 'paid',    'Cardiology Initial HF Workup - Echo, BNP (93306, 83880)'],
      [billIds.b16, IDS.pat2, apptIds.a19, pastDate(365), pastDate(335), 850.00,  680.00, 170.00,  170.00, 'paid',    'Annual Cardiology Evaluation - Stress Echo (93351)'],
      [billIds.b17, IDS.pat2, apptIds.a18, pastDate(180), pastDate(150), 750.00,  600.00, 150.00,  150.00, 'paid',    'Cardiology Follow-up - Echo Review (93306)'],
      [billIds.b18, IDS.pat2, apptIds.a16, pastDate(45),  pastDate(15),  680.00,  544.00, 136.00,  0.00,   'overdue', 'Cardiology - Diuretic Adjustment Visit (99214)'],
      [billIds.b19, IDS.pat2, apptIds.a15, pastDate(14),  dueDate(16),   875.00,  700.00, 175.00,  0.00,   'pending', 'Cardiology - Stress Test & EKG (93015, 93000)'],
      [billIds.b20, IDS.pat2, null,         pastDate(14),  dueDate(16),   320.00,  256.00, 64.00,   0.00,   'pending', 'Laboratory Services - BNP, CMP, CBC (83880, 80053, 85025)'],

      // ── Robert Davis — 3 bills ──
      [billIds.b21, IDS.pat3, apptIds.a25, pastDate(365), pastDate(335), 320.00,  256.00, 64.00,   64.00,  'paid',    'Annual Asthma Review (99213)'],
      [billIds.b22, IDS.pat3, apptIds.a22, pastDate(7),   dueDate(23),   275.00,  220.00, 55.00,   55.00,  'paid',    'Office Visit - Respiratory Evaluation (99213)'],
      [billIds.b23, IDS.pat3, apptIds.a24, pastDate(270), pastDate(240), 480.00,  384.00, 96.00,   96.00,  'paid',    'Pulmonary Function Testing (94010, 94060)'],

      // ── Michael Brown — 5 bills ──
      [billIds.b24, IDS.pat5, apptIds.a36, pastDate(545), pastDate(515), 420.00,  336.00, 84.00,   84.00,  'paid',    'Office Visit - Initial Hypertension Workup (99205)'],
      [billIds.b25, IDS.pat5, apptIds.a35, pastDate(365), pastDate(335), 520.00,  416.00, 104.00,  104.00, 'paid',    'Annual Physical - New Diabetes Diagnosis (G0438, 83036)'],
      [billIds.b26, IDS.pat5, apptIds.a33, pastDate(120), pastDate(90),  380.00,  304.00, 76.00,   76.00,  'paid',    'Office Visit - Hypertension Follow-up (99213)'],
      [billIds.b27, IDS.pat5, apptIds.a31, pastDate(20),  dueDate(10),   195.00,  156.00, 39.00,   0.00,   'pending', 'Telehealth Visit - Blood Pressure Check (99213-95)'],
      [billIds.b28, IDS.pat5, null,         pastDate(20),  dueDate(10),   145.00,  116.00, 29.00,   0.00,   'pending', 'Laboratory Services - HbA1c, CMP (83036, 80053)'],

      // ── Patricia Martinez — 4 bills ──
      [billIds.b29, IDS.pat6, apptIds.a42, pastDate(545), pastDate(515), 420.00,  336.00, 84.00,   84.00,  'paid',    'Endocrinology Initial Hypothyroidism Workup (99205)'],
      [billIds.b30, IDS.pat6, apptIds.a41, pastDate(365), pastDate(335), 350.00,  280.00, 70.00,   70.00,  'paid',    'Annual Endocrinology Evaluation (99214)'],
      [billIds.b31, IDS.pat6, apptIds.a38, pastDate(45),  pastDate(15),  310.00,  248.00, 62.00,   0.00,   'overdue', 'Endocrinology - Thyroid Medication Adjustment (99214)'],
      [billIds.b32, IDS.pat6, null,         pastDate(45),  pastDate(15),  175.00,  140.00, 35.00,   0.00,   'overdue', 'Laboratory - TSH, Free T4, Free T3 (84443, 84439, 84481)'],

      // ── Christopher Jones — 3 bills ──
      [billIds.b33, IDS.pat7, apptIds.a48, pastDate(365), pastDate(335), 480.00,  0.00,   480.00,  480.00, 'paid',    'Annual Neurology - Parkinson\'s Evaluation (Medicare 99214)'],
      [billIds.b34, IDS.pat7, apptIds.a45, pastDate(120), pastDate(90),  420.00,  0.00,   420.00,  210.00, 'partial', 'Neurology - Parkinson\'s Medication Adjustment (Medicare 99213)'],
      [billIds.b35, IDS.pat7, apptIds.a44, pastDate(30),  dueDate(30),   420.00,  0.00,   420.00,  0.00,   'pending', 'Neurology - Parkinson\'s Motor Assessment (Medicare 99214)'],

      // ── Barbara Lee — 5 bills ──
      [billIds.b36, IDS.pat10, apptIds.a63, pastDate(545), pastDate(515), 520.00,  0.00,  520.00,  520.00, 'paid',    'Annual Wellness Visit - Medicare (G0439)'],
      [billIds.b37, IDS.pat10, apptIds.a61, pastDate(365), pastDate(335), 480.00,  0.00,  480.00,  480.00, 'paid',    'Annual Physical and Lab Review (Medicare 99215)'],
      [billIds.b38, IDS.pat10, apptIds.a62, pastDate(270), pastDate(240), 650.00,  0.00,  650.00,  650.00, 'paid',    'Cardiology - AFib Evaluation (Medicare 99214, 93000)'],
      [billIds.b39, IDS.pat10, apptIds.a59, pastDate(180), pastDate(150), 380.00,  0.00,  380.00,  380.00, 'paid',    'Diabetes Follow-up - Insulin Adjustment (Medicare 99213)'],
      [billIds.b40, IDS.pat10, apptIds.a58, pastDate(90),  dueDate(30),   480.00,  0.00,  480.00,  0.00,   'pending', 'Annual Physical and Lab Review (Medicare 99215)'],

      // ── William Taylor — 3 bills ──
      [billIds.b41, IDS.pat11, apptIds.a68, pastDate(365), pastDate(335), 820.00,  0.00,  820.00,  820.00, 'paid',    'Annual Cardiology (Medicare 99215, 93306)'],
      [billIds.b42, IDS.pat11, apptIds.a66, pastDate(90),  pastDate(60),  650.00,  0.00,  650.00,  650.00, 'paid',    'Cardiology - Cardiac Cath Follow-up (Medicare 99214)'],
      [billIds.b43, IDS.pat11, apptIds.a65, pastDate(30),  dueDate(30),   680.00,  0.00,  680.00,  0.00,   'pending', 'Cardiology - Echo & HF Management (Medicare 93306)'],

      // ── James Jackson — 3 bills ──
      [billIds.b44, IDS.pat13, apptIds.a77, pastDate(365), pastDate(335), 560.00,  0.00,  560.00,  560.00, 'paid',    'Annual Wellness - Complex Geriatric (Medicare G0439)'],
      [billIds.b45, IDS.pat13, apptIds.a75, pastDate(60),  pastDate(30),  490.00,  0.00,  490.00,  245.00, 'partial', 'CKD & Diabetes Management (Medicare 99215)'],
      [billIds.b46, IDS.pat13, apptIds.a74, pastDate(14),  dueDate(30),   380.00,  0.00,  380.00,  0.00,   'pending', 'Medication Reconciliation Visit (Medicare 99213)'],

      // ── David Harris — 2 bills ──
      [billIds.b47, IDS.pat15, apptIds.a84, pastDate(365), pastDate(335), 720.00,  576.00, 144.00, 144.00, 'paid',    'Annual Pulmonology - COPD Review (99215, 94010)'],
      [billIds.b48, IDS.pat15, apptIds.a82, pastDate(30),  dueDate(30),   580.00,  464.00, 116.00,  0.00,   'pending', 'Pulmonary Function Testing (94010, 94060, 94726)'],

      // ── Karen Clark — 2 bills ──
      [billIds.b49, IDS.pat16, apptIds.a87, pastDate(180), pastDate(150), 680.00,  544.00, 136.00, 136.00, 'paid',    'Rheumatology - Biologic Therapy Initiation (99215, J0171)'],
      [billIds.b50, IDS.pat16, apptIds.a86, pastDate(45),  pastDate(15),  520.00,  416.00, 104.00,  0.00,   'overdue', 'Rheumatology - Joint Assessment, Inflammation Markers (99214)'],
    ];
    for (const [id, patId, apptId, serviceDate, dueDateVal, total, ins, patAmt, paid, status, desc] of bills) {
      await client.query(`
        INSERT INTO bills (id, patient_id, appointment_id, service_date, due_date, total_amount,
          insurance_amount, patient_amount, paid_amount, status, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [id, patId, apptId, serviceDate, dueDateVal, total, ins, patAmt, paid, status, desc]);
    }
    console.log('✅ Bills seeded (50)');

    // ========== PAYMENTS ==========
    const payments = [
      // John Smith — paid bills history
      [billIds.b1,  IDS.pat1,  96.00,  pastDate(688), 'credit_card', confirm()],
      [billIds.b2,  IDS.pat1,  90.00,  pastDate(603), 'credit_card', confirm()],
      [billIds.b3,  IDS.pat1,  44.00,  pastDate(513), 'credit_card', confirm()],
      [billIds.b4,  IDS.pat1,  76.00,  pastDate(513), 'credit_card', confirm()],
      [billIds.b5,  IDS.pat1,  90.00,  pastDate(418), 'credit_card', confirm()],
      [billIds.b6,  IDS.pat1,  43.00,  pastDate(333), 'credit_card', confirm()],
      [billIds.b7,  IDS.pat1, 104.00,  pastDate(333), 'check',       confirm()],
      [billIds.b8,  IDS.pat1,  90.00,  pastDate(238), 'credit_card', confirm()],
      [billIds.b9,  IDS.pat1,  39.00,  pastDate(148), 'credit_card', confirm()],
      [billIds.b10, IDS.pat1,  42.00,  pastDate(148), 'credit_card', confirm()],
      [billIds.b11, IDS.pat1,  90.00,  pastDate(58),  'credit_card', confirm()],
      [billIds.b12, IDS.pat1,  65.00,  pastDate(28),  'credit_card', confirm()],
      // Mary Johnson
      [billIds.b15, IDS.pat2, 184.00,  pastDate(513), 'check',       confirm()],
      [billIds.b16, IDS.pat2, 170.00,  pastDate(333), 'credit_card', confirm()],
      [billIds.b17, IDS.pat2, 150.00,  pastDate(148), 'credit_card', confirm()],
      // Robert Davis
      [billIds.b21, IDS.pat3,  64.00,  pastDate(333), 'credit_card', confirm()],
      [billIds.b22, IDS.pat3,  55.00,  pastDate(5),   'credit_card', confirm()],
      [billIds.b23, IDS.pat3,  96.00,  pastDate(238), 'credit_card', confirm()],
      // Michael Brown
      [billIds.b24, IDS.pat5,  84.00,  pastDate(513), 'credit_card', confirm()],
      [billIds.b25, IDS.pat5, 104.00,  pastDate(333), 'credit_card', confirm()],
      [billIds.b26, IDS.pat5,  76.00,  pastDate(88),  'credit_card', confirm()],
      // Patricia Martinez
      [billIds.b29, IDS.pat6,  84.00,  pastDate(513), 'check',       confirm()],
      [billIds.b30, IDS.pat6,  70.00,  pastDate(333), 'credit_card', confirm()],
      // Christopher Jones
      [billIds.b33, IDS.pat7, 480.00,  pastDate(333), 'check',       confirm()],
      [billIds.b34, IDS.pat7, 210.00,  pastDate(88),  'check',       confirm()],
      // Barbara Lee
      [billIds.b36, IDS.pat10, 520.00, pastDate(513), 'check',       confirm()],
      [billIds.b37, IDS.pat10, 480.00, pastDate(333), 'check',       confirm()],
      [billIds.b38, IDS.pat10, 650.00, pastDate(238), 'check',       confirm()],
      [billIds.b39, IDS.pat10, 380.00, pastDate(148), 'check',       confirm()],
      // William Taylor
      [billIds.b41, IDS.pat11, 820.00, pastDate(333), 'check',       confirm()],
      [billIds.b42, IDS.pat11, 650.00, pastDate(58),  'check',       confirm()],
      // James Jackson
      [billIds.b44, IDS.pat13, 560.00, pastDate(333), 'check',       confirm()],
      [billIds.b45, IDS.pat13, 245.00, pastDate(28),  'check',       confirm()],
      // David Harris
      [billIds.b47, IDS.pat15, 144.00, pastDate(333), 'credit_card', confirm()],
      // Karen Clark
      [billIds.b49, IDS.pat16, 136.00, pastDate(148), 'credit_card', confirm()],
    ];
    for (const [billId, patId, amount, payDate, method, confirmNum] of payments) {
      await client.query(
        'INSERT INTO payments (bill_id, patient_id, amount, payment_date, payment_method, confirmation_number) VALUES ($1,$2,$3,$4,$5,$6)',
        [billId, patId, amount, payDate, method, confirmNum]
      );
    }
    console.log('✅ Payments seeded (36)');

    // ========== MESSAGES ==========
    const t1 = uuidv4(), t2 = uuidv4(), t3 = uuidv4(), t4 = uuidv4(),
          t5 = uuidv4(), t6 = uuidv4(), t7 = uuidv4(), t8 = uuidv4(),
          t9 = uuidv4(), t10 = uuidv4();

    // [threadId, senderId, recipientId, subject, body, sentAt, readAt, messageType]
    const messages = [
      // Thread 1 — John Smith asking about Metformin nausea (2-message exchange)
      [t1, IDS.userPt1, IDS.userP1, 'Question about Metformin side effects',
       'Dr. Chen,\n\nI\'ve been experiencing some nausea with my current Metformin 1000mg dosage. It seems worse in the morning. Should I take it with a larger meal?\n\nThank you,\nJohn Smith',
       past(5), past(4), 'general'],
      [t1, IDS.userP1, IDS.userPt1, 'Re: Question about Metformin side effects',
       'Hello Mr. Smith,\n\nYes, taking Metformin with your largest meal of the day can significantly reduce nausea. Try taking it with dinner and see if that helps over the next 2 weeks.\n\nIf the nausea persists, we may consider switching you to extended-release Metformin (Glucophage XR), which is better tolerated.\n\nBest,\nDr. Chen',
       past(4), past(4), 'general'],

      // Thread 2 — Lisinopril refill request
      [t2, IDS.userPt1, IDS.userP1, 'Refill Request - Lisinopril 10mg',
       'Hi,\n\nI need a refill for my Lisinopril 10mg. I have about 5 days of medication left. My pharmacy is Walgreens on Stevens Creek Blvd, San Jose.\n\nThank you,\nJohn Smith',
       past(2), null, 'prescription_refill'],

      // Thread 3 — John Smith lab results notification
      [t3, IDS.userP1, IDS.userPt1, 'Lab Results Available - Important Update',
       'Mr. Smith,\n\nYour recent lab results are now available in your portal. I wanted to highlight a few key findings:\n\n✓ HbA1c: 7.4% (improved from 7.8% - excellent progress!)\n✓ Fasting Glucose: 132 mg/dL (improving)\n⚠ LDL Cholesterol: 122 mg/dL (still above our target of <100 for diabetic patients)\n\nYour A1C improvement over the past 2 years has been remarkable - from 9.2% down to 7.4%. Please keep up the great work with diet and medication adherence.\n\nWe will discuss the LDL at your upcoming appointment and may consider increasing the Atorvastatin dose.\n\nDr. Chen',
       past(28), past(27), 'test_result'],

      // Thread 4 — Mary Johnson shortness of breath
      [t4, IDS.userPt2, IDS.userP2, 'Increased shortness of breath - urgent',
       'Dr. Williams,\n\nI\'ve been experiencing noticeably increased shortness of breath when climbing stairs over the past 3 days. I also noticed my ankles look more swollen than usual. Should I come in sooner than my scheduled appointment next week?\n\nMary Johnson',
       past(1), null, 'general'],

      // Thread 5 — Mary Johnson symptoms worsening response
      [t4, IDS.userP2, IDS.userPt2, 'Re: Increased shortness of breath - urgent',
       'Mrs. Johnson,\n\nThank you for reaching out. Given your history of heart failure, these symptoms are concerning and need attention promptly.\n\nPlease do the following:\n1. Weigh yourself first thing tomorrow morning\n2. If weight has increased more than 3 lbs since last week, go to the ED immediately\n3. Otherwise, come to the office tomorrow at 9 AM - I will have the team fit you in\n4. Limit fluids to 1.5L today\n\nIf you develop chest pain, severe shortness of breath at rest, or feel faint - call 911 immediately.\n\nDr. Williams',
       past(1), null, 'general'],

      // Thread 6 — Patricia Martinez thyroid questions
      [t5, IDS.userPt6, IDS.userP8, 'Thyroid medication - timing question',
       'Dr. Davis,\n\nI have a question about my Levothyroxine. I sometimes forget to take it before breakfast. Is it okay to take it with coffee? Also, can I take my calcium supplement at the same time?\n\nThanks,\nPatricia Martinez',
       past(3), past(2), 'general'],
      [t5, IDS.userP8, IDS.userPt6, 'Re: Thyroid medication - timing question',
       'Hi Patricia,\n\nGreat questions! For Levothyroxine to work properly:\n\n- Take it 30-60 minutes BEFORE breakfast on an empty stomach\n- Coffee (even black) can reduce absorption - wait 30 minutes after taking the pill\n- Do NOT take calcium supplements within 4 hours of Levothyroxine - it significantly reduces absorption\n\nIf you miss a morning dose, take it when you remember - but skip it if it\'s almost time for the next day\'s dose.\n\nYour TSH is finally in normal range (3.2) - let\'s keep it that way!\n\nDr. Davis',
       past(2), past(2), 'general'],

      // Thread 7 — Christopher Jones medication concern
      [t6, IDS.userPt7, IDS.userP7, 'Parkinson\'s medication wearing off earlier',
       'Dr. Anderson,\n\nI\'ve noticed my Carbidopa/Levodopa seems to wear off about 30 minutes earlier than it used to. My tremors return about 2.5 hours after taking it instead of the usual 3 hours. Is this something we should address?\n\nChristopher Jones',
       past(7), past(6), 'general'],
      [t6, IDS.userP7, IDS.userPt7, 'Re: Parkinson\'s medication wearing off earlier',
       'Mr. Jones,\n\nThank you for monitoring this closely - this is called "wearing off" phenomenon and is common as Parkinson\'s progresses. There are several ways we can address this:\n\n1. Reduce the interval between doses (e.g., every 3h instead of 4h)\n2. Add a COMT inhibitor like Entacapone to extend each dose\n3. Consider extended-release Carbidopa/Levodopa (Rytary)\n\nLet\'s discuss these options at your appointment next week. In the meantime, keep a diary of when you take your medication and when symptoms return - this will help us optimize your regimen.\n\nDr. Anderson',
       past(6), past(6), 'general'],

      // Thread 8 — Provider-to-provider about James Jackson
      [t7, IDS.userP1, IDS.userP11, 'Nephrology consult request - James Jackson',
       'Dr. Nguyen,\n\nI am requesting a nephrology consult for James Jackson (MRN000013), 82M with CKD Stage 3b (eGFR 38), T2DM, and hypertension. His creatinine has risen from 1.4 to 1.8 over the past 6 months.\n\nKey concerns: metformin dosing in CKD, NSAID avoidance, ACE inhibitor continuation. He is on Lisinopril 5mg, Insulin Glargine, and Atorvastatin.\n\nPlease advise on whether to continue Metformin at his current eGFR and any dietary recommendations.\n\nDr. Chen',
       past(10), past(9), 'general'],

      // Thread 9 — Barbara Lee medication question
      [t8, IDS.userPt10, IDS.userP1, 'Blood sugar readings higher than usual',
       'Dr. Chen,\n\nMy morning blood sugar readings have been running 180-220 this past week, which is higher than usual. I\'ve been eating the same things. Should I increase my insulin?\n\nBarbara Lee',
       past(8), past(7), 'general'],
      [t8, IDS.userP1, IDS.userPt10, 'Re: Blood sugar readings higher than usual',
       'Hello Mrs. Lee,\n\nThank you for monitoring your glucose so diligently. Readings of 180-220 in the morning are too high and need adjustment.\n\nDo NOT change your insulin dose on your own - there are safety considerations.\n\nI would like to:\n1. See you this week - please call to schedule a same-week appointment\n2. Order a new A1C\n3. Review your diet and activity diary\n\nIn the meantime:\n- Log every blood sugar reading with time and what you ate\n- Check your glucose before each meal too, not just morning\n- Call 911 if glucose exceeds 350 or you feel confused/very ill\n\nDr. Chen',
       past(7), past(7), 'general'],

      // Thread 10 — Daniel Young post-surgery question
      [t9, IDS.userPt21, IDS.userP5, 'ACL recovery question',
       'Dr. Kim,\n\nI had my ACL repair 3 weeks ago. My knee is still quite swollen and I have some clicking when I bend it past 90 degrees. Is this normal? Physical therapy starts next week.\n\nDaniel Young',
       past(4), past(3), 'general'],
      [t9, IDS.userP5, IDS.userPt21, 'Re: ACL recovery question',
       'Hi Daniel,\n\nSome swelling at 3 weeks is completely normal - it can take 6-12 weeks to fully resolve. The clicking you describe is usually scar tissue or fluid and is generally not concerning at this stage.\n\nHowever, please let me know immediately if you experience:\n- Sudden worsening of pain\n- Joint locking (cannot straighten the knee)\n- Significant warmth/redness\n- Fever\n\nStarting PT next week is perfect timing. Focus on range of motion and quad activation initially. Do not try to rush back to sports - the graft takes 9-12 months to fully mature.\n\nI\'ll see you at your 6-week follow-up. Keep icing 20 min 3x/day and keep it elevated when resting.\n\nDr. Kim',
       past(3), past(3), 'general'],

      // Thread 11 — Sandra Scott new medication concern
      [t10, IDS.userPt24, IDS.userP3, 'Starting Escitalopram - side effects question',
       'Dr. Rodriguez,\n\nI started the Escitalopram (Lexapro) 4 days ago. I\'ve been feeling more anxious and a bit nauseous. Is this normal? Should I keep taking it?\n\nSandra Scott',
       past(1), null, 'general'],
      [t10, IDS.userP3, IDS.userPt24, 'Re: Starting Escitalopram - side effects question',
       'Hi Sandra,\n\nYes, what you\'re experiencing is very common and expected in the first 1-2 weeks of starting an SSRI. The initial anxiety and nausea almost always improve as your body adjusts.\n\nPlease continue taking it - stopping early means you never get the benefit.\n\nTips for the first 2 weeks:\n- Take it with food if nausea is a problem\n- The anxious feeling usually peaks in the first week then improves significantly\n- Most people start feeling the full benefit after 4-6 weeks\n- Do not stop without talking to me first\n\nIf you develop any unusual thoughts, severe agitation, or feel unsafe, call me immediately or go to the ED.\n\nYou\'re doing the right thing seeking help. Stay with it!\n\nDr. Rodriguez',
       past(1), null, 'general'],
    ];
    for (const [threadId, senderId, recipientId, subject, body, sentAt, readAt, msgType] of messages) {
      await client.query(`
        INSERT INTO messages (thread_id, sender_id, recipient_id, subject, body, sent_at, read_at, message_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [threadId, senderId, recipientId, subject, body, sentAt, readAt, msgType]);
    }
    console.log('✅ Messages seeded (17)');

    // ========== CLINICAL NOTES ==========
    const notes = [
      [IDS.pat1, IDS.prov1, apptIds.a3, 'progress', `SUBJECTIVE:
Patient John Smith, 47M, presents for annual wellness exam and quarterly diabetes follow-up.
Chief Complaint: Routine wellness exam; medication review for DM2, HTN, hyperlipidemia.
Patient reports good medication compliance. Takes Metformin with dinner, Lisinopril mornings.
Occasional mild nausea with Metformin - improved since switching to dinner dosing.
Denies chest pain, shortness of breath, dizziness, visual changes. Home fasting glucose 120-145.
Exercise: Walking 20 min 4x/week. Diet: Following low-carb plan with some lapses on weekends.

OBJECTIVE:
Vitals: BP 128/82 mmHg (improved), HR 74 bpm, Temp 98.6°F, RR 16, O2 98%, Wt 193.2 lbs, Ht 70 in, BMI 27.7
General: Alert and oriented x4, well-appearing, no acute distress
HEENT: PERRL, no icterus, oropharynx clear
Cardiovascular: RRR, S1/S2 normal, no murmurs, rubs, or gallops
Respiratory: CTA bilaterally, no wheezes or crackles
Abdomen: Soft, non-tender, no hepatomegaly
Extremities: No pedal edema, peripheral pulses 2+ bilaterally
Neurological: Grossly intact, no focal deficits
Foot exam: Intact sensation to 10g monofilament bilaterally, no ulcers

Recent Labs reviewed: HbA1c 7.4% (trending down from 9.2% 2 years ago - excellent!), Fasting glucose 132, Total Chol 202, LDL 122, HDL 52, Creatinine 0.9

ASSESSMENT:
1. Type 2 Diabetes Mellitus - improving control, HbA1c 7.4%, trend toward target < 7%
2. Essential Hypertension - well-controlled on current regimen, BP 128/82
3. Hyperlipidemia - improving on Atorvastatin 40mg, LDL 122 (target < 100)

PLAN:
1. Continue Metformin 1000mg BID with meals
2. Continue Lisinopril 10mg daily - excellent BP response
3. Continue Atorvastatin 40mg at bedtime - consider increasing to 80mg next visit if LDL not at goal
4. Aspirin 81mg daily - continue for cardiovascular prevention
5. Labs: HbA1c, fasting glucose, CMP, lipid panel in 3 months
6. Referral to diabetes education program for refresher
7. Continue current exercise and diet modifications - reinforce lifestyle
8. Ophthalmology referral for annual diabetic eye exam
9. Return in 3 months for diabetes follow-up or sooner PRN`],

      [IDS.pat1, IDS.prov1, apptIds.a9, 'progress', `SUBJECTIVE:
Patient John Smith, 46M, annual wellness exam. 1-year follow-up.
Patient reports fatigue has improved. Compliance with all medications good.
HbA1c last measured 8.1% - patient motivated to improve. Started walking program.
BP readings at home 135-142/84-90. Takes all medications as prescribed.

OBJECTIVE:
Vitals: BP 138/88, HR 79, Temp 98.7°F, O2 97%, Wt 198.5 lbs, BMI 28.5
HbA1c (today's result): 8.1% - suboptimal but patient engaged in improvement
Lipid panel: Total Chol 222, LDL 148, HDL 46

ASSESSMENT:
1. DM2 - suboptimally controlled, HbA1c 8.1%, patient motivated
2. HTN - partially controlled, increase Lisinopril discussed
3. Hyperlipidemia - Atorvastatin dose increased last visit, recheck today

PLAN:
1. Continue Metformin 1000mg BID; ensure taking with meals
2. Increase Lisinopril dose if BP remains > 135/85 at follow-up
3. Increase Atorvastatin from 20mg to 40mg at bedtime
4. Diabetes self-management education referral
5. Labs in 3 months
6. RTC 3 months`],

      [IDS.pat2, IDS.prov1, apptIds.a15, 'progress', `SUBJECTIVE:
Patient Mary Johnson, 63F, with CAD and congestive heart failure, presents for EKG and stress test review.
Reports 2+ pillow orthopnea, increasing ankle edema over past 5 days, exertional dyspnea with one flight of stairs.
Weight increased 4 lbs since last visit (1 week ago). No chest pain or syncope.
Compliance with medications: good - taking Carvedilol, Furosemide, Spironolactone, Lisinopril, Warfarin, Digoxin.

OBJECTIVE:
Vitals: BP 145/92, HR 88, Temp 98.8°F, RR 18, O2 96%, Wt 160.2 lbs (up from 156 last week)
General: Alert, appears mildly distressed from dyspnea
Cardiovascular: S3 gallop present; JVD elevated ~2cm above clavicle; PMI displaced laterally
Pulmonary: Mild bibasilar crackles
Extremities: Bilateral pitting edema 2+ to mid-calf
EKG: Sinus rhythm with LBBB, rate 88 - unchanged from prior
BNP: 485 pg/mL (markedly elevated, up from 340 three months ago)
Troponin I: 0.02 (negative)

ASSESSMENT:
1. Acute-on-chronic systolic heart failure decompensation - volume overloaded
   - BNP 485, weight gain 4 lbs, orthopnea, bilateral lower extremity edema
2. Hypertension - suboptimally controlled at 145/92
3. Coronary artery disease - no acute ischemia (troponin negative)

PLAN:
1. URGENT: Increase Furosemide to 40mg BID x 7 days, then reduce to 40mg QD if improved
2. Daily weights - strict: call office if > 3 lb gain in 1 day or > 5 lbs in 1 week
3. Fluid restriction: 1.5L/day strictly
4. Sodium restriction: < 2g/day reinforced
5. Continue Carvedilol 25mg BID, Spironolactone 25mg, Lisinopril 5mg
6. Cardiology admission discussed - patient wishes to try outpatient management first
7. If no improvement in 48h, admit for IV diuresis
8. INR check in 1 week (Warfarin management)
9. Urgent follow-up in 1 week - sooner if worsening`],

      [IDS.pat6, IDS.prov1, apptIds.a38, 'progress', `SUBJECTIVE:
Patient Patricia Martinez, 43F, with hypothyroidism, presents for thyroid follow-up.
Chief Complaint: Thyroid medication dosage check, 3-month recheck.
Patient reports improved energy levels since dose increase to 75mcg. Less fatigue, improved mood.
Still some morning sluggishness. Hair loss improving. Bowel habits normalizing.
Taking Levothyroxine consistently on empty stomach 30 min before breakfast. No calcium/iron supplements.

OBJECTIVE:
Vitals: BP 110/72, HR 68, Temp 98.7°F, O2 99%, Wt 135.2 lbs, BMI 23.9
Thyroid: No goiter, no nodules palpated
Skin: Less dry than prior visit, hair loss significantly improved
Reflexes: Normal

Labs: TSH 3.2 mIU/L (normal range 0.4-4.0) - EXCELLENT response!
Free T4: 1.1 ng/dL (normal) - up from 0.7

ASSESSMENT:
1. Hypothyroidism - now well-controlled on Levothyroxine 75mcg
   - TSH normalized at 3.2 mIU/L - excellent response to dose increase
2. Symptoms improving - energy, mood, hair loss all trending better

PLAN:
1. Continue Levothyroxine 75mcg daily - do not change dose
2. Recheck TSH in 6 months for routine monitoring
3. If symptoms change (excessive sweating, palpitations, weight loss - signs of over-treatment)
   - Contact office immediately
4. New diagnosis: pre-diabetes (A1C 5.9% noted on metabolic panel)
   - Lifestyle counseling: diet and exercise to prevent progression
   - Repeat HbA1c in 6 months
5. Return in 6 months for routine follow-up`],

      [IDS.pat7, IDS.prov1, apptIds.a44, 'progress', `SUBJECTIVE:
Patient Christopher Jones, 68M, with Parkinson's Disease (diagnosed 2020), presents for quarterly motor assessment.
Chief Complaint: Medication wearing off earlier than expected - tremors returning at ~2.5h vs usual 3h.
Also notes some increase in morning stiffness lasting ~45 min. Falls: 0 in past month. No freezing episodes.
UPDRS-III score at last visit: 18. Current: 22 (mild worsening).
Caregiver (wife Margaret) present and confirms observations.

OBJECTIVE:
Vitals: BP 135/84, HR 72, Temp 98.4°F, O2 98%, Wt 178.0 lbs
Motor exam:
  - Rest tremor: Present R hand 2/4, L hand 1/4 (mildly worsened)
  - Rigidity: Moderate bilateral upper extremities (lead-pipe)
  - Bradykinesia: Present bilateral, hand dexterity mildly reduced
  - Gait: Mild shuffling, slightly reduced arm swing bilaterally
  - Postural stability: Retropulsion test - 2 steps to recover (mildly impaired)
UPDRS-III score today: 22 (mild worsening from 18)

ASSESSMENT:
1. Parkinson's Disease - mild motor worsening, wearing-off phenomenon emerging
   - UPDRS-III 22, increase from 18 at last visit
   - Classic wearing off: C/L effect lasting ~2.5h, should be ~4h
2. Motor fluctuations beginning - appropriate to address now
3. Essential Hypertension - BP 135/84, adequately controlled

PLAN:
1. Reduce Carbidopa/Levodopa dosing interval: change from Q6h to Q4h
   - Discuss with patient the balance of more frequent dosing vs. more stable levels
2. Consider adding Entacapone 200mg with each C/L dose to extend effect - discuss at next visit
3. Continue Rasagiline 1mg daily (MAO-B inhibitor)
4. Continue Lisinopril 20mg for BP
5. Physical therapy referral for gait training and fall prevention
6. Occupational therapy referral for fine motor assistance devices
7. Parkinson's Foundation caregiver support group information provided to Margaret
8. DBS (deep brain stimulation) discussed as future option if medications inadequate
9. Return in 3 months or sooner if falls or significant worsening`],

      [IDS.pat15, IDS.prov1, apptIds.a82, 'progress', `SUBJECTIVE:
Patient David Harris, 59M, with COPD (GOLD Stage 3) and paroxysmal AFib, presents for pulmonary function test results and management review.
Chief Complaint: COPD management; review of today's spirometry results.
Patient reports increased dyspnea on exertion - now symptomatic at 50 yards on flat ground (previously 100 yards).
Productive cough with yellow sputum in the mornings. No hemoptysis. 2 ED visits in past year for exacerbations.
Current medications: Tiotropium, Salmeterol/Fluticasone, Roflumilast, Rivaroxaban (AFib).
Smoking history: 35 pack-years, quit 8 years ago.
O2: Using supplemental O2 at night 2L/min (recently started).

OBJECTIVE:
Vitals: BP 130/82, HR 82 (irregular), Temp 98.2°F, RR 22, O2 92% on room air, Wt 182.0 lbs
General: Barrel chest, use of accessory muscles at rest
Pulmonary: Diffuse expiratory wheeze bilaterally, decreased breath sounds at bases
Cardiovascular: Irregular rhythm (known AFib)
Clubbing: Mild digital clubbing
PFTs today: FEV1 48% predicted (down from 52% last year), FEV1/FVC ratio 0.52, FVC 68%
- Progression from GOLD Stage 2 to Stage 3

ASSESSMENT:
1. COPD, GOLD Stage 3 (Severe) - disease progression, FEV1 declined from 52% to 48%
2. Paroxysmal Atrial Fibrillation - rate 82, managed with Rivaroxaban
3. Hypoxemia at rest - O2 sat 92% on room air

PLAN:
1. Continue Tiotropium 18mcg daily; continue Salmeterol/Fluticasone 50/500mcg BID
2. Continue Roflumilast 500mcg daily for exacerbation prevention
3. Add continuous home oxygen therapy 2L/min - update prescription to 24h use
4. Pulmonary rehabilitation referral - strongly recommended
5. COPD Action Plan updated - patient educated on early exacerbation recognition
6. Rescue pack: Prednisone 40mg x5d + Azithromycin Z-pack for next exacerbation
7. Annual influenza and Pneumovax/Prevnar 20 vaccines reviewed - up to date
8. Continue Rivaroxaban 20mg with dinner for AFib
9. Chest CT low-dose lung cancer screening - ordered (annual, smoking history)
10. Return in 3 months or immediately if O2 drops below 88% or increased sputum/dyspnea`],

      [IDS.pat13, IDS.prov1, apptIds.a75, 'progress', `SUBJECTIVE:
Patient James Jackson, 82M, complex geriatric patient with T2DM, HTN, CKD Stage 3b, and hyperlipidemia.
Chief Complaint: CKD management, medication review, diabetes management.
Patient accompanied by daughter Dorothy. Reports increased fatigue, decreased appetite past 2 weeks.
Urinary: Mild nocturia x2/night, no hematuria. Edema: trace ankle edema.
Denies chest pain, shortness of breath, falls in past month.
Medications: Insulin Glargine 30 units QHS, Lisinopril 5mg, Atorvastatin 20mg, Aspirin 81mg.

OBJECTIVE:
Vitals: BP 150/92, HR 70, Temp 98.4°F, RR 16, O2 96%, Wt 173.0 lbs
General: Elderly appearing, mildly fatigued, conversational and pleasant
Cardiovascular: RRR, S1/S2, no murmurs, trace bilateral pedal edema
Abdomen: Soft, non-tender, no bruits
Skin: Intact, no wounds or ulcers

Labs reviewed:
- Creatinine: 1.8 mg/dL (up from 1.4, 6 months ago)
- eGFR: 38 mL/min - Stage 3b CKD
- Potassium: 5.2 mEq/L (mildly elevated)
- HbA1c: 8.9% (worsening)
- Glucose: 198 mg/dL

ASSESSMENT:
1. CKD Stage 3b - progression, creatinine 1.8, eGFR 38
   - Hyperkalemia 5.2 - avoid further K-sparing agents
   - Metformin contraindicated at this eGFR - hold
2. Type 2 Diabetes - poorly controlled, HbA1c 8.9%
   - Insulin Glargine titration needed
   - Goal HbA1c: <8.5% in this frail elderly patient (less strict target)
3. Hypertension - suboptimally controlled at 150/92

PLAN:
1. HOLD Metformin - eGFR 38, contraindicated below 45
2. Increase Insulin Glargine from 30 to 34 units at bedtime
   - Blood sugar log review with daughter - target FBG 120-160
3. Nephrology referral - CKD progression, hyperkalemia management
4. Reduce Lisinopril to 2.5mg to limit hyperkalemia; re-check BMP in 2 weeks
5. Low potassium diet counseling - avoid bananas, oranges, potatoes
6. Low sodium diet reinforced
7. Continue Atorvastatin 20mg - do not increase due to CKD
8. Continue Aspirin 81mg - discuss risk/benefit given CKD bleeding risk
9. Dietitian referral for renal and diabetic diet
10. Home health aide for medication management - discussed with daughter
11. BMP, HbA1c, UA, lipid panel in 4 weeks
12. Return 4 weeks`],
    ];
    for (const [patId, provId, apptId, noteType, content] of notes) {
      await client.query(
        'INSERT INTO clinical_notes (patient_id, provider_id, appointment_id, note_type, content) VALUES ($1,$2,$3,$4,$5)',
        [patId, provId, apptId, noteType, content]
      );
    }
    console.log('✅ Clinical notes seeded (7)');

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
