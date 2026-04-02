import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { appointmentsApi, providersApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { AppointmentStatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Appointment, Provider } from '../../types';
import { Calendar, Plus, MapPin, Clock, User, X } from 'lucide-react';

const APPT_TYPES = [
  { value: 'office_visit', label: 'Office Visit' },
  { value: 'telehealth', label: 'Telehealth' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'annual_wellness', label: 'Annual Wellness Exam' },
];

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [showSchedule, setShowSchedule] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [form, setForm] = useState({
    providerId: '', date: '', time: '', type: 'office_visit', chiefComplaint: '',
  });
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    Promise.all([
      appointmentsApi.list(),
      providersApi.list(),
    ]).then(([appts, provs]) => {
      setAppointments(appts.data);
      setProviders(provs.data);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = appointments.filter((a) => {
    if (tab === 'upcoming') return ['scheduled', 'checked_in'].includes(a.status);
    if (tab === 'past') return a.status === 'completed';
    return a.status === 'cancelled' || a.status === 'no_show';
  });

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this appointment?')) return;
    setCancelling(id);
    try {
      await appointmentsApi.cancel(id);
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
    } finally {
      setCancelling(null);
    }
  };

  const handleSchedule = async () => {
    if (!form.providerId || !form.date || !form.time) {
      setScheduleError('Please fill in all required fields');
      return;
    }
    setScheduling(true);
    setScheduleError('');
    try {
      const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();
      const res = await appointmentsApi.create({
        providerId: form.providerId,
        scheduledAt,
        type: form.type,
        chiefComplaint: form.chiefComplaint,
      });
      setAppointments(prev => [res.data, ...prev]);
      setShowSchedule(false);
      setForm({ providerId: '', date: '', time: '', type: 'office_visit', chiefComplaint: '' });
    } catch (err: any) {
      setScheduleError(err.response?.data?.error || 'Scheduling failed');
    } finally {
      setScheduling(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and manage your healthcare visits</p>
        </div>
        <button onClick={() => setShowSchedule(true)} className="btn-primary">
          <Plus size={16} />
          Schedule Appointment
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['upcoming', 'past', 'cancelled'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-white text-cisco-dark-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Appointments list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Calendar size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No {tab} appointments</p>
            {tab === 'upcoming' && (
              <button onClick={() => setShowSchedule(true)} className="btn-primary mt-4 mx-auto">
                Schedule an Appointment
              </button>
            )}
          </div>
        ) : (
          filtered.map((appt) => (
            <div key={appt.id} className="card p-5 hover:shadow-card-hover transition-shadow">
              <div className="flex items-start gap-5">
                {/* Date block */}
                <div className="text-center bg-cisco-blue/10 rounded-xl p-3 min-w-[64px] flex-shrink-0">
                  <div className="text-xs font-semibold text-cisco-blue uppercase">
                    {format(parseISO(appt.scheduled_at), 'MMM')}
                  </div>
                  <div className="text-2xl font-bold text-cisco-dark-blue leading-tight">
                    {format(parseISO(appt.scheduled_at), 'd')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {format(parseISO(appt.scheduled_at), 'yyyy')}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">
                        Dr. {appt.provider_first} {appt.provider_last}
                      </div>
                      <div className="text-sm text-gray-500">{appt.specialty}</div>
                    </div>
                    <AppointmentStatusBadge status={appt.status} />
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Clock size={13} className="text-gray-400" />
                      {format(parseISO(appt.scheduled_at), 'EEEE, MMMM d')} at{' '}
                      {format(parseISO(appt.scheduled_at), 'h:mm a')}
                      {' '}({appt.duration_minutes} min)
                    </div>
                    {appt.location && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <MapPin size={13} className="text-gray-400" />
                        {appt.location}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <User size={13} className="text-gray-400" />
                      {appt.type.replace('_', ' ')}
                    </div>
                  </div>

                  {appt.chief_complaint && (
                    <div className="mt-2 text-xs text-gray-500 italic">
                      Reason: {appt.chief_complaint}
                    </div>
                  )}

                  {appt.status === 'scheduled' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleCancel(appt.id)}
                        disabled={cancelling === appt.id}
                        className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:text-cisco-red transition-colors"
                      >
                        Cancel Appointment
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Schedule Modal */}
      <Modal
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        title="Schedule an Appointment"
        size="md"
        footer={
          <>
            <button onClick={() => setShowSchedule(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSchedule} disabled={scheduling} className="btn-primary">
              {scheduling ? 'Scheduling...' : 'Confirm Appointment'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="form-label">Provider *</label>
            <select
              className="form-input"
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
            >
              <option value="">Select a provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  Dr. {p.first_name} {p.last_name} — {p.specialty}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Date *</label>
              <input
                type="date"
                className="form-input"
                value={form.date}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Time *</label>
              <select
                className="form-input"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              >
                <option value="">Select time</option>
                {['09:00','09:30','10:00','10:30','11:00','11:30',
                  '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'].map(t => (
                  <option key={t} value={t}>{format(new Date(`2000-01-01T${t}`), 'h:mm a')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Appointment Type</label>
            <select
              className="form-input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {APPT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Reason for Visit</label>
            <textarea
              className="form-input resize-none"
              rows={3}
              placeholder="Brief description of your symptoms or reason for visit..."
              value={form.chiefComplaint}
              onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })}
            />
          </div>

          {scheduleError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {scheduleError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
