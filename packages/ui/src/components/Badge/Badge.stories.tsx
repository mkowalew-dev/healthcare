import type { Meta, StoryObj } from '@storybook/react';
import {
  Badge,
  LabStatusBadge,
  AppointmentStatusBadge,
  BillStatusBadge,
  MedStatusBadge,
  AllergySeverityBadge,
} from './Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['normal', 'abnormal', 'critical', 'pending', 'success', 'warning', 'error', 'info', 'gray'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = { args: { variant: 'normal', children: 'Normal' } };
export const Abnormal: Story = { args: { variant: 'abnormal', children: 'Abnormal' } };
export const Critical: Story = { args: { variant: 'critical', children: 'Critical' } };
export const Pending: Story = { args: { variant: 'pending', children: 'Pending' } };
export const Info: Story = { args: { variant: 'info', children: 'Scheduled' } };
export const Warning: Story = { args: { variant: 'warning', children: 'Warning' } };

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['normal', 'abnormal', 'critical', 'pending', 'success', 'warning', 'error', 'info', 'gray'] as const).map(v => (
        <Badge key={v} variant={v}>{v}</Badge>
      ))}
    </div>
  ),
};

export const LabStatuses: Story = {
  name: 'Lab Statuses',
  render: () => (
    <div className="flex gap-2">
      {['resulted', 'pending', 'abnormal', 'critical'].map(s => (
        <LabStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const AppointmentStatuses: Story = {
  name: 'Appointment Statuses',
  render: () => (
    <div className="flex flex-wrap gap-2">
      {['scheduled', 'completed', 'cancelled', 'no_show', 'checked_in'].map(s => (
        <AppointmentStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const BillStatuses: Story = {
  name: 'Bill Statuses',
  render: () => (
    <div className="flex gap-2">
      {['pending', 'partial', 'paid', 'overdue', 'in_review'].map(s => (
        <BillStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const MedStatuses: Story = {
  name: 'Medication Statuses',
  render: () => (
    <div className="flex gap-2">
      {['active', 'discontinued', 'completed', 'on_hold'].map(s => (
        <MedStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const AllergySeverities: Story = {
  name: 'Allergy Severities',
  render: () => (
    <div className="flex gap-2">
      {['mild', 'moderate', 'severe', 'life_threatening'].map(s => (
        <AllergySeverityBadge key={s} severity={s} />
      ))}
    </div>
  ),
};
