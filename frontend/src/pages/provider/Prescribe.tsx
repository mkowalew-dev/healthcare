import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { eprescribeApi, patientsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { Modal } from '../../components/ui/Modal';
import {
  Pill, CheckCircle, XCircle, Clock, AlertTriangle, Send,
  ArrowLeft, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  confirmed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Confirmed' },
  submitted: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Submitted' },
  draft:     { color: 'bg-gray-100 text-gray-700', icon: Clock, label: 'Draft' },
  rejected:  { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Rejected' },
  cancelled: { color: 'bg-gray-100 text-gray-500', icon: XCircle, label: 'Cancelled' },
  on_hold:   { color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle, label: 'On Hold' },
};

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

export default function Prescribe() {
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get('patientId');

  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [successRx, setSuccessRx] = useState<any>(null);

  const [form, setForm] = useState({
    patientId: patientIdParam || '',
    medicationName: '',
    genericName: '',
    dosageForm: '',
    strength: '',
    sig: '',
    quantity: '30',
    daysSupply: '30',
    refills: '0',
    pharmacyName: '',
    pharmacyNcpdp: '',
    pharmacyAddress: '',
    ndcCode: '',
    icd10Codes: '',
    notes: '',
  });

  useEffect(() => {
    Promise.all([
      eprescribeApi.list(patientIdParam ? { patientId: patientIdParam } : {}),
      patientsApi.list(),
    ]).then(([rx, pts]) => {
      setPrescriptions(rx.data);
      setPatients(pts.data);
    }).finally(() => setLoading(false));
  }, [patientIdParam]);

  const fillMed = (med: typeof COMMON_MEDICATIONS[0]) => {
    setForm(f => ({
      ...f,
      medicationName: med.name,
      genericName: med.genericName,
      dosageForm: med.dosageForm,
      strength: med.strength,
      sig: med.sig,
      ndcCode: med.ndcCode,
      daysSupply: String(med.daysSupply),
      refills: String(med.refills),
      quantity: String(med.daysSupply),
    }));
  };

  const fillPharmacy = (ph: typeof PHARMACIES[0]) => {
    setForm(f => ({ ...f, pharmacyName: ph.name, pharmacyNcpdp: ph.ncpdp, pharmacyAddress: ph.address }));
  };

  const handleSubmit = async () => {
    if (!form.patientId || !form.medicationName || !form.sig || !form.quantity) return;
    setSubmitting(true);
    try {
      const res = await eprescribeApi.submit({
        ...form,
        quantity: Number(form.quantity),
        daysSupply: Number(form.daysSupply),
        refills: Number(form.refills),
      });
      setPrescriptions(prev => [res.data, ...prev]);
      setSuccessRx(res.data);
      setShowModal(false);
      setForm(f => ({ ...f, medicationName: '', genericName: '', sig: '', quantity: '30', pharmacyName: '', pharmacyNcpdp: '', pharmacyAddress: '', ndcCode: '', notes: '' }));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/provider/patients" className="inline-flex items-center gap-1 text-sm text-cisco-blue hover:underline">
              <ArrowLeft size={14} /> Patients
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Pill size={24} className="text-cisco-blue" />
            ePrescribing
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Surescripts SCRIPT 10.6 network integration</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2"
          data-testid="new-rx-button"
        >
          <Send size={16} />
          New Prescription
        </button>
      </div>

      {/* Success banner */}
      {successRx && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">Prescription transmitted to Surescripts</p>
            <p className="text-sm text-green-700">
              {successRx.medication_name} — Rx ID: <strong>{successRx.surescripts_rx_id || successRx.id}</strong>
              {successRx.integration?.latencyMs && ` · ${successRx.integration.latencyMs}ms`}
            </p>
          </div>
          <button className="ml-auto text-green-600 hover:text-green-800" onClick={() => setSuccessRx(null)}>×</button>
        </div>
      )}

      {/* Surescripts integration status badge */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
          <Zap size={20} className="text-cisco-blue" />
        </div>
        <div>
          <div className="font-semibold text-gray-900 text-sm">Surescripts Network</div>
          <div className="text-xs text-gray-500">SCRIPT 10.6 · eRx Routing · Pharmacy Directory</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-xs text-green-700 font-medium">Connected</span>
        </div>
      </div>

      {/* Prescriptions table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Prescription History</h2>
          <span className="text-sm text-gray-500">{prescriptions.length} records</span>
        </div>
        {prescriptions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Pill size={40} className="mx-auto mb-3 opacity-30" />
            <p>No prescriptions yet. Click "New Prescription" to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {prescriptions.map(rx => {
              const s = STATUS_CONFIG[rx.status] || STATUS_CONFIG.submitted;
              const Icon = s.icon;
              return (
                <div key={rx.id}>
                  <div
                    className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === rx.id ? null : rx.id)}
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Pill size={16} className="text-cisco-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{rx.medication_name} {rx.strength}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {rx.patient_first} {rx.patient_last} · {rx.sig}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>
                        <Icon size={10} />
                        {s.label}
                      </span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {format(parseISO(rx.created_at), 'MM/dd/yyyy')}
                      </div>
                    </div>
                    {expandedId === rx.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                  {expandedId === rx.id && (
                    <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3">
                        <div><span className="text-gray-500 text-xs">Qty / Days</span><div className="font-medium">{rx.quantity} / {rx.days_supply}d</div></div>
                        <div><span className="text-gray-500 text-xs">Refills</span><div className="font-medium">{rx.refills}</div></div>
                        <div><span className="text-gray-500 text-xs">Pharmacy</span><div className="font-medium">{rx.pharmacy_name || '—'}</div></div>
                        <div><span className="text-gray-500 text-xs">Rx ID</span><div className="font-medium font-mono text-xs">{rx.surescripts_rx_id || '—'}</div></div>
                        {rx.latency_ms && <div><span className="text-gray-500 text-xs">Network Latency</span><div className="font-medium text-cisco-blue">{rx.latency_ms}ms</div></div>}
                        {rx.icd10_codes && <div><span className="text-gray-500 text-xs">ICD-10</span><div className="font-medium">{rx.icd10_codes}</div></div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Prescription Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New ePrescription — Surescripts" size="lg">
        <div className="space-y-5">
          {/* Quick-fill medications */}
          <div>
            <label className="form-label">Quick-fill Medication</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {COMMON_MEDICATIONS.map(med => (
                <button
                  key={med.name}
                  onClick={() => fillMed(med)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-gray-200 hover:border-cisco-blue hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-gray-800">{med.name}</div>
                  <div className="text-gray-500">{med.strength} · {med.dosageForm}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Patient */}
          <div>
            <label className="form-label">Patient</label>
            <select
              className="form-input"
              value={form.patientId}
              onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))}
            >
              <option value="">Select patient...</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name} (MRN: {p.mrn})</option>
              ))}
            </select>
          </div>

          {/* Medication details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Medication Name *</label>
              <input className="form-input" value={form.medicationName} onChange={e => setForm(f => ({ ...f, medicationName: e.target.value }))} placeholder="Brand name" />
            </div>
            <div>
              <label className="form-label">Generic Name</label>
              <input className="form-input" value={form.genericName} onChange={e => setForm(f => ({ ...f, genericName: e.target.value }))} placeholder="Generic name" />
            </div>
            <div>
              <label className="form-label">Strength</label>
              <input className="form-input" value={form.strength} onChange={e => setForm(f => ({ ...f, strength: e.target.value }))} placeholder="e.g. 500mg" />
            </div>
            <div>
              <label className="form-label">Dosage Form</label>
              <input className="form-input" value={form.dosageForm} onChange={e => setForm(f => ({ ...f, dosageForm: e.target.value }))} placeholder="Tablet, Capsule..." />
            </div>
          </div>

          {/* Sig */}
          <div>
            <label className="form-label">Sig (Directions) *</label>
            <input className="form-input" value={form.sig} onChange={e => setForm(f => ({ ...f, sig: e.target.value }))} placeholder="Take 1 tablet by mouth twice daily" />
          </div>

          {/* Quantity / Days / Refills */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Quantity *</label>
              <input className="form-input" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Days Supply</label>
              <input className="form-input" type="number" min="1" value={form.daysSupply} onChange={e => setForm(f => ({ ...f, daysSupply: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Refills</label>
              <input className="form-input" type="number" min="0" max="11" value={form.refills} onChange={e => setForm(f => ({ ...f, refills: e.target.value }))} />
            </div>
          </div>

          {/* Pharmacy */}
          <div>
            <label className="form-label">Pharmacy</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {PHARMACIES.map(ph => (
                <button
                  key={ph.ncpdp}
                  onClick={() => fillPharmacy(ph)}
                  className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${form.pharmacyNcpdp === ph.ncpdp ? 'border-cisco-blue bg-blue-50' : 'border-gray-200 hover:border-cisco-blue'}`}
                >
                  <div className="font-medium text-gray-800">{ph.name}</div>
                  <div className="text-gray-500 truncate">{ph.address}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ICD-10 + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">ICD-10 Codes</label>
              <input className="form-input" value={form.icd10Codes} onChange={e => setForm(f => ({ ...f, icd10Codes: e.target.value }))} placeholder="E11.9, I10" />
            </div>
            <div>
              <label className="form-label">NDC Code</label>
              <input className="form-input" value={form.ndcCode} onChange={e => setForm(f => ({ ...f, ndcCode: e.target.value }))} placeholder="00000-0000-00" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button className="btn-secondary" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleSubmit}
              disabled={submitting || !form.patientId || !form.medicationName || !form.sig || !form.quantity}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Transmitting to Surescripts...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Submit ePrescription
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
