/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ARIA design system
        aria: {
          bg:      '#000000',
          surface: '#121212',
          card:    '#1e1e1e',
          border:  '#2d2d2d',
          blue:    '#1a73e8',
          'blue-hover': '#1557b0',
          text:    '#e8eaed',
          dim:     '#9aa0a6',
          muted:   '#5f6368',
        },
        // Keep for LiveStreamPanel risk badges
        disaster: { DEFAULT: '#dc2626', dim: '#7f1d1d', badge: '#fca5a5' },
        moonshot: { DEFAULT: '#7c3aed', dim: '#4c1d95', badge: '#c4b5fd' },
        safe:     { DEFAULT: '#22c55e' },
        warn:     { DEFAULT: '#eab308' },
        blocked:  { DEFAULT: '#dc2626', badge: '#fca5a5' },
        // Legacy aether (LiveStream still uses these class names)
        aether: {
          bg:      '#000000',
          surface: '#121212',
          card:    '#1e1e1e',
          border:  '#2d2d2d',
          accent:  '#1a73e8',
          muted:   '#5f6368',
          text:    '#e8eaed',
          dim:     '#9aa0a6',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'bounce':     'bounce 1s infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      maxWidth: { 'chat': '48rem' },
    },
  },
  plugins: [],
}
