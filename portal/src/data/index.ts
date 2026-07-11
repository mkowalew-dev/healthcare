export const COMPANY = {
  name: 'CareConnect Health Systems',
  ticker: 'CCHX',
  tagline: 'Delivering compassionate care, powered by innovation.',
  mission: 'Together, we heal communities — one patient at a time.',
  employees: 23_400,
  facilities: 45,
  founded: 1987,
};

// ── Stock data (CCHX · Apr 14 → Jul 11, 2026) ──────────────────────────────
export const stockData = [
  { date: 'Apr 14', price: 44.52 }, { date: 'Apr 15', price: 44.81 },
  { date: 'Apr 16', price: 44.63 }, { date: 'Apr 17', price: 45.10 },
  { date: 'Apr 20', price: 45.34 }, { date: 'Apr 21', price: 45.07 },
  { date: 'Apr 22', price: 45.56 }, { date: 'Apr 23', price: 45.88 },
  { date: 'Apr 24', price: 45.62 }, { date: 'Apr 27', price: 45.91 },
  { date: 'Apr 28', price: 46.15 }, { date: 'Apr 29', price: 45.98 },
  { date: 'Apr 30', price: 46.34 }, { date: 'May 01', price: 46.51 },
  { date: 'May 04', price: 46.28 }, { date: 'May 05', price: 46.73 },
  { date: 'May 06', price: 46.95 }, { date: 'May 07', price: 47.18 },
  { date: 'May 08', price: 46.87 }, { date: 'May 11', price: 47.23 },
  { date: 'May 12', price: 47.56 }, { date: 'May 13', price: 47.38 },
  { date: 'May 14', price: 47.82 }, { date: 'May 15', price: 48.01 },
  { date: 'May 18', price: 47.76 }, { date: 'May 19', price: 47.45 },
  { date: 'May 20', price: 47.89 }, { date: 'May 21', price: 48.12 },
  { date: 'May 22', price: 48.34 }, { date: 'May 27', price: 48.07 },
  { date: 'May 28', price: 48.45 }, { date: 'May 29', price: 48.23 },
  { date: 'Jun 01', price: 48.67 }, { date: 'Jun 02', price: 48.89 },
  { date: 'Jun 03', price: 48.56 }, { date: 'Jun 04', price: 48.78 },
  { date: 'Jun 05', price: 49.12 }, { date: 'Jun 08', price: 48.87 },
  { date: 'Jun 09', price: 49.23 }, { date: 'Jun 10', price: 49.45 },
  { date: 'Jun 11', price: 49.18 }, { date: 'Jun 12', price: 49.56 },
  { date: 'Jun 15', price: 49.34 }, { date: 'Jun 16', price: 49.67 },
  { date: 'Jun 17', price: 49.89 }, { date: 'Jun 18', price: 49.56 },
  { date: 'Jun 19', price: 49.78 }, { date: 'Jun 22', price: 49.45 },
  { date: 'Jun 23', price: 49.67 }, { date: 'Jun 24', price: 49.89 },
  { date: 'Jun 25', price: 50.12 }, { date: 'Jun 26', price: 49.87 },
  { date: 'Jun 29', price: 50.23 }, { date: 'Jun 30', price: 50.45 },
  { date: 'Jul 01', price: 50.12 }, { date: 'Jul 02', price: 49.87 },
  { date: 'Jul 06', price: 50.34 }, { date: 'Jul 07', price: 50.56 },
  { date: 'Jul 08', price: 50.23 }, { date: 'Jul 09', price: 50.67 },
  { date: 'Jul 10', price: 50.45 }, { date: 'Jul 11', price: 49.87 },
];

export const stockSummary = {
  current: 49.87,
  change: 1.23,
  changePct: 2.53,
  high52: 52.44,
  low52:  38.21,
  volume: '1.57M',
  mktCap: '8.2B',
};

