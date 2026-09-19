/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--c-bg)',
        surface: 'var(--c-surface)',
        raised: 'var(--c-raised)',
        line: 'var(--c-border)',
        ink: 'var(--c-text)',
        muted: 'var(--c-muted)',
        accent: 'var(--c-accent)',
        'on-accent': 'var(--c-on-accent)',
        fairness: 'var(--c-fairness)',
        pending: 'var(--c-pending)',
        refusal: 'var(--c-refusal)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        hero: ['clamp(2rem, 4.5vw, 3.25rem)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        section: ['clamp(1.4rem, 2.2vw, 1.75rem)', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        result: ['clamp(3rem, 7vw, 4.5rem)', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      maxWidth: { console: '1320px' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.20), 0 8px 24px -12px rgba(0,0,0,0.45)',
        lift: '0 2px 6px rgba(0,0,0,0.25), 0 18px 40px -18px rgba(0,0,0,0.55)',
      },
    },
  },
  plugins: [],
}
