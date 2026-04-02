import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { medicationsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { MedStatusBadge } from '../../components/ui/Badge';
import { Medication } from '../../types';
import { Pill, RefreshCw, Info, Clock } from 'lucide-react';

export default function Medications() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [refillRequesting, setRefillRequesting] = useState<string | null>(null);
  const [refillSuccess, setRefillSuccess] = useState<string | null>(null);

  useEffect(() => {
    medicationsApi.list().then(res => setMeds(res.data)).finally(() => setLoading(false));
  }, []);

  const filtered = tab === 'active' ? meds.filter(m => m.status === 'active') : meds;

  const handleRefill = async (med: Medication) => {
    setRefillRequesting(med.id);
    try {
      await medicationsApi.requestRefill(med.id);
      setRefillSuccess(med.id);
      setTimeout(() => setRefillSuccess(null), 4000);
    } finally {
      setRefillRequesting(null);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Medications</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your current and past prescriptions</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['active', 'all'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-white text-cisco-dark-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'active' ? 'Active' : 'All Medications'}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Pill size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No medications found</p>
          </div>
        ) : (
          filtered.map((med) => (
            <div key={med.id} className={`card p-5 ${med.status !== 'active' ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4 flex-1">
                  {/* Pill icon with color */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    med.status === 'active' ? 'bg-cisco-blue/10' : 'bg-gray-100'
                  }`}>
                    <Pill size={20} className={med.status === 'active' ? 'text-cisco-blue' : 'text-gray-400'} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start gap-3 flex-wrap">
                      <div>
                        <div className="font-semibold text-gray-900">{med.name}</div>
                        {med.generic_name && (
                          <div className="text-xs text-gray-500">{med.generic_name}</div>
                        )}
                      </div>
                      <MedStatusBadge status={med.status} />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider">Dosage</div>
                        <div className="text-sm font-medium text-gray-800">{med.dosage}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider">Frequency</div>
                        <div className="text-sm font-medium text-gray-800">{med.frequency}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider">Route</div>
                        <div className="text-sm font-medium text-gray-800 capitalize">{med.route}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider">Prescriber</div>
                        <div className="text-sm font-medium text-gray-800">
                          {med.provider_last ? `Dr. ${med.provider_last}` : '—'}
                        </div>
                      </div>
                    </div>

                    {med.instructions && (
                      <div className="flex items-start gap-2 mt-3 bg-amber-50 rounded-lg px-3 py-2">
                        <Info size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">{med.instructions}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        Started: {med.start_date ? format(parseISO(med.start_date), 'MMM d, yyyy') : '—'}
                      </span>
                      {med.end_date && (
                        <span>Ended: {format(parseISO(med.end_date), 'MMM d, yyyy')}</span>
                      )}
                      {med.refills_remaining > 0 && (
                        <span className="text-cisco-blue font-medium">{med.refills_remaining} refill(s) remaining</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Refill button */}
                {med.status === 'active' && (
                  <div className="flex-shrink-0">
                    {refillSuccess === med.id ? (
                      <div className="flex items-center gap-1.5 text-xs text-cisco-green bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                        <span>✓ Refill requested</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRefill(med)}
                        disabled={refillRequesting === med.id}
                        className="btn-secondary text-xs"
                      >
                        <RefreshCw size={13} className={refillRequesting === med.id ? 'animate-spin' : ''} />
                        Request Refill
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
