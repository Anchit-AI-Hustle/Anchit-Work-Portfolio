'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * White dot replacing the pointer. It SNAPS to the centre of a project link or
 * a footer social — magnetic in the true sense, not merely enlarged: the target
 * pulls the cursor, so the interface feels like it has mass.
 */
export default function Cursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 700, damping: 42, mass: 0.45 });
  const sy = useSpring(y, { stiffness: 700, damping: 42, mass: 0.45 });
  const [mode, setMode] = useState<'dot' | 'link' | 'hold'>('dot');
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    setOn(true);

    let target: HTMLElement | null = null;

    const move = (e: PointerEvent) => {
      if (target) {
        // Snap toward the target's centre, easing off with distance so it
        // releases naturally instead of sticking.
        const r = target.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        x.set(e.clientX + (cx - e.clientX) * 0.32);
        y.set(e.clientY + (cy - e.clientY) * 0.32);
      } else {
        x.set(e.clientX);
        y.set(e.clientY);
      }
    };

    const over = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      const hold = t.closest('[data-cursor="hold"]') as HTMLElement | null;
      if (hold) { target = null; return setMode('hold'); }
      const link = t.closest('[data-build],[data-magnetic],a,button') as HTMLElement | null;
      target = link;
      setMode(link ? 'link' : 'dot');
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerover', over, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerover', over);
    };
  }, [x, y]);

  if (!on) return null;
  const size = mode === 'dot' ? 8 : mode === 'link' ? 56 : 84;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] rounded-full mix-blend-difference"
      style={{ x: sx, y: sy, translateX: '-50%', translateY: '-50%', borderColor: '#FFFFFF', borderStyle: 'solid' }}
      animate={{
        width: size,
        height: size,
        backgroundColor: mode === 'dot' ? '#FFFFFF' : 'rgba(255,255,255,0)',
        borderWidth: mode === 'dot' ? 0 : 1,
      }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    />
  );
}
