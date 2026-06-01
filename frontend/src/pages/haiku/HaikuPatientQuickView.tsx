import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { differenceInYears, parseISO, format } from 'date-fns';
import { haikuApi } from '../../services/api';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ArrowLeft, AlertTriangle, Heart, Thermometer, Wind, Activity } from 'lucide-react';
import type { Patient, Medication, LabResult, Allergy, Diagnosis, VitalSigns } from '../../types';

interface QuickViewData {
  patient: Patient & { provider_first: string; provider_last: string; department_name: string };
  vitals: VitalSigns | null;
  medications: Medication[];
  recent_labs: LabResult[];
  allergies: Allergy[];
  diagnoses: Diagnosis[];
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    life_threatening: 'bg-red-100 text-red-700',
    severe: 'bg-orange-100 text-orange-700',
    moderate: 'bg-yellow-100 text-yellow-700',
    mild: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${colors[severity] ?? 'bg-gray-100 text-gray-600'}`}>
      {severity.replace('_', ' ')}
    </span>
  );
}

function LabBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    abnormal: 'bg-orange-100 text-orange-700',
    resulted: 'bg-green-100 text-green-700',
    pending: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function HaikuPatientQuickView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<QuickViewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      haikuApi.quickview(id)
        .then(r => setData(r.data))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-gray-500">Patient not found</p>
        <Link to="/haiku/patients" className="mt-4 text-[#0d274d] text-sm font-medium">
          ← Back to patients
        </Link>
      </div>
    );
  }

  const { patient, vitals, medications, recent_labs, allergies, diagnoses } = data;
  const age = differenceInYears(new Date(), parseISO(patient.date_of_birth));
  const criticalAllergies = allergies.filter(a => a.severity === 'life_threatening' || a.severity === 'severe');

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="bg-[#0d274d] px-4 pt-10 pb-5">
        <Link to="/haiku/patients" className="flex items-center gap-1 text-white/60 text-sm mb-3">
          <ArrowLeft size={16} /> Patients
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-white text-xl font-bold">
              {patient.last_name}, {patient.first_name}
            </h1>
            <p className="text-white/60 text-sm mt-0.5">
              MRN {patient.mrn} · {age}y {patient.gender} · {patient.blood_type || '—'}
            </p>
            <p className="text-white/40 text-xs mt-1">
              {patient.provider_first} {patient.provider_last} · {patient.department_name}
            </p>
          </div>
          {criticalAllergies.length > 0 && (
            <div className="bg-red-500/20 border border-red-400/40 rounded-xl px-2.5 py-1.5 flex items-center gap-1">
              <AlertTriangle size={14} className="text-red-300" />
              <span className="text-red-300 text-xs font-semibold">ALLERGY</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">

        {/* Vitals */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Latest Vitals</h2>
          {vitals ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-3">
                {format(parseISO(vitals.recorded_at), 'MMM d, h:mm a')}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {vitals.blood_pressure_systolic && (
                  <div className="flex flex-col items-center">
                    <Heart size={16} className="text-red-400 mb-1" />
                    <p className="text-sm font-bold text-gray-900">
                      {vitals.blood_pressure_systolic}/{vitals.blood_pressure_diastolic}
                    </p>
                    <p className="text-xs text-gray-400">mmHg</p>
                  </div>
                )}
                {vitals.heart_rate && (
                  <div className="flex flex-col items-center">
                    <Activity size={16} className="text-[#0d274d] mb-1" />
                    <p className="text-sm font-bold text-gray-900">{vitals.heart_rate}</p>
                    <p className="text-xs text-gray-400">bpm</p>
                  </div>
                )}
                {vitals.oxygen_saturation && (
                  <div className="flex flex-col items-center">
                    <Wind size={16} className="text-blue-400 mb-1" />
                    <p className="text-sm font-bold text-gray-900">{vitals.oxygen_saturation}%</p>
                    <p className="text-xs text-gray-400">SpO₂</p>
                  </div>
                )}
                {vitals.temperature && (
                  <div className="flex flex-col items-center">
                    <Thermometer size={16} className="text-orange-400 mb-1" />
                    <p className="text-sm font-bold text-gray-900">{vitals.temperature}°F</p>
                    <p className="text-xs text-gray-400">Temp</p>
                  </div>
                )}
                {vitals.weight && (
                  <div className="flex flex-col items-center">
                    <span className="text-gray-400 text-xs mb-1">WT</span>
                    <p className="text-sm font-bold text-gray-900">{vitals.weight}</p>
                    <p className="text-xs text-gray-400">lbs</p>
                  </div>
                )}
                {vitals.pain_level != null && (
                  <div className="flex flex-col items-center">
                    <span className="text-gray-400 text-xs mb-1">PAIN</span>
                    <p className={`text-sm font-bold ${vitals.pain_level > 6 ? 'text-red-500' : 'text-gray-900'}`}>
                      {vitals.pain_level}/10
                    </p>
                    <p className="text-xs text-gray-400">Scale</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-gray-400 text-sm">
              No vitals recorded
            </div>
          )}
        </section>

        {/* Allergies */}
        {allergies.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Allergies</h2>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
              {allergies.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.allergen}</p>
                    <p className="text-xs text-gray-500">{a.reaction}</p>
                  </div>
                  <SeverityBadge severity={a.severity} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active diagnoses */}
        {diagnoses.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Problem List</h2>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
              {diagnoses.map(d => (
                <div key={d.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{d.description}</p>
                    <span className="text-xs text-gray-400 ml-2 shrink-0">{d.icd_code}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{d.status}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent labs */}
        {recent_labs.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent Labs</h2>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
              {recent_labs.map(lab => (
                <div key={lab.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{lab.test_name}</p>
                    {lab.value && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {lab.value} {lab.unit}
                        {lab.reference_range && <span className="text-gray-400"> · ref {lab.reference_range}</span>}
                      </p>
                    )}
                  </div>
                  <LabBadge status={lab.status} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active medications */}
        {medications.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Active Medications ({medications.length})
            </h2>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
              {medications.map(med => (
                <div key={med.id} className="px-4 py-3">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-medium text-gray-900">{med.name}</p>
                    {med.refills_remaining === 0 && (
                      <span className="text-xs text-orange-500 font-medium shrink-0 ml-2">No refills</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {med.dosage} · {med.frequency} · {med.route}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
