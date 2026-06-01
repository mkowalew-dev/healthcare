import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { differenceInYears, parseISO } from 'date-fns';
import { haikuApi } from '../../services/api';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Search, AlertTriangle, ChevronRight, Activity } from 'lucide-react';

interface WorklistPatient {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  blood_type: string;
  critical_labs: number;
  abnormal_labs: number;
  pending_labs: number;
  active_meds: number;
  last_vitals_at: string | null;
  today_appt: string | null;
}

function PatientAvatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-[#0d274d]/10 flex items-center justify-center shrink-0 text-[#0d274d] font-semibold text-sm">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function HaikuPatients() {
  const [patients, setPatients] = useState<WorklistPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    haikuApi.worklist()
      .then(r => setPatients(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      p.mrn.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Header */}
      <div className="bg-[#0d274d] px-4 pt-12 pb-4">
        <h1 className="text-white text-xl font-bold">Patients</h1>
        <p className="text-white/50 text-xs mt-0.5">{patients.length} assigned</p>
      </div>

      {/* Search */}
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            type="search"
            placeholder="Search name or MRN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">No patients found</p>
          )}
          {filtered.map(p => {
            const age = differenceInYears(new Date(), parseISO(p.date_of_birth));
            const hasCritical = Number(p.critical_labs) > 0;
            const hasAbnormal = Number(p.abnormal_labs) > 0;

            return (
              <Link
                key={p.id}
                to={`/haiku/patients/${p.id}`}
                className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50 transition-colors"
              >
                <PatientAvatar name={p.last_name} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">
                      {p.last_name}, {p.first_name}
                    </p>
                    {hasCritical && (
                      <span className="flex items-center gap-0.5 text-red-500">
                        <AlertTriangle size={12} />
                        <span className="text-xs font-bold">{p.critical_labs}</span>
                      </span>
                    )}
                    {!hasCritical && hasAbnormal && (
                      <span className="text-orange-400 text-xs font-semibold">
                        ⚠ {p.abnormal_labs}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    MRN {p.mrn} · {age}y · {p.blood_type || '—'}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {Number(p.active_meds) > 0 && (
                      <span className="text-xs text-gray-400">{p.active_meds} meds</span>
                    )}
                    {p.today_appt && (
                      <span className="text-xs text-[#0d274d] font-medium flex items-center gap-0.5">
                        <Activity size={10} /> Today
                      </span>
                    )}
                    {Number(p.pending_labs) > 0 && (
                      <span className="text-xs text-gray-400">{p.pending_labs} pending</span>
                    )}
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
