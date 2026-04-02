import { useState, useEffect } from 'react';
import { adminApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { Building2, Phone, MapPin, Users, Calendar } from 'lucide-react';

export default function Departments() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.departments().then(r => setDepartments(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
        <p className="text-sm text-gray-500 mt-0.5">{departments.length} clinical departments</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {departments.map(dept => (
          <div key={dept.id} className="card p-5 hover:shadow-card-hover transition-shadow">
            <div className="flex items-start gap-3">
              <div className="bg-cisco-blue/10 p-3 rounded-xl">
                <Building2 size={20} className="text-cisco-blue" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{dept.name}</h3>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                  <MapPin size={11} className="text-gray-400" />
                  {dept.location}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                  <Phone size={11} className="text-gray-400" />
                  {dept.phone}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
              <div className="text-center">
                <div className="text-lg font-bold text-cisco-dark-blue">{dept.provider_count}</div>
                <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Users size={10} /> Providers
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cisco-blue">{dept.appointment_count_30d}</div>
                <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Calendar size={10} /> Appts (30d)
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
