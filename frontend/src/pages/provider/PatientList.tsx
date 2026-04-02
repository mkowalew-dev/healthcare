import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, differenceInYears } from 'date-fns';
import { patientsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { Patient } from '../../types';
import { Users, Search, ChevronRight, Calendar, AlertCircle } from 'lucide-react';

export default function PatientList() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    patientsApi.list().then(res => setPatients(res.data)).finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    return !q ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      p.mrn.toLowerCase().includes(q) ||
      p.phone?.includes(q);
  });

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Patients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{patients.length} patients in your care</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="form-input pl-9"
          placeholder="Search by name, MRN, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Patient list */}
      <div className="card overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Patient</th>
              <th>MRN</th>
              <th>Age / Gender</th>
              <th>Insurance</th>
              <th>Upcoming Appts</th>
              <th>Last Visit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500">
                  {search ? 'No patients match your search' : 'No patients found'}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const age = p.date_of_birth
                  ? differenceInYears(new Date(), parseISO(p.date_of_birth))
                  : null;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-cisco-blue/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-cisco-blue">
                            {p.first_name[0]}{p.last_name[0]}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{p.first_name} {p.last_name}</div>
                          <div className="text-xs text-gray-400">{p.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs text-gray-600">{p.mrn}</td>
                    <td className="text-gray-600 text-sm">{age}y &middot; {p.gender}</td>
                    <td className="text-gray-500 text-xs">{p.insurance_provider}</td>
                    <td>
                      {Number(p.upcoming_appointments) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-cisco-blue bg-cisco-blue/10 px-2 py-0.5 rounded-full">
                          <Calendar size={11} />
                          {p.upcoming_appointments}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="text-gray-500 text-xs">
                      {p.last_visit ? format(parseISO(p.last_visit), 'MMM d, yyyy') : 'No visits'}
                    </td>
                    <td>
                      <Link
                        to={`/provider/patients/${p.id}`}
                        className="inline-flex items-center gap-1 text-xs text-cisco-blue hover:underline"
                      >
                        Chart <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
