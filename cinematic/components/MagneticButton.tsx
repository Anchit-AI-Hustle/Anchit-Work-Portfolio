'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/** Pulls toward the cursor, then springs home. Strength is distance-scaled so
 *  it feels weighted rather than sticky. */
export default function MagneticButton({
  children, href, strength = 0.35,
}: { children: ReactNode; href: string; strength?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.5 });

  return (
    <motion.a
      ref={ref}
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noopener"
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      className="inline-flex items-center gap-2 border border-edge px-6 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-silver transition-colors duration-300 ease-cine hover:border-signal hover:text-signal"
    >
      {children}
    </motion.a>
  );
}
