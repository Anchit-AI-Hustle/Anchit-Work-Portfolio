import type { Config } from 'tailwindcss';

/** The whole design system lives here, so a component never invents a value. */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#050505',        // deep space background
        silver: '#EAEAEA',      // primary text
        ash: '#8A8A8A',         // secondary / metadata
        edge: 'rgba(234,234,234,0.10)',
        signal: '#C6FF4F',      // the single accent — used sparingly, on purpose
      },
      fontFamily: {
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { tightest: '-0.045em' },
      transitionTimingFunction: { cine: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [],
} satisfies Config;
