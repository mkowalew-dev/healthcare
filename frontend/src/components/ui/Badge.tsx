import { clsx } from 'clsx';

type Variant = 'normal' | 'abnormal' | 'critical' | 'pending' | 'success' | 'warning' | 'error' | 'info' | 'gray';

interface Props {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const variants: Record<Variant, string> = {
  normal: 'bg-green-100 text-green-700',
  success: 'bg-green-100 text-green-700',
  abnormal: 'bg-amber-100 text-amber-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-600',
  gray: 'bg-gray-100 text-gray-600',
  info: 'bg-blue-100 text-cisco-blue',
};

export function Badge({ variant = 'gray', children, className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function LabStatusBadge({ status }: { status: string }) {
  const map: Record<string, Variant> = {
    resulted: 'normal',
    pending: 'pending',
    abnormal: 'abnormal',
    critical: 'critical',
  };
  const labels: Record<string, string> = {
    resulted: 'Normal',
    pending: 'Pending',
    abnormal: 'Abnormal',
    critical: 'Critical',
  };
  return <Badge variant={map[status] || 'gray'}>{labels[status] || status}</Badge>;
}

export function AppointmentStatusBadge({ status }: { status: string }) {
  const map: Record<string, Variant> = {
    scheduled: 'info',
    completed: 'success',
    cancelled: 'gray',
    no_show: 'error',
    checked_in: 'warning',
  };
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
    checked_in: 'Checked In',
  };
  return <Badge variant={map[status] || 'gray'}>{labels[status] || status}</Badge>;
}

export function BillStatusBadge({ status }: { status: string }) {
  const map: Record<string, Variant> = {
    pending: 'warning',
    partial: 'info',
    paid: 'success',
    overdue: 'error',
    in_review: 'gray',
  };
  const labels: Record<string, string> = {
    pending: 'Due',
    partial: 'Partial',
    paid: 'Paid',
    overdue: 'Overdue',
    in_review: 'In Review',
  };
  return <Badge variant={map[status] || 'gray'}>{labels[status] || status}</Badge>;
}

export function MedStatusBadge({ status }: { status: string }) {
  const map: Record<string, Variant> = {
    active: 'success',
    discontinued: 'gray',
    completed: 'info',
    on_hold: 'warning',
  };
  return <Badge variant={map[status] || 'gray'}>{status.replace('_', ' ')}</Badge>;
}

export function AllergySeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, Variant> = {
    mild: 'warning',
    moderate: 'abnormal',
    severe: 'critical',
    life_threatening: 'critical',
  };
  return (
    <Badge variant={map[severity] || 'gray'}>
      {severity.replace('_', ' ')}
    </Badge>
  );
}