// ── Revenue by quarter ──────────────────────────────────────────────────────
export const revenueData = [
  { quarter: 'Q3\'24', revenue: 468, budget: 460 },
  { quarter: 'Q4\'24', revenue: 521, budget: 510 },
  { quarter: 'Q1\'25', revenue: 489, budget: 495 },
  { quarter: 'Q2\'25', revenue: 534, budget: 525 },
  { quarter: 'Q3\'25', revenue: 512, budget: 520 },
  { quarter: 'Q4\'25', revenue: 578, budget: 560 },
  { quarter: 'Q1\'26', revenue: 524, budget: 530 },
  { quarter: 'Q2\'26', revenue: 556, budget: 545 },
];

// ── Patient satisfaction trend (12 months) ──────────────────────────────────
export const satisfactionData = [
  { month: 'Aug', score: 92.1 }, { month: 'Sep', score: 91.8 },
  { month: 'Oct', score: 92.4 }, { month: 'Nov', score: 92.9 },
  { month: 'Dec', score: 93.2 }, { month: 'Jan', score: 92.8 },
  { month: 'Feb', score: 93.1 }, { month: 'Mar', score: 93.5 },
  { month: 'Apr', score: 93.9 }, { month: 'May', score: 94.1 },
  { month: 'Jun', score: 94.2 }, { month: 'Jul', score: 94.2 },
];

// ── Departmental headcount ──────────────────────────────────────────────────
export const headcountData = [
  { dept: 'Clinical',   count: 11800 },
  { dept: 'Operations', count: 4600  },
  { dept: 'Nursing',    count: 4200  },
  { dept: 'IT',         count: 1400  },
  { dept: 'Finance',    count: 620   },
  { dept: 'HR',         count: 380   },
  { dept: 'Other',      count: 400   },
];

// ── KPI summary ─────────────────────────────────────────────────────────────
export const kpis = {
  revenueYTD:      '1.08B',
  revenueGrowth:   8.3,
  satisfaction:    94.2,
  satisfactionDelta: 1.8,
  operatingMargin: 12.4,
  bedsOccupied:    78,
  patientsQ2:      '1.24M',
  employeeSatisfaction: 87,
};

// ── Announcements ───────────────────────────────────────────────────────────
export interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
  category: 'Corporate' | 'HR' | 'IT' | 'Clinical' | 'Facilities';
  priority: 'high' | 'normal' | 'low';
  author: string;
  pinned?: boolean;
}

