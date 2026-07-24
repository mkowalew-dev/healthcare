import type { Meta, StoryObj } from '@storybook/react';
import { Users, Activity, Calendar, AlertCircle } from 'lucide-react';
import { Card, CardHeader, StatCard } from './Card';
import { Button } from '../Button/Button';

const meta = {
  title: 'Components/Card',
  component: Card,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-80">
      <Card>
        <p className="text-sm text-gray-700">This is a basic card with default padding.</p>
      </Card>
    </div>
  ),
};

export const WithHeader: Story = {
  name: 'With Header',
  render: () => (
    <div className="w-80">
      <Card>
        <CardHeader
          title="Recent Orders"
          action={<Button variant="secondary" size="sm">View All</Button>}
        />
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex justify-between"><span>CBC Panel</span><span className="text-gray-400">2h ago</span></li>
          <li className="flex justify-between"><span>Lipid Panel</span><span className="text-gray-400">1d ago</span></li>
          <li className="flex justify-between"><span>HbA1c</span><span className="text-gray-400">3d ago</span></li>
        </ul>
      </Card>
    </div>
  ),
};

export const NoPadding: Story = {
  name: 'No Padding',
  render: () => (
    <div className="w-80">
      <Card padding={false}>
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">Custom padding control</p>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-500">Useful for tables, list items, or custom layouts.</p>
        </div>
      </Card>
    </div>
  ),
};

export const StatCardDefault: Story = {
  name: 'Stat Card',
  render: () => (
    <div className="w-48">
      <StatCard
        label="Patients Today"
        value={24}
        delta="+3 vs yesterday"
        deltaPositive
        icon={<Users size={16} />}
      />
    </div>
  ),
};

export const StatCardNegativeDelta: Story = {
  name: 'Stat Card — Negative Delta',
  render: () => (
    <div className="w-48">
      <StatCard
        label="Avg Wait (min)"
        value="18"
        delta="+4 vs yesterday"
        deltaPositive={false}
        icon={<Activity size={16} />}
      />
    </div>
  ),
};

export const StatCardRow: Story = {
  name: 'Stat Card Row',
  parameters: { layout: 'padded' },
  render: () => (
    <div className="grid grid-cols-4 gap-4 w-[720px]">
      <StatCard label="Appointments" value={12} delta="+2 today" deltaPositive icon={<Calendar size={16} />} />
      <StatCard label="Pending Labs" value={5} delta="-1 vs avg" deltaPositive icon={<Activity size={16} />} />
      <StatCard label="Active Patients" value={84} icon={<Users size={16} />} />
      <StatCard label="Critical Alerts" value={2} delta="Requires review" deltaPositive={false} icon={<AlertCircle size={16} />} />
    </div>
  ),
};
