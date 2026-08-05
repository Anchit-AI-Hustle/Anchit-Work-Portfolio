/** Mirrors the inline `tailwind.config` the CDN build used, so the generated
 *  stylesheet is a drop-in replacement for cdn.tailwindcss.com. */
module.exports = {
  content: [
    './index.html',
    './index-motion.html',
    './lifecycle-os-calendar.html',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', elev: 'var(--bg-elev)', ink: 'var(--ink)', dim: 'var(--ink-dim)',
        primary: 'var(--primary)', accent: 'var(--accent)', rule: 'var(--rule)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        serif: ['Fraunces', 'ui-serif', 'serif'],
      },
    },
  },
};
