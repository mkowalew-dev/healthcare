import type { Meta, StoryObj } from '@storybook/react';
import { Search, User } from 'lucide-react';
import { Input } from './Input';

const meta = {
  title: 'Components/Input',
  component: Input,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Patient Name',
    placeholder: 'Search patients...',
  },
};

export const WithHint: Story = {
  name: 'With Hint',
  args: {
    label: 'Date of Birth',
    placeholder: 'MM/DD/YYYY',
    hint: 'Used to verify patient identity',
  },
};

export const WithError: Story = {
  name: 'With Error',
  args: {
    label: 'MRN',
    value: 'abc',
    error: 'MRN must be a 7-digit number',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Provider ID',
    value: 'PRV-00412',
    disabled: true,
  },
};

export const WithLeftIcon: Story = {
  name: 'With Left Icon',
  args: {
    label: 'Search',
    placeholder: 'Search patients, orders...',
    leftAdornment: <Search size={14} />,
  },
};

export const WithRightIcon: Story = {
  name: 'With Right Icon',
  args: {
    label: 'Assigned Provider',
    placeholder: 'Provider name',
    rightAdornment: <User size={14} />,
  },
};

export const NoLabel: Story = {
  name: 'No Label',
  args: {
    placeholder: 'Quick search...',
    leftAdornment: <Search size={14} />,
  },
};
