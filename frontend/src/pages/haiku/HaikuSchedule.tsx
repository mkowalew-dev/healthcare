import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, differenceInYears, isAfter } from 'date-fns';
import { haikuApi } from '../../services/api';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Clock, MapPin, ChevronRight, CheckCircle, User, Calendar } from 'lucide-react';

interface ScheduleAppointment {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  type: string;
  status: string;
  chief_complaint: string;
  location: string;
  patient_id: string;
  patient_first: string;
  patient_last: string;
  mrn: string;
  date_of_birth: string;
  phone: string;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled:  'bg-blue-100 text-blue-700',
  checked_in: 'bg-green-100 text-green-700',
  completed:  'bg-gray-100 text-gray-500',
  no_show:    'bg-red-100 text-red-600',
  cancelled:  'bg-gray-100 text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled:  'Scheduled',
  checked_in: 'Checked In',
  completed:  'Completed',
  no_show:    'No Show',
  cancelled:  'Cancelled',
};

export default function HaikuSchedule() {
  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    haikuApi.schedule()
      .then(r => setAppointments(r.data))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const completed = appointments.filter(a => a.status === 'completed').length;
  const remaining = appointments.filter(a =>
    ['scheduled', 'checked_in'].includes(a.status) && isAfter(parseISO(a.scheduled_at), now)
  ).length;

  return (
    <div>
      {/* Header */}
      <div className="bg-[#0d274d] px-4 pt-12 pb-5">
        <p className="text-white/50 text-xs mb-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-white text-xl font-bold">Today's Schedule</h1>
        {appointments.length > 0 && (
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-white/40" />
              <span className="text-white/60 text-xs">{appointments.length} total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle size={12} className="text-green-400" />
              <span className="text-white/60 text-xs">{completed} done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-white/60" />
              <span className="text-white/60 text-xs">{remaining} remaining</span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <Calendar size={40} className="text-gray-200 mb-3" />
          <p className="text-gray-500 text-sm">No appointments scheduled for today</p>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          {appointments.map(appt => {
            const time = parseISO(appt.scheduled_at);
            const isPast = !isAfter(time, now);
            const age = differenceInYears(new Date(), parseISO(appt.date_of_birth));

            return (
              <Link
                key={appt.id}
                to={`/haiku/patients/${appt.patient_id}`}
                className={`flex gap-3 bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50 transition-colors ${
                  isPast && appt.status !== 'checked_in' ? 'opacity-60' : ''
                }`}
              >
                {/* Time column */}
                <div className="w-14 shrink-0 text-center pt-0.5">
                  <p className="text-sm font-bold text-gray-900">{format(time, 'h:mm')}</p>
                  <p className="text-xs text-gray-400">{format(time, 'a')}</p>
                  <p className="text-xs text-gray-300 mt-1">{appt.duration_minutes}m</p>
                </div>

                {/* Divider */}
                <div className="w-px bg-gray-100 shrink-0" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User size={14} className="text-gray-400 shrink-0" />
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {appt.patient_last}, {appt.patient_first}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      STATUS_STYLES[appt.status] ?? 'bg-gray-100 text-gray-500'
                    }`}>
                      {STATUS_LABELS[appt.status] ?? appt.status}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 mt-0.5 ml-[22px]">
                    {appt.mrn} · {age}y · {appt.type}
                  </p>

                  {appt.chief_complaint && (
                    <p className="text-xs text-gray-600 mt-1.5 bg-gray-50 rounded-lg px-2 py-1 truncate">
                      {appt.chief_complaint}
                    </p>
                  )}

                  {appt.location && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <MapPin size={10} className="text-gray-400" />
                      <p className="text-xs text-gray-400">{appt.location}</p>
                    </div>
                  )}
                </div>

                <ChevronRight size={16} className="text-gray-300 shrink-0 mt-1" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

