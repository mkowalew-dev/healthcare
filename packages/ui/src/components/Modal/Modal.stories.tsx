import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Modal } from './Modal';

const meta = {
  title: 'Components/Modal',
  component: Modal,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl'] },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

function ModalDemo({ size = 'md' as 'sm' | 'md' | 'lg' | 'xl', withFooter = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="px-4 py-2 bg-cisco-blue text-white text-sm font-medium rounded-lg hover:bg-cisco-dark-blue transition-colors"
        onClick={() => setOpen(true)}
      >
        Open Modal
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Patient Discharge Summary"
        size={size}
        footer={
          withFooter ? (
            <>
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-cisco-blue rounded-lg hover:bg-cisco-dark-blue"
                onClick={() => setOpen(false)}
              >
                Confirm
              </button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Patient <strong>Jane Smith</strong> is being discharged following a 3-day admission
            for pneumonia. Vitals are stable and SpO₂ is 97% on room air.
          </p>
          <p className="text-sm text-gray-500">
            Follow-up appointment scheduled in 7 days with Dr. Martinez.
          </p>
        </div>
      </Modal>
    </>
  );
}

export const Default: Story = {
  render: () => <ModalDemo />,
};

export const Small: Story = {
  render: () => <ModalDemo size="sm" />,
};

export const Large: Story = {
  render: () => <ModalDemo size="lg" />,
};

export const WithFooter: Story = {
  name: 'With Footer',
  render: () => <ModalDemo withFooter />,
};
