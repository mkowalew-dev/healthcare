import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { notificationsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import {
  Bell, CheckCircle, XCircle, Clock, AlertTriangle,
  Pill, Calendar, MessageSquare, Mail, Phone,
} from 'lucide-react';

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  lab_critical:         { label: 'Critical Lab Alert', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  appointment_reminder: { label: 'Appointment Reminder', icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
  prescription_ready:   { label: 'Prescription Ready', icon: Pill, color: 'text-purple-600', bg: 'bg-purple-50' },
  message_received:     { label: 'New Message', icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50' },
  general:              { label: 'General', icon: Bell, color: 'text-gray-600', bg: 'bg-gray-50' },
};

const CHANNEL_ICON: Record<string, React.ElementType> = {
  sms: Phone, email: Mail, both: Bell,
};

export default function PatientNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    notificationsApi.list({}).then(res => {
      setNotifications(res.data);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);

  const counts = notifications.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell size={24} className="text-cisco-blue" />
          Notifications
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">SMS and email alerts from your care team</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(TYPE_CONFIG).slice(0, 4).map(([type, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={type} className={`stat-card cursor-pointer border-2 transition-colors ${filter === type ? 'border-cisco-blue' : 'border-transparent'}`}
              onClick={() => setFilter(filter === type ? 'all' : type)}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">{cfg.label}</span>
                <div className={`w-7 h-7 rounded-full ${cfg.bg} flex items-center justify-center`}>
                  <Icon size={14} className={cfg.color} />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{counts[type] || 0}</div>
            </div>
          );
        })}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === 'all' ? 'bg-cisco-blue text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-cisco-blue'}`}
        >
          All ({notifications.length})
        </button>
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          if (!counts[type]) return null;
          return (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? 'all' : type)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === type ? 'bg-cisco-blue text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-cisco-blue'}`}
            >
              {cfg.label} ({counts[type]})
            </button>
          );
        })}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          <p>No notifications yet.</p>
          <p className="text-sm mt-1">You'll receive alerts here for lab results, appointments, and prescriptions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => {
            const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general;
            const Icon = cfg.icon;
            const ChannelIcon = CHANNEL_ICON[n.channel] || Bell;
            return (
              <div
                key={n.id}
                className={`bg-white rounded-xl border border-gray-200 p-4 flex gap-4 ${n.type === 'lab_critical' ? 'border-red-200' : ''}`}
              >
                <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{cfg.label}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${n.status === 'sent' ? 'bg-green-100 text-green-800' : n.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                      {n.status === 'sent' ? <CheckCircle size={9} /> : n.status === 'failed' ? <XCircle size={9} /> : <Clock size={9} />}
                      {n.status}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <ChannelIcon size={11} />
                      {n.channel.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{n.body}</p>
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
                    {n.sent_at && (
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {format(parseISO(n.sent_at), 'MMMM d, yyyy h:mm a')}
                      </span>
                    )}
                    {n.sms_latency_ms && (
                      <span>SMS: {n.sms_latency_ms}ms</span>
                    )}
                    {n.email_latency_ms && (
                      <span>Email: {n.email_latency_ms}ms</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
