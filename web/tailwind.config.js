/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light is the default set; src/index.css remaps these for dark.
        bg: 'var(--c-bg)',
        surface: 'var(--c-surface)',
        subtle: 'var(--c-subtle)',
        raised: 'var(--c-raised)',
        line: 'var(--c-border)',
        'line-strong': 'var(--c-border-strong)',
        ink: 'var(--c-text)',
        'ink-2': 'var(--c-text-2)',
        muted: 'var(--c-muted)',
        accent: 'var(--c-accent)',
        'accent-hover': 'var(--c-accent-hover)',
        'accent-text': 'var(--c-accent-text)',
        'accent-vivid': 'var(--c-accent-vivid)',
        'accent-soft': 'var(--c-accent-soft)',
        'accent-border': 'var(--c-accent-border)',
        'on-accent': 'var(--c-on-accent)',
        fairness: 'var(--c-fairness)',
        'fairness-vivid': 'var(--c-fairness-vivid)',
        'fairness-soft': 'var(--c-fairness-soft)',
        pending: 'var(--c-pending)',
        'pending-vivid': 'var(--c-pending-vivid)',
        'pending-soft': 'var(--c-pending-soft)',
        refusal: 'var(--c-refusal)',
        'refusal-vivid': 'var(--c-refusal-vivid)',
        'refusal-soft': 'var(--c-refusal-soft)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        hero: ['clamp(2.25rem, 3.6vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        section: ['clamp(1.35rem, 2vw, 1.65rem)', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        result: ['clamp(2.75rem, 6vw, 4rem)', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      maxWidth: { console: '1320px' },
      boxShadow: {
        card: '0 1px 2px var(--c-shadow-1)',
        lift: '0 1px 2px var(--c-shadow-1), 0 8px 24px -14px var(--c-shadow-2)',
      },
    },
  },
  plugins: [],
}
