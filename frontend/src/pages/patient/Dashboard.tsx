import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isAfter } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { appointmentsApi, billsApi, labsApi, medicationsApi, messagesApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { AppointmentStatusBadge, LabStatusBadge, BillStatusBadge } from '../../components/ui/Badge';
import {
  Calendar, CreditCard, FlaskConical, Pill, MessageSquare, ChevronRight,
  AlertTriangle, Clock, TrendingUp, Heart,
} from 'lucide-react';
import { Patient, Appointment, Bill, LabResult, Medication } from '../../types';

export default function PatientDashboard() {
  const { profile } = useAuth();
  const patient = profile as Patient;
  const [loading, setLoading] = useState(true);
  const [upcomingAppts, setUpcomingAppts] = useState<Appointment[]>([]);
  const [recentLabs, setRecentLabs] = useState<LabResult[]>([]);
  const [activeMeds, setActiveMeds] = useState<Medication[]>([]);
  const [billSummary, setBillSummary] = useState({ total_owed: 0, overdue: 0, paid_ytd: 0, pending_count: 0 });
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    Promise.all([
      appointmentsApi.list({ upcoming: 'true' }),
      labsApi.list(),
      medicationsApi.list({ status: 'active' }),
      billsApi.summary(),
      messagesApi.unreadCount(),
    ])
      .then(([appts, labs, meds, billSum, msgs]) => {
        const sorted = [...appts.data].sort((a: Appointment, b: Appointment) =>
          a.scheduled_at.localeCompare(b.scheduled_at)
        );
        setUpcomingAppts(sorted.slice(0, 3));
        setRecentLabs(labs.data.filter((l: LabResult) => l.status !== 'pending').slice(0, 5));
        setActiveMeds(meds.data.slice(0, 5));
        setBillSummary(billSum.data);
        setUnreadMessages(msgs.data.count);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  // Strip timezone offset so appointment times display as stored (not converted to browser tz)
  const parseApptDate = (iso: string) => parseISO(iso.replace('Z', '').replace(/[+-]\d{2}:\d{2}$/, ''));

  const today = format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-cisco-dark-blue to-cisco-blue rounded-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-sm">{today}</p>
            <h1 className="text-2xl font-bold mt-1">
              Good {getTimeOfDay()}, {patient?.first_name}
            </h1>
            <p className="text-white/70 text-sm mt-1">
              MRN: {patient?.mrn} &middot; {patient?.insurance_provider}
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
            <Heart size={28} className="text-white" />
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-white/20">
          {[
            { label: 'Upcoming Visits', value: upcomingAppts.length, to: '/patient/appointments' },
            { label: 'Amount Due', value: `$${Number(billSummary.total_owed).toFixed(2)}`, to: '/patient/billing' },
            { label: 'Active Meds', value: activeMeds.length, to: '/patient/medications' },
            { label: 'New Messages', value: unreadMessages, to: '/patient/messages' },
          ].map(({ label, value, to }) => (
            <Link key={label} to={to} className="text-center hover:bg-white/10 rounded-lg p-2 transition-colors"
              data-testid={`dashboard-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-white/60 text-xs mt-0.5">{label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {(billSummary.overdue > 0 || recentLabs.some(l => l.status === 'critical')) && (
        <div className="space-y-2">
          {billSummary.overdue > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle size={16} className="text-cisco-red flex-shrink-0" />
              <span className="text-sm text-red-700">
                You have <strong>${Number(billSummary.overdue).toFixed(2)}</strong> in overdue balances.{' '}
                <Link to="/patient/billing" className="underline font-medium">Pay now</Link>
              </span>
            </div>
          )}
          {recentLabs.some(l => l.status === 'critical') && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle size={16} className="text-cisco-red flex-shrink-0" />
              <span className="text-sm text-red-700">
                You have critical lab results that require attention.{' '}
                <Link to="/patient/labs" className="underline font-medium">View results</Link>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Appointments */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Upcoming Appointments</h2>
              </div>
              <Link to="/patient/appointments" className="text-xs text-cisco-blue hover:underline flex items-center gap-1">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {upcomingAppts.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-500">
                  No upcoming appointments.{' '}
                  <Link to="/patient/appointments" className="text-cisco-blue hover:underline">Schedule one</Link>
                </div>
              ) : (
                upcomingAppts.map((appt) => (
                  <div key={appt.id} className="px-5 py-4 hover:bg-gray-50 transition-colors" data-testid={`appointment-card-${appt.id}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        <div className="bg-cisco-blue/10 rounded-lg p-2.5 flex-shrink-0">
                          <Calendar size={16} className="text-cisco-blue" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">
                            Dr. {appt.provider_first} {appt.provider_last}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{appt.specialty}</div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Clock size={12} className="text-gray-400" />
                            <span className="text-xs text-gray-600">
                              {format(parseApptDate(appt.scheduled_at), 'EEE, MMM d, yyyy')} at{' '}
                              {format(parseApptDate(appt.scheduled_at), 'h:mm a')}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {appt.type.replace('_', ' ')} &middot; {appt.location}
                          </div>
                        </div>
                      </div>
                      <AppointmentStatusBadge status={appt.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Lab Results */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Recent Test Results</h2>
              </div>
              <Link to="/patient/labs" className="text-xs text-cisco-blue hover:underline flex items-center gap-1">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLabs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-gray-500 py-6">No recent results</td></tr>
                  ) : (
                    recentLabs.map((lab) => (
                      <tr key={lab.id}>
                        <td>
                          <div className="font-medium text-gray-800">{lab.test_name}</div>
                          {lab.panel_name && <div className="text-xs text-gray-400">{lab.panel_name}</div>}
                        </td>
                        <td>
                          <span className={`font-mono font-medium ${lab.status === 'abnormal' || lab.status === 'critical' ? 'text-cisco-red' : 'text-gray-800'}`}>
                            {lab.value || '—'} {lab.unit}
                          </span>
                        </td>
                        <td className="text-gray-500">{lab.reference_range || '—'}</td>
                        <td className="text-gray-500">
                          {lab.resulted_at ? format(parseISO(lab.resulted_at), 'MM/dd/yyyy') : '—'}
                        </td>
                        <td><LabStatusBadge status={lab.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { to: '/patient/appointments', icon: Calendar, label: 'Schedule Appointment', color: 'text-cisco-blue' },
                { to: '/patient/billing', icon: CreditCard, label: 'Pay a Bill', color: 'text-cisco-green' },
                { to: '/patient/messages', icon: MessageSquare, label: 'Message Provider', color: 'text-cisco-cyan' },
                { to: '/patient/medications', icon: Pill, label: 'Request Refill', color: 'text-cisco-orange' },
              ].map(({ to, icon: Icon, label, color }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  data-testid={`quick-action-${label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon size={18} className={color} />
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <ChevronRight size={14} className="text-gray-300 ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* Billing Summary */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Billing</h2>
              </div>
              <Link to="/patient/billing" className="text-xs text-cisco-blue hover:underline">View</Link>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Balance Due</span>
                <span className="font-semibold text-gray-900">${Number(billSummary.total_owed).toFixed(2)}</span>
              </div>
              {billSummary.overdue > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-cisco-red">Overdue</span>
                  <span className="font-semibold text-cisco-red">${Number(billSummary.overdue).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Paid This Year</span>
                <span className="font-semibold text-cisco-green">${Number(billSummary.paid_ytd).toFixed(2)}</span>
              </div>
              {billSummary.total_owed > 0 && (
                <Link to="/patient/billing" className="btn-primary w-full justify-center mt-2" data-testid="billing-pay-balance-link">
                  Pay Balance
                </Link>
              )}
            </div>
          </div>

          {/* Active Medications */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Pill size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Active Medications</h2>
              </div>
              <Link to="/patient/medications" className="text-xs text-cisco-blue hover:underline">View all</Link>
            </div>
            <div className="space-y-2">
              {activeMeds.slice(0, 4).map((med) => (
                <div key={med.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-cisco-green flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{med.name}</div>
                    <div className="text-xs text-gray-500">{med.dosage} &middot; {med.frequency}</div>
                  </div>
                </div>
              ))}
              {activeMeds.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-2">No active medications</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