export const announcements: Announcement[] = [
  {
    id: 'a1',
    title: 'Q2 2026 Earnings Call — July 15',
    body: 'CareConnect will host its Q2 2026 earnings call on Tuesday, July 15 at 10:00 AM CT. All employees are invited to listen via the investor relations webcast link. Q2 results will be released before market open. Management will discuss Q2 performance and updated full-year guidance.',
    date: 'Jul 11, 2026',
    category: 'Corporate',
    priority: 'high',
    author: 'Investor Relations',
    pinned: true,
  },
  {
    id: 'a2',
    title: 'CareConnect 3.0 EHR Launch — August 1',
    body: 'The new CareConnect 3.0 Electronic Health Record system goes live August 1 across all 45 facilities. Training sessions run July 14–25. All clinical staff must complete the mandatory 2-hour online module before July 28. IT Help Desk will have extended hours (6 AM–10 PM) during the first two weeks post-launch.',
    date: 'Jul 10, 2026',
    category: 'IT',
    priority: 'high',
    author: 'Dr. Raj Patel, CIO',
    pinned: true,
  },
  {
    id: 'a3',
    title: 'Annual Leadership Town Hall — July 22',
    body: 'CEO Jennifer Walsh and the executive leadership team will host our Q2 All-Hands Town Hall on July 22 at 2:00 PM CT. Topics include Q2 performance results, CareConnect 3.0 rollout update, 2026 strategic priorities, and an open Q&A session. Virtual attendance via Teams is available for field staff.',
    date: 'Jul 9, 2026',
    category: 'Corporate',
    priority: 'high',
    author: 'Office of the CEO',
  },
  {
    id: 'a4',
    title: 'Summer Wellness Program — Starts July 14',
    body: '2026 Employee Wellness Program launches July 14. Highlights include on-site fitness challenges, subsidized gym memberships ($40/mo reimbursement), mental health webinar series, and a walking challenge with prizes for top teams. Enroll through the Benefits portal by July 13 to participate in Week 1.',
    date: 'Jul 8, 2026',
    category: 'HR',
    priority: 'normal',
    author: 'People & Culture',
  },
  {
    id: 'a5',
    title: 'Hurricane Season Preparedness — Gulf Coast Facilities',
    body: 'With hurricane season underway, all Gulf Coast facility administrators must complete the 2026 Emergency Operations Plan review by July 18. Updated evacuation protocols and generator backup procedures have been distributed to facility managers. Questions: contact Risk Management at riskmanagement@careconnect.health.',
    date: 'Jul 7, 2026',
    category: 'Facilities',
    priority: 'normal',
    author: 'Risk Management',
  },
  {
    id: 'a6',
    title: 'Open Enrollment for 2026–27 Benefits — Aug 1–15',
    body: 'Annual benefits open enrollment opens August 1 and closes August 15 at 11:59 PM. This year features a new High-Deductible Health Plan option, increased FSA limits ($3,200), and an expanded dental network. Enrollment guides are available in the Benefits portal. Attend a virtual Benefits Fair on July 30 at noon.',
    date: 'Jul 6, 2026',
    category: 'HR',
    priority: 'normal',
    author: 'Benefits Administration',
  },
  {
    id: 'a7',
    title: 'New Mandatory HIPAA Refresher Training Due Aug 31',
    body: 'Per our compliance program, all staff must complete the annual HIPAA Refresher Training by August 31. The updated 45-minute module covers AI tools and PHI, telehealth privacy requirements, and updated breach notification procedures. Access via the Learning Management System. Non-completion will result in system access suspension.',
    date: 'Jul 3, 2026',
    category: 'Clinical',
    priority: 'normal',
    author: 'Compliance & Privacy',
  },
  {
    id: 'a8',
    title: 'Parking Garage B Closure — Memorial Campus',
    body: 'Parking Garage B at the Memphis Memorial Campus will be closed July 14–18 for annual safety inspection and resurfacing. Overflow parking is available in Lot D (shuttle service every 15 min, 6 AM–8 PM). Patient visitor parking is not affected. Contact Facilities at ext. 5500 with questions.',
    date: 'Jul 2, 2026',
    category: 'Facilities',
    priority: 'low',
    author: 'Facilities Management',
  },
];

// ── Company Stories ─────────────────────────────────────────────────────────
export interface Story {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  date: string;
  category: 'Culture' | 'Clinical' | 'Innovation' | 'Community' | 'Awards';
  readMinutes: number;
  author: string;
  authorTitle: string;
  imageColor: string;
  featured?: boolean;
}

