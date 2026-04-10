import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format, parseISO, differenceInYears } from 'date-fns';
import { patientsApi, labsApi, medicationsApi, appointmentsApi, notesApi, labOrderApi, eprescribeApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import {
  LabStatusBadge, MedStatusBadge, AppointmentStatusBadge, AllergySeverityBadge,
} from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import {
  ArrowLeft, AlertTriangle, Pill, FlaskConical, Calendar,
  FileText, Activity, Heart, Stethoscope, Plus, CheckCircle, Send,
} from 'lucide-react';

const COMMON_MEDICATIONS = [
  { name: 'Metformin HCl', genericName: 'metformin', dosageForm: 'Tablet', strength: '500mg', sig: 'Take 1 tablet by mouth twice daily with meals', ndcCode: '00093-1043-01', daysSupply: 90, refills: 3 },
  { name: 'Lisinopril', genericName: 'lisinopril', dosageForm: 'Tablet', strength: '10mg', sig: 'Take 1 tablet by mouth once daily', ndcCode: '00093-7096-01', daysSupply: 90, refills: 3 },
  { name: 'Atorvastatin', genericName: 'atorvastatin calcium', dosageForm: 'Tablet', strength: '40mg', sig: 'Take 1 tablet by mouth once daily at bedtime', ndcCode: '00071-0157-23', daysSupply: 90, refills: 3 },
  { name: 'Amlodipine', genericName: 'amlodipine besylate', dosageForm: 'Tablet', strength: '5mg', sig: 'Take 1 tablet by mouth once daily', ndcCode: '00069-1530-41', daysSupply: 90, refills: 3 },
  { name: 'Levothyroxine', genericName: 'levothyroxine sodium', dosageForm: 'Tablet', strength: '50mcg', sig: 'Take 1 tablet by mouth once daily on empty stomach', ndcCode: '00527-1340-01', daysSupply: 90, refills: 3 },
  { name: 'Omeprazole', genericName: 'omeprazole', dosageForm: 'Capsule', strength: '20mg', sig: 'Take 1 capsule by mouth once daily before meal', ndcCode: '00093-7056-98', daysSupply: 30, refills: 5 },
  { name: 'Sertraline', genericName: 'sertraline HCl', dosageForm: 'Tablet', strength: '50mg', sig: 'Take 1 tablet by mouth once daily', ndcCode: '00049-4960-41', daysSupply: 30, refills: 5 },
  { name: 'Amoxicillin', genericName: 'amoxicillin', dosageForm: 'Capsule', strength: '500mg', sig: 'Take 1 capsule by mouth three times daily for 10 days', ndcCode: '00093-3107-05', daysSupply: 10, refills: 0 },
];

const PHARMACIES = [
  { name: 'CVS Pharmacy #1234', ncpdp: '1234567', address: '123 Main St, San Francisco, CA 94102' },
  { name: 'Walgreens #5678', ncpdp: '5678901', address: '456 Market St, San Francisco, CA 94105' },
  { name: 'Rite Aid #9012', ncpdp: '9012345', address: '789 Mission St, San Francisco, CA 94103' },
  { name: 'Safeway Pharmacy #3456', ncpdp: '3456789', address: '1000 Van Ness Ave, San Francisco, CA 94109' },
];

const LAB_PRESETS = [
  { testName: 'Complete Blood Count', testCode: 'CBC', panelName: 'Hematology', specimenType: 'blood' },
  { testName: 'Comprehensive Metabolic Panel', testCode: 'CMP', panelName: 'Chemistry', specimenType: 'blood' },
  { testName: 'Basic Metabolic Panel', testCode: 'BMP', panelName: 'Chemistry', specimenType: 'blood' },
  { testName: 'Hemoglobin A1c', testCode: 'A1C', panelName: 'Endocrine', specimenType: 'blood' },
  { testName: 'Lipid Panel', testCode: 'LPT', panelName: 'Lipids', specimenType: 'blood' },
  { testName: 'Thyroid Stimulating Hormone', testCode: 'TSH', panelName: 'Thyroid', specimenType: 'blood' },
  { testName: 'Urinalysis with Microscopy', testCode: 'UA', panelName: 'Urinalysis', specimenType: 'urine' },
  { testName: 'Prothrombin Time / INR', testCode: 'PT_INR', panelName: 'Coagulation', specimenType: 'blood' },
  { testName: 'Vitamin D, 25-Hydroxy', testCode: 'VITD', panelName: 'Chemistry', specimenType: 'blood' },
  { testName: 'Ferritin', testCode: 'FERR', panelName: 'Hematology', specimenType: 'blood' },
];

type Tab = 'summary' | 'medications' | 'labs' | 'appointments' | 'notes' | 'vitals';

export default function PatientChart() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [patient, setPatient] = useState<any>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [appts, setAppts] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [showRxModal, setShowRxModal] = useState(false);
  const [rxForm, setRxForm] = useState({
    medicationName: '', genericName: '', dosageForm: '', strength: '',
    sig: '', quantity: '30', daysSupply: '30', refills: '0',
    pharmacyName: '', pharmacyNcpdp: '', pharmacyAddress: '',
    ndcCode: '', icd10Codes: '', notes: '',
  });
  const [submittingRx, setSubmittingRx] = useState(false);
  const [rxConfirmation, setRxConfirmation] = useState<{ medicationName: string; rxId: string; latencyMs: number } | null>(null);

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState({
    testName: '', testCode: '', panelName: '', specimenType: 'blood',
    lisVendor: 'Quest', priority: 'routine', icd10Codes: '', notes: '',
  });
  const [orderingLab, setOrderingLab] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<{ vendor: string; orderNumber: string; latencyMs: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      patientsApi.get(id),
      labsApi.list({ patientId: id }),
      medicationsApi.list({ patientId: id }),
      appointmentsApi.list({ patientId: id } as any),
      notesApi.list(id),
    ]).then(([pt, lb, md, ap, nt]) => {
      setPatient(pt.data);
      setLabs(lb.data);
      setMeds(md.data);
      setAppts(ap.data);
      setNotes(nt.data);
    }).finally(() => setLoading(false));
  }, [id]);

  const submitLabOrder = async () => {
    if (!orderForm.testName || !id) return;
    setOrderingLab(true);
    try {
      const res = await labOrderApi.order({
        patientId: id,
        testName: orderForm.testName,
        testCode: orderForm.testCode || undefined,
        panelName: orderForm.panelName || undefined,
        lisVendor: orderForm.lisVendor,
        priority: orderForm.priority,
        icd10Codes: orderForm.icd10Codes || undefined,
        specimenType: orderForm.specimenType || undefined,
        notes: orderForm.notes || undefined,
      });
      setLabs(prev => [res.data, ...prev]);
      setOrderConfirmation(res.data.integration);
      setShowOrderModal(false);
      setOrderForm({ testName: '', testCode: '', panelName: '', specimenType: 'blood', lisVendor: 'Quest', priority: 'routine', icd10Codes: '', notes: '' });
    } finally {
      setOrderingLab(false);
    }
  };

  const applyPreset = (preset: typeof LAB_PRESETS[0]) => {
    setOrderForm(f => ({ ...f, testName: preset.testName, testCode: preset.testCode, panelName: preset.panelName, specimenType: preset.specimenType }));
  };

  const fillMed = (med: typeof COMMON_MEDICATIONS[0]) => {
    setRxForm(f => ({
      ...f,
      medicationName: med.name, genericName: med.genericName,
      dosageForm: med.dosageForm, strength: med.strength,
      sig: med.sig, ndcCode: med.ndcCode,
      daysSupply: String(med.daysSupply), refills: String(med.refills),
      quantity: String(med.daysSupply),
    }));
  };

  const fillPharmacy = (ph: typeof PHARMACIES[0]) => {
    setRxForm(f => ({ ...f, pharmacyName: ph.name, pharmacyNcpdp: ph.ncpdp, pharmacyAddress: ph.address }));
  };

  const submitRx = async () => {
    if (!rxForm.medicationName || !rxForm.sig || !rxForm.quantity || !id) return;
    setSubmittingRx(true);
    try {
      const res = await eprescribeApi.submit({
        ...rxForm,
        patientId: id,
        quantity: Number(rxForm.quantity),
        daysSupply: Number(rxForm.daysSupply),
        refills: Number(rxForm.refills),
      });
      setRxConfirmation({
        medicationName: res.data.medication_name,
        rxId: res.data.surescripts_rx_id || res.data.id,
        latencyMs: res.data.integration?.latencyMs,
      });
      setShowRxModal(false);
      setRxForm({ medicationName: '', genericName: '', dosageForm: '', strength: '', sig: '', quantity: '30', daysSupply: '30', refills: '0', pharmacyName: '', pharmacyNcpdp: '', pharmacyAddress: '', ndcCode: '', icd10Codes: '', notes: '' });
    } finally {
      setSubmittingRx(false);
    }
  };

  const saveNote = async () => {
    if (!noteContent.trim() || !id) return;
    setSavingNote(true);
    try {
      const res = await notesApi.create({ patientId: id, noteType: 'progress', content: noteContent });
      setNotes(prev => [res.data, ...prev]);
      setNoteContent('');
      setShowNoteModal(false);
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!patient) return <div className="text-center py-12 text-gray-500">Patient not found</div>;

  const age = differenceInYears(new Date(), parseISO(patient.date_of_birth));

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'summary', label: 'Summary', icon: Heart },
    { id: 'medications', label: `Medications (${meds.filter(m => m.status === 'active').length})`, icon: Pill },
    { id: 'labs', label: `Labs (${labs.length})`, icon: FlaskConical },
    { id: 'appointments', label: `Visits (${appts.length})`, icon: Calendar },
    { id: 'notes', label: `Notes (${notes.length})`, icon: FileText },
    { id: 'vitals', label: 'Vitals', icon: Activity },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/provider/patients" className="inline-flex items-center gap-1.5 text-sm text-cisco-blue hover:underline" data-testid="back-to-patients">
        <ArrowLeft size={14} /> Back to Patients
      </Link>

      {/* Patient Banner - EPIC-like */}
      <div className="bg-cisco-dark-blue rounded-xl p-4 text-white">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold">{patient.first_name[0]}{patient.last_name[0]}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold">{`${patient.first_name} ${patient.last_name}`}</h1>
              {patient.allergies?.length > 0 && (
                <div className="flex items-center gap-1.5 bg-red-500/20 border border-red-400/30 text-red-200 text-xs px-2.5 py-1 rounded-full">
                  <AlertTriangle size={11} />
                  ALLERGIES
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-1.5 text-sm text-white/70">
              <span>MRN: <strong className="text-white">{patient.mrn}</strong></span>
              <span>DOB: {format(parseISO(patient.date_of_birth), 'MM/dd/yyyy')} ({age} yrs)</span>
              <span>{patient.gender}</span>
              <span>Blood Type: {patient.blood_type || 'Unknown'}</span>
              <span>{patient.insurance_provider} — {patient.insurance_id}</span>
            </div>
            {patient.allergies?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {patient.allergies.map((a: any) => (
                  <span key={a.id} className="bg-red-500/20 text-red-200 text-xs px-2 py-0.5 rounded-full border border-red-400/20">
                    ⚠ {a.allergen}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart tabs */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-cisco-blue text-cisco-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              data-testid={`chart-tab-${t.id}`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Stethoscope size={16} className="text-cisco-blue" /> Active Problem List
            </h3>
            {patient.diagnoses?.length === 0 ? (
              <p className="text-sm text-gray-500">No active problems</p>
            ) : (
              <div className="space-y-2">
                {patient.diagnoses?.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      d.status === 'chronic' ? 'bg-cisco-orange' : 'bg-cisco-blue'
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{d.description}</div>
                      <div className="text-xs text-gray-400">{d.icd_code} · {d.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-cisco-red" /> Allergies & Reactions
            </h3>
            {patient.allergies?.length === 0 ? (
              <p className="text-sm text-gray-500">NKDA (No Known Drug Allergies)</p>
            ) : (
              <div className="space-y-2">
                {patient.allergies?.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <AlertTriangle size={13} className="text-cisco-red mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{a.allergen}</div>
                      <div className="text-xs text-gray-500">{a.reaction}</div>
                      <AllergySeverityBadge severity={a.severity} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {patient.recentVitals?.[0] && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Activity size={16} className="text-cisco-blue" /> Latest Vitals
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['BP', `${patient.recentVitals[0].blood_pressure_systolic}/${patient.recentVitals[0].blood_pressure_diastolic}`, 'mmHg'],
                  ['HR', patient.recentVitals[0].heart_rate, 'bpm'],
                  ['Temp', patient.recentVitals[0].temperature, '°F'],
                  ['SpO2', patient.recentVitals[0].oxygen_saturation, '%'],
                  ['Wt', patient.recentVitals[0].weight, 'lbs'],
                  ['BMI', patient.recentVitals[0].bmi, ''],
                ].map(([label, val, unit]) => (
                  <div key={label as string} className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-400">{label}</div>
                    <div className="font-bold text-gray-900">{val} <span className="text-xs font-normal text-gray-400">{unit}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'medications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {rxConfirmation && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg" data-testid="rx-confirmation-banner">
                <CheckCircle size={15} className="flex-shrink-0" />
                Prescription sent to Surescripts —{' '}
                <strong data-testid="rx-confirmation-medication">{rxConfirmation.medicationName}</strong>
                {' · Rx #'}
                <span data-testid="rx-confirmation-rx-id">{rxConfirmation.rxId}</span>
                {rxConfirmation.latencyMs && <span data-testid="rx-confirmation-latency"> ({rxConfirmation.latencyMs}ms)</span>}
              </div>
            )}
            {!rxConfirmation && <span />}
            <button onClick={() => { setShowRxModal(true); setRxConfirmation(null); }} className="btn-primary" data-testid="new-rx-button">
              <Send size={16} /> New Prescription
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Route</th><th>Started</th><th>Status</th></tr></thead>
              <tbody>
                {meds.map(m => (
                  <tr key={m.id}>
                    <td><div className="font-medium text-gray-900">{m.name}</div><div className="text-xs text-gray-400">{m.generic_name}</div></td>
                    <td>{m.dosage}</td>
                    <td>{m.frequency}</td>
                    <td className="capitalize">{m.route}</td>
                    <td className="text-xs text-gray-500">{m.start_date ? format(parseISO(m.start_date), 'MM/dd/yyyy') : '—'}</td>
                    <td><MedStatusBadge status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'labs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {orderConfirmation && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg" data-testid="order-confirmation-banner">
                <CheckCircle size={15} className="flex-shrink-0" />
                Order sent to <strong data-testid="order-confirmation-vendor">{orderConfirmation.vendor}</strong>
                {' — #'}
                <span data-testid="order-confirmation-order-number">{orderConfirmation.orderNumber}</span>
                <span data-testid="order-confirmation-latency"> ({orderConfirmation.latencyMs}ms)</span>
              </div>
            )}
            {!orderConfirmation && <span />}
            <button onClick={() => { setShowOrderModal(true); setOrderConfirmation(null); }} className="btn-primary" data-testid="order-lab-button">
              <Plus size={16} /> Order Lab
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead><tr><th>Test</th><th>Result</th><th>Reference</th><th>Ordered</th><th>Resulted</th><th>Status</th></tr></thead>
              <tbody>
                {labs.map(l => (
                  <tr key={l.id} className={l.status === 'critical' ? 'bg-red-50' : ''}>
                    <td><div className="font-medium text-gray-900">{l.test_name}</div><div className="text-xs text-gray-400">{l.panel_name}</div></td>
                    <td className={`font-mono font-medium ${l.status === 'critical' ? 'text-cisco-red' : l.status === 'abnormal' ? 'text-cisco-orange' : ''}`}>
                      {l.value ? `${l.value} ${l.unit}` : '—'}
                    </td>
                    <td className="text-xs text-gray-500">{l.reference_range || '—'}</td>
                    <td className="text-xs text-gray-500">{format(parseISO(l.ordered_at), 'MM/dd/yy')}</td>
                    <td className="text-xs text-gray-500">{l.resulted_at ? format(parseISO(l.resulted_at), 'MM/dd/yy') : '—'}</td>
                    <td><LabStatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'appointments' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Date & Time</th><th>Type</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {appts.map(a => (
                <tr key={a.id}>
                  <td className="text-sm">{format(parseISO(a.scheduled_at), 'MMM d, yyyy h:mm a')}</td>
                  <td className="text-sm capitalize">{a.type.replace('_', ' ')}</td>
                  <td className="text-sm text-gray-500">{a.chief_complaint || '—'}</td>
                  <td><AppointmentStatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-4">
          <button onClick={() => setShowNoteModal(true)} className="btn-primary" data-testid="add-note-button">
            <Plus size={16} /> Add Progress Note
          </button>
          {notes.map(n => (
            <div key={n.id} className="card p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-sm font-semibold text-gray-900 capitalize">{n.note_type} Note</span>
                  <span className="text-xs text-gray-500 ml-2">
                    Dr. {n.pf} {n.pl} &middot; {format(parseISO(n.created_at), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
              </div>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{n.content}</pre>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="card p-12 text-center text-gray-500 text-sm">No clinical notes</div>
          )}
        </div>
      )}

      {tab === 'vitals' && (
        <div className="card p-5">
          <p className="text-sm text-gray-500">Vitals history — see Summary tab for latest values.</p>
        </div>
      )}

      <Modal isOpen={showOrderModal} onClose={() => setShowOrderModal(false)} title="Order Lab Test" size="lg"
        footer={
          <>
            <button onClick={() => setShowOrderModal(false)} className="btn-secondary" data-testid="cancel-order-button">Cancel</button>
            <button onClick={submitLabOrder} disabled={orderingLab || !orderForm.testName} className="btn-primary" data-testid="submit-order-button">
              {orderingLab ? 'Sending to LIS...' : `Send to ${orderForm.lisVendor}`}
            </button>
          </>
        }
      >
        <div className="space-y-4" data-testid="order-modal">
          {/* Quick-select presets */}
          <div>
            <label className="form-label">Common Tests</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {LAB_PRESETS.map(p => (
                <button
                  key={p.testCode}
                  type="button"
                  onClick={() => applyPreset(p)}
                  data-testid={`order-preset-${p.testCode.toLowerCase()}`}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    orderForm.testCode === p.testCode
                      ? 'bg-cisco-blue text-white border-cisco-blue'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-cisco-blue hover:text-cisco-blue'
                  }`}
                >
                  {p.testCode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Test Name *</label>
              <input
                className="form-input"
                value={orderForm.testName}
                onChange={e => setOrderForm(f => ({ ...f, testName: e.target.value }))}
                placeholder="e.g. Complete Blood Count"
                data-testid="order-test-name"
              />
            </div>
            <div>
              <label className="form-label">Panel / Category</label>
              <input
                className="form-input"
                value={orderForm.panelName}
                onChange={e => setOrderForm(f => ({ ...f, panelName: e.target.value }))}
                placeholder="e.g. Hematology"
                data-testid="order-panel-name"
              />
            </div>
            <div>
              <label className="form-label">Specimen Type</label>
              <select className="form-input" value={orderForm.specimenType} onChange={e => setOrderForm(f => ({ ...f, specimenType: e.target.value }))} data-testid="order-specimen-type">
                <option value="blood">Blood (venipuncture)</option>
                <option value="urine">Urine</option>
                <option value="swab">Swab</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="form-label">LIS Vendor</label>
              <select className="form-input" value={orderForm.lisVendor} onChange={e => setOrderForm(f => ({ ...f, lisVendor: e.target.value }))} data-testid="order-vendor">
                <option value="Quest">Quest Diagnostics</option>
                <option value="LabCorp">LabCorp</option>
                <option value="BioReference">BioReference</option>
              </select>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-input" value={orderForm.priority} onChange={e => setOrderForm(f => ({ ...f, priority: e.target.value }))} data-testid="order-priority">
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">ICD-10 Diagnosis Codes</label>
              <input
                className="form-input"
                value={orderForm.icd10Codes}
                onChange={e => setOrderForm(f => ({ ...f, icd10Codes: e.target.value }))}
                placeholder="e.g. E11.65, Z13.220"
                data-testid="order-icd10-codes"
              />
            </div>
            <div className="col-span-2">
              <label className="form-label">Clinical Notes</label>
              <textarea
                className="form-input resize-none"
                rows={3}
                value={orderForm.notes}
                onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional instructions for the lab..."
                data-testid="order-notes"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showRxModal} onClose={() => setShowRxModal(false)} title="New ePrescription — Surescripts" size="lg"
        footer={
          <>
            <button onClick={() => setShowRxModal(false)} className="btn-secondary" disabled={submittingRx} data-testid="cancel-rx-button">Cancel</button>
            <button
              onClick={submitRx}
              disabled={submittingRx || !rxForm.medicationName || !rxForm.sig || !rxForm.quantity}
              className="btn-primary"
              data-testid="submit-rx-button"
            >
              {submittingRx ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Transmitting...</>
              ) : (
                <><Send size={15} /> Submit ePrescription</>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4" data-testid="rx-modal">
          <div>
            <label className="form-label">Quick-fill Medication</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {COMMON_MEDICATIONS.map(med => (
                <button
                  key={med.name}
                  type="button"
                  onClick={() => fillMed(med)}
                  data-testid={`rx-quickfill-${med.name.replace(/\s+/g, '-').toLowerCase()}`}
                  className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                    rxForm.medicationName === med.name
                      ? 'border-cisco-blue bg-blue-50'
                      : 'border-gray-200 hover:border-cisco-blue hover:bg-blue-50'
                  }`}
                >
                  <div className="font-medium text-gray-800">{med.name}</div>
                  <div className="text-gray-500">{med.strength} · {med.dosageForm}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Medication Name *</label>
              <input className="form-input" value={rxForm.medicationName} onChange={e => setRxForm(f => ({ ...f, medicationName: e.target.value }))} placeholder="Brand name" data-testid="rx-medication-name" />
            </div>
            <div>
              <label className="form-label">Generic Name</label>
              <input className="form-input" value={rxForm.genericName} onChange={e => setRxForm(f => ({ ...f, genericName: e.target.value }))} placeholder="Generic name" data-testid="rx-generic-name" />
            </div>
            <div>
              <label className="form-label">Strength</label>
              <input className="form-input" value={rxForm.strength} onChange={e => setRxForm(f => ({ ...f, strength: e.target.value }))} placeholder="e.g. 500mg" data-testid="rx-strength" />
            </div>
            <div>
              <label className="form-label">Dosage Form</label>
              <input className="form-input" value={rxForm.dosageForm} onChange={e => setRxForm(f => ({ ...f, dosageForm: e.target.value }))} placeholder="Tablet, Capsule..." data-testid="rx-dosage-form" />
            </div>
          </div>

          <div>
            <label className="form-label">Sig (Directions) *</label>
            <input className="form-input" value={rxForm.sig} onChange={e => setRxForm(f => ({ ...f, sig: e.target.value }))} placeholder="Take 1 tablet by mouth twice daily" data-testid="rx-sig" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Quantity *</label>
              <input className="form-input" type="number" min="1" value={rxForm.quantity} onChange={e => setRxForm(f => ({ ...f, quantity: e.target.value }))} data-testid="rx-quantity" />
            </div>
            <div>
              <label className="form-label">Days Supply</label>
              <input className="form-input" type="number" min="1" value={rxForm.daysSupply} onChange={e => setRxForm(f => ({ ...f, daysSupply: e.target.value }))} data-testid="rx-days-supply" />
            </div>
            <div>
              <label className="form-label">Refills</label>
              <input className="form-input" type="number" min="0" max="11" value={rxForm.refills} onChange={e => setRxForm(f => ({ ...f, refills: e.target.value }))} data-testid="rx-refills" />
            </div>
          </div>

          <div>
            <label className="form-label">Pharmacy</label>
            <div className="grid grid-cols-2 gap-2">
              {PHARMACIES.map(ph => (
                <button
                  key={ph.ncpdp}
                  type="button"
                  onClick={() => fillPharmacy(ph)}
                  data-testid={`rx-pharmacy-${ph.ncpdp}`}
                  className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                    rxForm.pharmacyNcpdp === ph.ncpdp ? 'border-cisco-blue bg-blue-50' : 'border-gray-200 hover:border-cisco-blue'
                  }`}
                >
                  <div className="font-medium text-gray-800">{ph.name}</div>
                  <div className="text-gray-500 truncate">{ph.address}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">ICD-10 Codes</label>
              <input className="form-input" value={rxForm.icd10Codes} onChange={e => setRxForm(f => ({ ...f, icd10Codes: e.target.value }))} placeholder="E11.9, I10" data-testid="rx-icd10-codes" />
            </div>
            <div>
              <label className="form-label">NDC Code</label>
              <input className="form-input" value={rxForm.ndcCode} onChange={e => setRxForm(f => ({ ...f, ndcCode: e.target.value }))} placeholder="00000-0000-00" data-testid="rx-ndc-code" />
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showNoteModal} onClose={() => setShowNoteModal(false)} title="Add Progress Note" size="lg"
        footer={
          <>
            <button onClick={() => setShowNoteModal(false)} className="btn-secondary" data-testid="cancel-note-button">Cancel</button>
            <button onClick={saveNote} disabled={savingNote} className="btn-primary" data-testid="save-note-button">
              {savingNote ? 'Saving...' : 'Save Note'}
            </button>
          </>
        }
      >
        <textarea
          className="form-input resize-none w-full"
          rows={16}
          value={noteContent}
          onChange={e => setNoteContent(e.target.value)}
          placeholder="SUBJECTIVE:&#10;&#10;OBJECTIVE:&#10;&#10;ASSESSMENT:&#10;&#10;PLAN:"
          data-testid="note-content-textarea"
        />
      </Modal>
    </div>
  );
}
