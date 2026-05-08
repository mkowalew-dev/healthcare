/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Radiology workstation dark palette
        pacs: {
          bg:       '#0a0a0a',
          surface:  '#141414',
          panel:    '#1a1a1a',
          border:   '#2a2a2a',
          hover:    '#222222',
          accent:   '#3b82f6',
          'accent-dim': '#1d4ed8',
          muted:    '#6b7280',
          text:     '#e5e7eb',
          'text-dim': '#9ca3af',
        },
      },
    },
  },
  plugins: [],
};
