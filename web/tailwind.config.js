/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark is the default surface set; light mode remaps these in index.css.
        bg: 'var(--c-bg)',
        surface: 'var(--c-surface)',
        line: 'var(--c-border)',
        ink: 'var(--c-text)',
        muted: 'var(--c-muted)',
        accent: 'var(--c-accent)',
        refusal: 'var(--c-refusal)',
        pending: 'var(--c-pending)',
        fairness: 'var(--c-fairness)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      maxWidth: { console: '1280px' },
      keyframes: {
        'row-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { 'row-in': 'row-in 300ms ease-out' },
    },
  },
  plugins: [],
};
