import { useState, useEffect } from 'react';
import { format, parseISO, addDays, startOfWeek, isSameDay } from 'date-fns';
import { appointmentsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { AppointmentStatusBadge } from '../../components/ui/Badge';
import { Appointment } from '../../types';
import { ChevronLeft, ChevronRight, Calendar, Video, MapPin } from 'lucide-react';

export default function ProviderSchedule() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  useEffect(() => {
    appointmentsApi.list().then(res => setAppointments(res.data)).finally(() => setLoading(false));
  }, []);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 9 }, (_, i) => i + 8); // 8am - 4pm

  const apptsByDay = (day: Date) =>
    appointments.filter(a =>
      !['cancelled', 'no_show'].includes(a.status) &&
      isSameDay(parseISO(a.scheduled_at), day)
    ).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Week of {format(weekStart, 'MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="btn-secondary p-2"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="btn-secondary text-sm"
          >
            This Week
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="btn-secondary p-2"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Weekly view */}
      <div className="card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 border-b border-gray-200">
          <div className="py-3 px-3 border-r border-gray-100 bg-gray-50" />
          {weekDays.map(day => {
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                className={`py-3 px-2 text-center border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-cisco-blue/5' : 'bg-gray-50'}`}
              >
                <div className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-cisco-blue' : 'text-gray-400'}`}>
                  {format(day, 'EEE')}
                </div>
                <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-cisco-blue' : 'text-gray-700'}`}>
                  {format(day, 'd')}
                </div>
                <div className="text-xs text-gray-400">{apptsByDay(day).length} appts</div>
              </div>
            );
          })}
        </div>

        {/* Time slots */}
        <div className="overflow-y-auto max-h-[600px]">
          {hours.map(hour => (
            <div key={hour} className="grid grid-cols-8 border-b border-gray-100 min-h-[72px]">
              <div className="py-2 px-3 border-r border-gray-100 flex-shrink-0">
                <span className="text-xs text-gray-400 font-mono">
                  {format(new Date(2000, 0, 1, hour), 'h:mm a')}
                </span>
              </div>
              {weekDays.map(day => {
                const dayAppts = apptsByDay(day).filter(a => {
                  const apptHour = parseISO(a.scheduled_at).getHours();
                  return apptHour === hour;
                });
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={day.toISOString()}
                    className={`p-1 border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-cisco-blue/3' : ''}`}
                  >
                    {dayAppts.map(appt => (
                      <div
                        key={appt.id}
                        className={`rounded-lg px-2 py-1.5 mb-1 text-xs cursor-pointer transition-shadow hover:shadow-md ${
                          appt.status === 'completed' ? 'bg-green-100 border border-green-200' :
                          appt.status === 'checked_in' ? 'bg-amber-100 border border-amber-200' :
                          'bg-cisco-blue/10 border border-cisco-blue/20'
                        }`}
                      >
                        <div className="font-semibold text-gray-800 truncate">
                          {appt.patient_first} {appt.patient_last}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                          {appt.type === 'telehealth' ? <Video size={10} /> : <MapPin size={10} />}
                          <span className="truncate capitalize">{appt.type.replace('_', ' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* List view for week */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">This Week's Appointments</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {weekDays.flatMap(day =>
            apptsByDay(day).map(appt => ({ ...appt, _day: day }))
          ).length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No appointments this week</div>
          ) : (
            weekDays.flatMap(day =>
              apptsByDay(day).map(appt => (
                <div key={appt.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-24 text-xs text-gray-500 flex-shrink-0">
                    <div className="font-medium text-gray-700">{format(day, 'EEE, MMM d')}</div>
                    <div>{format(parseISO(appt.scheduled_at), 'h:mm a')}</div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">
                      {appt.patient_first} {appt.patient_last}
                    </div>
                    <div className="text-xs text-gray-400">
                      MRN: {appt.mrn} &middot; {appt.type.replace('_', ' ')}
                    </div>
                  </div>
                  <AppointmentStatusBadge status={appt.status} />
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
