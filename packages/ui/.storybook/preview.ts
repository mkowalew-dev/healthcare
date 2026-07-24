import type { Preview } from '@storybook/react';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'surface',
      values: [
        { name: 'white', value: '#ffffff' },
        { name: 'surface', value: '#F5F6F7' },
        { name: 'dark', value: '#111827' },
      ],
    },
  },
};

export default preview;
