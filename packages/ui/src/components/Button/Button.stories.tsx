import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Download, Trash2 } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'danger', 'ghost'] },
    size:    { control: 'select', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Order Labs' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'View Chart' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Discontinue' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Cancel' },
};

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: 'Saving...' },
};

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: 'Order Labs' },
};

export const Small: Story = {
  args: { variant: 'primary', size: 'sm', children: 'Add Note' },
};

export const Large: Story = {
  args: { variant: 'primary', size: 'lg', children: 'Schedule Appointment' },
};

export const WithLeftIcon: Story = {
  name: 'With Left Icon',
  args: { variant: 'primary', children: 'New Order', leftIcon: <Plus size={14} /> },
};

export const WithRightIcon: Story = {
  name: 'With Right Icon',
  args: { variant: 'secondary', children: 'Export', rightIcon: <Download size={14} /> },
};

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger" leftIcon={<Trash2 size={14} />}>Danger</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
};

export const SizeScale: Story = {
  name: 'Size Scale',
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};