export const stories: Story[] = [
  {
    id: 's1',
    title: 'How CareConnect\'s Telemedicine Platform Is Transforming Rural Healthcare',
    excerpt: 'Patients in underserved communities now receive specialist care without traveling hundreds of miles — here\'s how our virtual care initiative made it possible.',
    body: 'When Maria Gonzalez in rural Mississippi needed to see a cardiologist, the nearest one was a four-hour drive away. Today, she connects with Dr. Samuel Park at our Memphis Heart Center from her living room — a reality made possible by CareConnect\'s Telehealth First initiative launched in Q3 2025. The program has served 84,000 unique rural patients, with specialist consultation wait times dropping from 47 days to 6 days on average.',
    date: 'Jul 9, 2026',
    category: 'Innovation',
    readMinutes: 5,
    author: 'Rebecca Torres',
    authorTitle: 'Chief Digital Officer',
    imageColor: '#049FD9',
    featured: true,
  },
  {
    id: 's2',
    title: 'Dr. Sarah Chen Marks 25 Years of Service — A Legacy of Compassion',
    excerpt: 'From her first shift as a medical resident to leading our pediatric oncology program, Dr. Chen\'s journey is CareConnect at its very best.',
    body: 'Dr. Sarah Chen joined CareConnect in July 2001, fresh from her residency at Johns Hopkins. In 25 years, she has treated over 12,000 pediatric cancer patients and built the Pediatric Oncology Center from a 4-bed unit to a nationally recognized 48-bed facility. "The families are why I come in every day," she says. "Watching children go from diagnosis to remission — there\'s nothing more powerful."',
    date: 'Jul 7, 2026',
    category: 'Culture',
    readMinutes: 7,
    author: 'HR Communications',
    authorTitle: 'People & Culture',
    imageColor: '#6EBE4A',
  },
  {
    id: 's3',
    title: 'CareConnect Achieves HIMSS Stage 7 — Joining the Top 6% Nationally',
    excerpt: 'Our Electronic Medical Record program has reached the highest possible HIMSS EMRAM designation, a milestone fewer than 6% of US hospitals achieve.',
    body: 'After three years of rigorous process improvement, CareConnect received Stage 7 designation from HIMSS — the gold standard for healthcare IT maturity. The designation validates our paperless workflows, real-time clinical analytics, and closed-loop medication administration across all 45 facilities. CIO Dr. Raj Patel called it "a testament to the 350 IT professionals and thousands of clinical champions who drove this transformation."',
    date: 'Jul 3, 2026',
    category: 'Awards',
    readMinutes: 4,
    author: 'Dr. Raj Patel',
    authorTitle: 'Chief Information Officer',
    imageColor: '#1D4289',
  },
  {
    id: 's4',
    title: 'New Children\'s Surgical Wing Opens at Memphis Memorial — A $120M Investment',
    excerpt: 'The 80,000 sq ft wing adds 12 pediatric surgical suites, a family resource center, and a dedicated pediatric ICU to Memphis Memorial Campus.',
    body: 'After 28 months of construction, the Laura and James Whitfield Children\'s Surgical Wing opened its doors July 1 at Memphis Memorial. The $120 million facility was funded through a landmark philanthropic campaign and represents our single largest capital investment in pediatric care. "This isn\'t just a building," said President Michael Okonkwo. "This is a promise to every family in the Mid-South that world-class pediatric care is right here at home."',
    date: 'Jun 30, 2026',
    category: 'Community',
    readMinutes: 6,
    author: 'Marketing & Communications',
    authorTitle: 'Corporate Communications',
    imageColor: '#FBAB18',
  },
  {
    id: 's5',
    title: 'Innovation Lab\'s AI Diagnostic Tool Reduces Sepsis Mortality by 34%',
    excerpt: 'A machine learning model developed in our Memphis Innovation Lab is now live in 12 ICUs, identifying sepsis risk an average of 6 hours earlier than traditional screening.',
    body: 'The SepsisGuard AI model — built by a cross-functional team of data scientists, intensivists, and nurses — analyzes 47 real-time patient variables to flag early sepsis risk. In a 14-month clinical trial across 12 ICUs, early intervention triggered by SepsisGuard resulted in a 34% reduction in sepsis mortality and a 2.1-day average reduction in ICU length of stay. The tool is now being considered for nationwide rollout pending regulatory review.',
    date: 'Jun 24, 2026',
    category: 'Innovation',
    readMinutes: 8,
    author: 'Innovation Lab Team',
    authorTitle: 'Data Science & Clinical Informatics',
    imageColor: '#049FD9',
  },
  {
    id: 's6',
    title: 'CareConnect Foundation Raises $5.2M for Community Health Clinics',
    excerpt: 'The annual charity gala and a record-breaking matching campaign together raised $5.2 million to expand free care in medically underserved communities.',
    body: 'The CareConnect Foundation\'s 2026 Annual Gala, held June 14 at the Memphis Peabody, raised $3.1 million — surpassing last year\'s record by 23%. A subsequent two-week matching campaign from the Board of Trustees added another $2.1 million. Funds will expand operations at 8 community health clinics serving uninsured and underinsured patients. "Healthcare is a right, not a privilege," said Foundation Executive Director Carla Moore. "These funds directly translate to lives changed."',
    date: 'Jun 18, 2026',
    category: 'Community',
    readMinutes: 5,
    author: 'CareConnect Foundation',
    authorTitle: 'Foundation & Philanthropy',
    imageColor: '#6EBE4A',
  },
  {
    id: 's7',
    title: 'Inside CareConnect\'s Brand-New Simulation Training Center',
    excerpt: 'A $14M investment in high-fidelity mannequins, virtual reality surgical suites, and standardized patient scenarios is revolutionizing how we train 2,000+ clinical staff each year.',
    body: 'The Deborah B. Harris Clinical Simulation Center opened May 15 at our Nashville campus. Featuring 8 fully-equipped simulation suites, 4 VR surgical training stations, and 12 standardized patient rooms, the center can train 40 providers simultaneously. "We practice the hard cases so our patients never have to be the first time," said Director of Clinical Education Dr. Marcus Webb. Early data shows a 28% improvement in clinical skill scores for nurses trained at the new center.',
    date: 'Jun 10, 2026',
    category: 'Culture',
    readMinutes: 6,
    author: 'Dr. Marcus Webb',
    authorTitle: 'Director, Clinical Education',
    imageColor: '#1D4289',
  },
  {
    id: 's8',
    title: 'CareConnect Named One of America\'s Most Admired Companies — Fortune 2026',
    excerpt: 'For the third consecutive year, CareConnect ranks in Fortune\'s top 10 for Most Admired Companies in the healthcare sector.',
    body: 'Fortune magazine has again recognized CareConnect Health Systems as one of the Most Admired Companies in America, ranking #7 in healthcare for 2026. The ranking is based on peer survey scores across innovation, financial soundness, talent management, social responsibility, and quality of management. CEO Jennifer Walsh credited "23,400 employees who show up every day and make the impossible possible for our patients." This marks the organization\'s third consecutive top-10 placement.',
    date: 'May 28, 2026',
    category: 'Awards',
    readMinutes: 3,
    author: 'Corporate Communications',
    authorTitle: 'Marketing & Communications',
    imageColor: '#FBAB18',
  },
];

