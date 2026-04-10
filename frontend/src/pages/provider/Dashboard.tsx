import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, isToday } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { appointmentsApi, messagesApi, patientsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { AppointmentStatusBadge } from '../../components/ui/Badge';
import { Provider, Appointment, Message } from '../../types';
import {
  Users, Calendar, MessageSquare, Clock, ChevronRight,
  AlertTriangle, CheckCircle, Activity, Stethoscope,
} from 'lucide-react';

export default function ProviderDashboard() {
  const { profile } = useAuth();
  const provider = profile as Provider;
  const [loading, setLoading] = useState(true);
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [patientCount, setPatientCount] = useState(0);

  useEffect(() => {
    Promise.all([
      appointmentsApi.list(),
      messagesApi.inbox(),
      patientsApi.list(),
    ]).then(([appts, msgs, patients]) => {
      const today = appts.data.filter((a: Appointment) =>
        isToday(parseISO(a.scheduled_at))
      );
      setTodayAppts(today);
      setMessages(msgs.data.slice(0, 5));
      setPatientCount(patients.data.length);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  const today = format(new Date(), 'EEEE, MMMM d');
  const completedToday = todayAppts.filter(a => a.status === 'completed').length;
  const remainingToday = todayAppts.filter(a => ['scheduled', 'checked_in'].includes(a.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cisco-dark-blue to-[#1a3a7a] rounded-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/60 text-sm">{today}</p>
            <h1 className="text-2xl font-bold mt-1">
              Dr. {provider?.first_name} {provider?.last_name}
            </h1>
            <p className="text-white/70 text-sm mt-0.5">
              {provider?.specialty} &middot; {provider?.department_name}
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <Stethoscope size={28} className="text-white" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-white/20">
          {[
            { label: "Today's Patients", value: todayAppts.length, testId: 'stat-today-patients' },
            { label: 'Completed', value: completedToday, testId: 'stat-completed' },
            { label: 'Remaining', value: remainingToday, testId: 'stat-remaining' },
            { label: 'Total Patients', value: patientCount, testId: 'stat-total-patients' },
          ].map(({ label, value, testId }) => (
            <div key={label} className="text-center" data-testid={testId}>
              <div className="text-2xl font-bold" data-testid={`${testId}-value`}>{value}</div>
              <div className="text-white/60 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Today's Schedule</h2>
              </div>
              <Link to="/provider/schedule" className="text-xs text-cisco-blue hover:underline flex items-center gap-1" data-testid="link-full-schedule">
                Full schedule <ChevronRight size={12} />
              </Link>
            </div>

            <div className="divide-y divide-gray-100">
              {todayAppts.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500" data-testid="schedule-empty">
                  No appointments scheduled for today
                </div>
              ) : (
                todayAppts
                  .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
                  .map((appt) => (
                    <div key={appt.id} className="px-5 py-4 hover:bg-gray-50 transition-colors" data-testid={`schedule-appt-${appt.id}`}>
                      <div className="flex items-center gap-4">
                        <div className="text-center w-14 flex-shrink-0">
                          <div className="text-sm font-bold text-cisco-dark-blue" data-testid="appt-time">
                            {format(parseISO(appt.scheduled_at), 'h:mm')}
                          </div>
                          <div className="text-xs text-gray-400">
                            {format(parseISO(appt.scheduled_at), 'a')}
                          </div>
                        </div>
                        <div className="w-px h-10 bg-gray-200 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <Link
                                to={`/provider/patients/${appt.patient_id}`}
                                className="font-medium text-gray-900 hover:text-cisco-blue text-sm"
                                data-testid="appt-patient-name"
                              >
                                {appt.patient_first} {appt.patient_last}
                              </Link>
                              <div className="text-xs text-gray-500" data-testid="appt-mrn">MRN: {appt.mrn}</div>
                            </div>
                            <AppointmentStatusBadge status={appt.status} data-testid="appt-status" />
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                            <span className="capitalize" data-testid="appt-type">{appt.type.replace('_', ' ')}</span>
                            {appt.chief_complaint && <span data-testid="appt-complaint">— {appt.chief_complaint}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { to: '/provider/patients', icon: Users, label: 'View My Patients', color: 'text-cisco-blue', testId: 'quick-action-patients' },
                { to: '/provider/schedule', icon: Calendar, label: 'View Schedule', color: 'text-cisco-dark-blue', testId: 'quick-action-schedule' },
                { to: '/provider/messages', icon: MessageSquare, label: 'Messages', color: 'text-cisco-cyan', testId: 'quick-action-messages' },
              ].map(({ to, icon: Icon, label, color, testId }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  data-testid={testId}
                >
                  <Icon size={18} className={color} />
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <ChevronRight size={14} className="text-gray-300 ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Messages */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-cisco-blue" />
                <h2 className="font-semibold text-gray-900">Recent Messages</h2>
              </div>
              <Link to="/provider/messages" className="text-xs text-cisco-blue hover:underline" data-testid="link-all-messages">View all</Link>
            </div>
            <div className="divide-y divide-gray-100">
              {messages.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500" data-testid="messages-empty">No messages</div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`px-5 py-3 hover:bg-gray-50 ${!msg.read_at ? 'bg-blue-50/40' : ''}`} data-testid={`message-${msg.id}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${!msg.read_at ? 'font-semibold' : 'font-medium'} text-gray-800`} data-testid="message-sender">
                        {msg.sender_name}
                      </span>
                      <span className="text-xs text-gray-400" data-testid="message-date">{format(parseISO(msg.sent_at), 'MM/dd')}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate" data-testid="message-subject">{msg.subject}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
