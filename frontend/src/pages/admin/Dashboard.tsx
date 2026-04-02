import { useState, useEffect } from 'react';
import { adminApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import {
  Users, Calendar, CreditCard, MessageSquare, Activity,
  UserCheck, Stethoscope, Building2, TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

const COLORS = ['#049FD9', '#1D4289', '#6EBE4A', '#FBAB18', '#E2231A'];

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [apptTrend, setApptTrend] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.stats(),
      adminApi.appointments(14),
      adminApi.departments(),
    ]).then(([s, a, d]) => {
      setStats(s.data);
      setApptTrend(a.data.map((r: any) => ({
        date: format(parseISO(r.date), 'MM/dd'),
        Total: parseInt(r.total),
        Completed: parseInt(r.completed),
        Cancelled: parseInt(r.cancelled),
      })));
      setDepartments(d.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  const userPieData = stats ? [
    { name: 'Patients', value: stats.usersByRole.patient || 0 },
    { name: 'Providers', value: stats.usersByRole.provider || 0 },
    { name: 'Admins', value: stats.usersByRole.admin || 0 },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">System overview and analytics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Users',
            value: stats?.totalUsers || 0,
            sub: `${stats?.usersByRole?.patient || 0} patients, ${stats?.usersByRole?.provider || 0} providers`,
            icon: Users,
            color: 'text-cisco-blue',
            bg: 'bg-cisco-blue/10',
          },
          {
            label: "Today's Appointments",
            value: stats?.appointmentsToday || 0,
            sub: 'Scheduled for today',
            icon: Calendar,
            color: 'text-cisco-dark-blue',
            bg: 'bg-cisco-dark-blue/10',
          },
          {
            label: 'Outstanding Bills',
            value: `$${Number(stats?.pendingBills?.amount || 0).toFixed(0)}`,
            sub: `${stats?.pendingBills?.count || 0} open statements`,
            icon: CreditCard,
            color: 'text-cisco-orange',
            bg: 'bg-cisco-orange/10',
          },
          {
            label: 'Unread Messages',
            value: stats?.unreadMessages || 0,
            sub: 'System-wide',
            icon: MessageSquare,
            color: 'text-cisco-green',
            bg: 'bg-cisco-green/10',
          },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${bg}`}>
                <Icon size={20} className={color} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-sm font-medium text-gray-600">{label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointment trend */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-cisco-blue" />
            <h2 className="font-semibold text-gray-900">Appointment Trend (14 Days)</h2>
          </div>
          {apptTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={apptTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Total" fill="#049FD9" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Completed" fill="#6EBE4A" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Cancelled" fill="#E2231A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              No appointment data available
            </div>
          )}
        </div>

        {/* User Distribution */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-cisco-blue" />
            <h2 className="font-semibold text-gray-900">User Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={userPieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {userPieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Departments table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Building2 size={18} className="text-cisco-blue" />
          <h2 className="font-semibold text-gray-900">Departments Overview</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Location</th>
              <th>Phone</th>
              <th>Providers</th>
              <th>Appts (30d)</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(d => (
              <tr key={d.id}>
                <td className="font-medium text-gray-900">{d.name}</td>
                <td className="text-gray-500 text-xs">{d.location}</td>
                <td className="text-gray-500 text-xs">{d.phone}</td>
                <td>
                  <span className="inline-flex items-center gap-1 text-xs bg-cisco-blue/10 text-cisco-blue px-2 py-0.5 rounded-full">
                    <Stethoscope size={10} />
                    {d.provider_count}
                  </span>
                </td>
                <td>
                  <span className="text-sm font-medium text-gray-700">{d.appointment_count_30d}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