// ── Events ──────────────────────────────────────────────────────────────────
export interface PortalEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  category: 'Corporate' | 'Training' | 'HR' | 'Clinical' | 'Innovation' | 'Social';
  virtual?: boolean;
  rsvpRequired?: boolean;
  spots?: number;
}

export const events: PortalEvent[] = [
  {
    id: 'e1',
    title: 'New Employee Orientation',
    description: 'Welcome onboarding for July cohort. Includes facility tour, badge activation, benefits overview, and IT setup. Lunch provided.',
    date: 'Jul 14, 2026',
    time: '8:00 AM – 4:00 PM CT',
    location: 'Memphis HQ — Conference Center A',
    category: 'HR',
    rsvpRequired: true,
    spots: 24,
  },
  {
    id: 'e2',
    title: 'Q2 2026 Earnings Call',
    description: 'Public earnings call hosted by CEO Jennifer Walsh and CFO David Kim. Listen via investor relations webcast. All employees welcome.',
    date: 'Jul 15, 2026',
    time: '10:00 AM CT',
    location: 'Webcast — investor.careconnect.health',
    category: 'Corporate',
    virtual: true,
  },
  {
    id: 'e3',
    title: 'CareConnect 3.0 EHR Training — Clinical Track',
    description: 'Mandatory 2-hour hands-on training for clinical staff on new EHR workflows. Must be completed before July 28. Multiple sessions available.',
    date: 'Jul 16–25, 2026',
    time: 'Multiple sessions daily',
    location: 'LMS Online + Simulation Center (Nashville)',
    category: 'Training',
    rsvpRequired: true,
    virtual: true,
  },
  {
    id: 'e4',
    title: 'Annual Leadership Town Hall — Q2 All-Hands',
    description: 'CEO and executive team present Q2 results, strategic updates, and field questions from employees across all facilities. Q&A via Slido.',
    date: 'Jul 22, 2026',
    time: '2:00 – 3:30 PM CT',
    location: 'Memphis Grand Atrium + Teams Live',
    category: 'Corporate',
    virtual: true,
  },
  {
    id: 'e5',
    title: 'Virtual Benefits Fair — 2026–27 Open Enrollment',
    description: 'Meet with benefits vendors (medical, dental, vision, 401k, FSA, life insurance). Ask questions and compare plan options before enrollment opens Aug 1.',
    date: 'Jul 30, 2026',
    time: '12:00 – 1:30 PM CT',
    location: 'Microsoft Teams — link in Benefits portal',
    category: 'HR',
    virtual: true,
    rsvpRequired: false,
  },
  {
    id: 'e6',
    title: 'Benefits Open Enrollment Opens',
    description: 'Annual benefits enrollment period begins. Choose or change your medical, dental, vision, FSA, HSA, and supplemental insurance selections by August 15.',
    date: 'Aug 1, 2026',
    time: 'All day',
    location: 'Benefits Portal — mybenefits.careconnect.health',
    category: 'HR',
    virtual: true,
  },
  {
    id: 'e7',
    title: 'CareConnect Innovation Summit 2026',
    description: 'Two-day internal summit showcasing AI, digital health, and process innovation projects from across the organization. Demo day, keynotes, and networking.',
    date: 'Aug 12–13, 2026',
    time: '8:00 AM – 5:00 PM CT',
    location: 'Memphis Convention Center + Virtual',
    category: 'Innovation',
    virtual: true,
    rsvpRequired: true,
    spots: 400,
  },
  {
    id: 'e8',
    title: 'Annual Employee Appreciation Day',
    description: 'Celebrate our team with facility-hosted events including catered lunch, recognition awards, team activities, and department celebrations. No meetings 11 AM–2 PM.',
    date: 'Aug 29, 2026',
    time: '11:00 AM – 2:00 PM (facility events vary)',
    location: 'All CareConnect Facilities',
    category: 'Social',
  },
];

