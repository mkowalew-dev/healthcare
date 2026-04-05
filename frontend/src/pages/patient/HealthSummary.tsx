import { useState, useEffect } from 'react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { patientsApi, vitalsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { AllergySeverityBadge } from '../../components/ui/Badge';
import { Patient, Allergy, Diagnosis, VitalSigns } from '../../types';
import {
  Heart, AlertTriangle, Activity, Stethoscope, User,
  TrendingUp, Thermometer, Wind, Droplets,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

export default function HealthSummary() {
  const { profile } = useAuth();
  const patient = profile as Patient;
  const [loading, setLoading] = useState(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [vitals, setVitals] = useState<VitalSigns[]>([]);

  useEffect(() => {
    if (!patient?.id) return;
    Promise.all([
      patientsApi.me(),
      vitalsApi.list(),
    ]).then(([pt, vs]) => {
      setPatientData(pt?.data);
      setVitals(vs.data);
    }).finally(() => setLoading(false));
  }, [patient]);

  const age = patient?.date_of_birth
    ? differenceInYears(new Date(), parseISO(patient.date_of_birth))
    : null;

  const vitalsTrend = vitals.map(v => ({
    date: format(parseISO(v.recorded_at), 'MM/dd'),
    'Systolic': v.blood_pressure_systolic,
    'Diastolic': v.blood_pressure_diastolic,
    'Heart Rate': v.heart_rate,
    'Weight': v.weight,
  })).reverse();

  const latestVitals = vitals[0];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Health Summary</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your complete health overview</p>
      </div>

      {/* Patient Info Banner */}
      <div className="card p-6">
        <div className="flex flex-wrap gap-6 items-start">
          <div className="w-16 h-16 rounded-xl bg-cisco-dark-blue flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-white">
              {patient?.first_name?.[0]}{patient?.last_name?.[0]}
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">
              {patient?.first_name} {patient?.last_name}
            </h2>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
              <span><strong>MRN:</strong> {patient?.mrn}</span>
              <span><strong>DOB:</strong> {patient?.date_of_birth ? format(parseISO(patient.date_of_birth), 'MM/dd/yyyy') : '—'} ({age} yrs)</span>
              <span><strong>Gender:</strong> {patient?.gender}</span>
              <span><strong>Blood Type:</strong> {patient?.blood_type || 'Unknown'}</span>
            </div>
            <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-500">
              <span><strong>Insurance:</strong> {patient?.insurance_provider} ({patient?.insurance_id})</span>
              <span><strong>Primary Provider:</strong> Dr. {patient?.provider_first} {patient?.provider_last}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vitals */}
          {latestVitals && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Latest Vital Signs</h2>
                <span className="text-xs text-gray-400 ml-auto">
                  {format(parseISO(latestVitals.recorded_at), 'MMM d, yyyy')}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Blood Pressure',
                    value: latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic
                      ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
                      : '—',
                    unit: 'mmHg',
                    icon: Heart,
                    flag: latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_systolic > 130,
                  },
                  {
                    label: 'Heart Rate',
                    value: latestVitals.heart_rate || '—',
                    unit: 'bpm',
                    icon: Activity,
                    flag: false,
                  },
                  {
                    label: 'Temperature',
                    value: latestVitals.temperature || '—',
                    unit: '°F',
                    icon: Thermometer,
                    flag: latestVitals.temperature && latestVitals.temperature > 99.5,
                  },
                  {
                    label: 'O₂ Saturation',
                    value: latestVitals.oxygen_saturation || '—',
                    unit: '%',
                    icon: Wind,
                    flag: latestVitals.oxygen_saturation && latestVitals.oxygen_saturation < 95,
                  },
                  {
                    label: 'Weight',
                    value: latestVitals.weight || '—',
                    unit: 'lbs',
                    icon: User,
                    flag: false,
                  },
                  {
                    label: 'BMI',
                    value: latestVitals.bmi || '—',
                    unit: '',
                    icon: TrendingUp,
                    flag: latestVitals.bmi && latestVitals.bmi > 25,
                  },
                  {
                    label: 'Resp. Rate',
                    value: latestVitals.respiratory_rate || '—',
                    unit: '/min',
                    icon: Wind,
                    flag: false,
                  },
                  {
                    label: 'Pain Level',
                    value: latestVitals.pain_level !== undefined ? latestVitals.pain_level : '—',
                    unit: '/10',
                    icon: Droplets,
                    flag: latestVitals.pain_level !== undefined && latestVitals.pain_level > 3,
                  },
                ].map(({ label, value, unit, icon: Icon, flag }) => (
                  <div key={label} className={`bg-gray-50 rounded-lg p-3 ${flag ? 'bg-amber-50 border border-amber-100' : ''}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} className={flag ? 'text-cisco-orange' : 'text-gray-400'} />
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                    <div className={`font-bold text-lg ${flag ? 'text-cisco-orange' : 'text-gray-900'}`}>
                      {value}
                      <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BP Trend */}
          {vitalsTrend.length > 1 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Blood Pressure Trend</h2>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={vitalsTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Systolic" stroke="#049FD9" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Diastolic" stroke="#1D4289" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Allergies */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-cisco-red" />
              <h2 className="font-semibold text-gray-900">Allergies</h2>
            </div>
            {(patientData?.allergies || []).length === 0 ? (
              <p className="text-sm text-gray-500">No known drug allergies</p>
            ) : (
              <div className="space-y-2">
                {(patientData?.allergies || []).map((a: Allergy) => (
                  <div key={a.id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
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

          {/* Problem List */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Stethoscope size={18} className="text-cisco-blue" />
              <h2 className="font-semibold text-gray-900">Problem List</h2>
            </div>
            {(patientData?.diagnoses || []).length === 0 ? (
              <p className="text-sm text-gray-500">No active diagnoses</p>
            ) : (
              <div className="space-y-2">
                {(patientData?.diagnoses || []).map((d: Diagnosis) => (
                  <div key={d.id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      d.status === 'chronic' ? 'bg-cisco-orange' :
                      d.status === 'active' ? 'bg-cisco-blue' : 'bg-gray-300'
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{d.description}</div>
                      <div className="text-xs text-gray-400">
                        {d.icd_code} &middot; {d.status} &middot;{' '}
                        {d.diagnosed_date ? format(parseISO(d.diagnosed_date), 'MMM yyyy') : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Emergency Contact */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <User size={18} className="text-cisco-blue" />
              <h2 className="font-semibold text-gray-900">Emergency Contact</h2>
            </div>
            <div className="text-sm">
              <div className="font-medium text-gray-800">{patient?.emergency_contact_name || 'Not specified'}</div>
              <div className="text-gray-500">{patient?.emergency_contact_phone}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
