/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cisco: {
          blue:        '#049FD9',
          'dark-blue': '#1D4289',
          cyan:        '#00BCEB',
          green:       '#6EBE4A',
          orange:      '#FBAB18',
          red:         '#E2231A',
          gray:        '#58585B',
          'light-gray':'#F5F6F7',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card:       '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-hover':'0 4px 12px 0 rgba(0,0,0,0.12)',
        header:     '0 1px 3px 0 rgba(0,0,0,0.15)',
      },
      keyframes: {
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse2: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        ticker: 'ticker 40s linear infinite',
        fadeIn: 'fadeIn 0.35s ease-out forwards',
        pulse2: 'pulse2 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