// ── Employee Directory ──────────────────────────────────────────────────────
export interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  location: string;
  initials: string;
  color: string;
  bio?: string;
  spotlight?: boolean;
}

export const employees: Employee[] = [
  { id: 'emp1', name: 'Jennifer Walsh', title: 'Chief Executive Officer', department: 'Executive', email: 'j.walsh@careconnect.health', phone: '(901) 555-0101', location: 'Memphis, TN', initials: 'JW', color: '#1D4289', bio: 'Jennifer has led CareConnect since 2019, driving a 40% expansion in service capacity and pioneering the Telehealth First strategy.', spotlight: true },
  { id: 'emp2', name: 'David Kim', title: 'Chief Financial Officer', department: 'Finance', email: 'd.kim@careconnect.health', phone: '(901) 555-0102', location: 'Memphis, TN', initials: 'DK', color: '#049FD9' },
  { id: 'emp3', name: 'Dr. Patricia Williams', title: 'Chief Medical Officer', department: 'Clinical', email: 'p.williams@careconnect.health', phone: '(901) 555-0103', location: 'Memphis, TN', initials: 'PW', color: '#1D4289', bio: 'Dr. Williams leads clinical quality and patient safety strategy for all 45 CareConnect facilities. Board-certified in Internal Medicine.', spotlight: true },
  { id: 'emp4', name: 'Dr. Raj Patel', title: 'Chief Information Officer', department: 'IT', email: 'r.patel@careconnect.health', phone: '(901) 555-0104', location: 'Memphis, TN', initials: 'RP', color: '#049FD9' },
  { id: 'emp5', name: 'Rebecca Torres', title: 'Chief Digital Officer', department: 'Innovation', email: 'r.torres@careconnect.health', phone: '(901) 555-0105', location: 'Nashville, TN', initials: 'RT', color: '#6EBE4A' },
  { id: 'emp6', name: 'James Rodriguez', title: 'VP of Operations', department: 'Operations', email: 'j.rodriguez@careconnect.health', phone: '(901) 555-0106', location: 'Memphis, TN', initials: 'JR', color: '#049FD9', bio: 'James oversees day-to-day operations across all facilities and was recently named CareConnect\'s 2026 Innovation Leader Award recipient.', spotlight: true },
  { id: 'emp7', name: 'Anika Patel', title: 'Director of Nursing Excellence', department: 'Clinical', email: 'a.patel@careconnect.health', phone: '(901) 555-0107', location: 'Memphis, TN', initials: 'AP', color: '#6EBE4A', bio: '2026 Nurse of the Year. Anika led implementation of the Bedside Shift Report program, improving patient satisfaction scores by 3.4 points.', spotlight: true },
  { id: 'emp8', name: 'Marcus Webb', title: 'Director, Clinical Education', department: 'Clinical', email: 'm.webb@careconnect.health', phone: '(901) 555-0108', location: 'Nashville, TN', initials: 'MW', color: '#FBAB18' },
  { id: 'emp9', name: 'Carla Moore', title: 'Executive Director, Foundation', department: 'Foundation', email: 'c.moore@careconnect.health', phone: '(901) 555-0109', location: 'Memphis, TN', initials: 'CM', color: '#049FD9' },
  { id: 'emp10', name: 'Dr. Sarah Chen', title: 'Director, Pediatric Oncology', department: 'Clinical', email: 's.chen@careconnect.health', phone: '(901) 555-0110', location: 'Memphis, TN', initials: 'SC', color: '#1D4289' },
  { id: 'emp11', name: 'Thomas Grant', title: 'VP, Human Resources', department: 'HR', email: 't.grant@careconnect.health', phone: '(901) 555-0111', location: 'Memphis, TN', initials: 'TG', color: '#6EBE4A' },
  { id: 'emp12', name: 'Lisa Park', title: 'Director, Risk Management', department: 'Legal', email: 'l.park@careconnect.health', phone: '(901) 555-0112', location: 'Atlanta, GA', initials: 'LP', color: '#FBAB18' },
  { id: 'emp13', name: 'Kevin Osei', title: 'Senior Data Scientist', department: 'Innovation', email: 'k.osei@careconnect.health', phone: '(901) 555-0113', location: 'Nashville, TN', initials: 'KO', color: '#049FD9' },
  { id: 'emp14', name: 'Maria Santos', title: 'Compliance Officer', department: 'Legal', email: 'm.santos@careconnect.health', phone: '(901) 555-0114', location: 'Memphis, TN', initials: 'MS', color: '#6EBE4A' },
  { id: 'emp15', name: 'Derek Johnson', title: 'Facilities Director', department: 'Operations', email: 'd.johnson@careconnect.health', phone: '(901) 555-0115', location: 'Memphis, TN', initials: 'DJ', color: '#1D4289' },
  { id: 'emp16', name: 'Priya Sharma', title: 'Marketing Director', department: 'Marketing', email: 'p.sharma@careconnect.health', phone: '(901) 555-0116', location: 'Nashville, TN', initials: 'PS', color: '#FBAB18' },
  { id: 'emp17', name: 'Robert Kim', title: 'IT Security Manager', department: 'IT', email: 'r.kim@careconnect.health', phone: '(901) 555-0117', location: 'Memphis, TN', initials: 'RK', color: '#049FD9' },
  { id: 'emp18', name: 'Angela Davis', title: 'Benefits Manager', department: 'HR', email: 'a.davis@careconnect.health', phone: '(901) 555-0118', location: 'Memphis, TN', initials: 'AD', color: '#6EBE4A' },
  { id: 'emp19', name: 'Samuel Park', title: 'Director, Cardiology — Telehealth', department: 'Clinical', email: 's.park@careconnect.health', phone: '(901) 555-0119', location: 'Memphis, TN', initials: 'SP', color: '#1D4289' },
  { id: 'emp20', name: 'Natalie Wu', title: 'Financial Analyst', department: 'Finance', email: 'n.wu@careconnect.health', phone: '(901) 555-0120', location: 'Atlanta, GA', initials: 'NW', color: '#FBAB18' },
];

// ── Resources ───────────────────────────────────────────────────────────────
export interface Resource {
  id: string;
  name: string;
  type: 'PDF' | 'DOCX' | 'XLSX' | 'PPTX' | 'LINK';
  size?: string;
  updated: string;
  url?: string;
}

export interface ResourceCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  items: Resource[];
}

export const resourceCategories: ResourceCategory[] = [
  {
    id: 'hr',
    label: 'Human Resources',
    icon: 'Users',
    color: '#049FD9',
    items: [
      { id: 'r1',  name: '2026–27 Benefits Guide',           type: 'PDF',  size: '4.2 MB', updated: 'Jul 1, 2026' },
      { id: 'r2',  name: 'PTO & Leave Policy',               type: 'PDF',  size: '1.1 MB', updated: 'Jan 15, 2026' },
      { id: 'r3',  name: 'Code of Business Conduct',         type: 'PDF',  size: '2.8 MB', updated: 'Mar 1, 2026' },
      { id: 'r4',  name: 'Performance Review Template',      type: 'DOCX', size: '540 KB', updated: 'Apr 1, 2026' },
      { id: 'r5',  name: '2026 Org Chart',                   type: 'PDF',  size: '1.6 MB', updated: 'Jul 1, 2026' },
      { id: 'r6',  name: 'New Hire Checklist',               type: 'DOCX', size: '320 KB', updated: 'May 1, 2026' },
    ],
  },
  {
    id: 'it',
    label: 'IT & Technology',
    icon: 'Monitor',
    color: '#1D4289',
    items: [
      { id: 'r7',  name: 'VPN Setup Guide',                  type: 'PDF',  size: '2.1 MB', updated: 'Jun 15, 2026' },
      { id: 'r8',  name: 'Approved Software Catalog',        type: 'PDF',  size: '3.4 MB', updated: 'Jul 1, 2026' },
      { id: 'r9',  name: 'IT Security Policy 2026',          type: 'PDF',  size: '1.8 MB', updated: 'Jan 1, 2026' },
      { id: 'r10', name: 'CareConnect 3.0 EHR Quick Start',  type: 'PDF',  size: '5.6 MB', updated: 'Jul 10, 2026' },
      { id: 'r11', name: 'Device Request Form',              type: 'DOCX', size: '280 KB', updated: 'Jan 1, 2026' },
    ],
  },
  {
    id: 'clinical',
    label: 'Clinical Resources',
    icon: 'Stethoscope',
    color: '#6EBE4A',
    items: [
      { id: 'r12', name: 'Clinical Protocols Handbook 2026',         type: 'PDF',  size: '12.4 MB', updated: 'Jun 1, 2026' },
      { id: 'r13', name: 'Sepsis Management Protocol (SepsisGuard)', type: 'PDF',  size: '2.3 MB',  updated: 'Jul 5, 2026' },
      { id: 'r14', name: 'Medication Safety Training Deck',          type: 'PPTX', size: '8.1 MB',  updated: 'May 15, 2026' },
      { id: 'r15', name: 'Continuing Education Calendar Q3',         type: 'PDF',  size: '900 KB',  updated: 'Jul 1, 2026' },
      { id: 'r16', name: 'Credentialing & Privileging Guide',        type: 'PDF',  size: '3.2 MB',  updated: 'Mar 1, 2026' },
    ],
  },
  {
    id: 'compliance',
    label: 'Legal & Compliance',
    icon: 'Shield',
    color: '#FBAB18',
    items: [
      { id: 'r17', name: 'HIPAA Privacy Policy 2026',         type: 'PDF',  size: '2.7 MB', updated: 'Jan 1, 2026' },
      { id: 'r18', name: 'HIPAA Annual Refresher Training',   type: 'LINK', updated: 'Jul 3, 2026' },
      { id: 'r19', name: 'Incident Reporting Procedures',     type: 'PDF',  size: '1.4 MB', updated: 'Feb 1, 2026' },
      { id: 'r20', name: '2026 Compliance Program Summary',   type: 'PDF',  size: '3.6 MB', updated: 'Jan 1, 2026' },
      { id: 'r21', name: 'Whistleblower Policy',              type: 'PDF',  size: '980 KB', updated: 'Jan 1, 2026' },
    ],
  },
];

// ── Ticker items ─────────────────────────────────────────────────────────────
export const tickerItems = [
  'CCHX $49.87 ▲ +2.53%',
  'Q2 Earnings Call — Jul 15 @ 10:00 AM CT',
  'Town Hall — Jul 22 @ 2:00 PM CT',
  'EHR 3.0 Launch — Aug 1',
  'Benefits Enrollment — Aug 1–15',
  'CareConnect Named Fortune Most Admired #7',
  'Patient Satisfaction: 94.2% — All-time high',
  'Innovation Summit — Aug 12–13, Memphis',
];
