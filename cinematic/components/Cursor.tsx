'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/** Minimal dot that expands over anything interactive. Pointer-devices only. */
export default function Cursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 900, damping: 55, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 900, damping: 55, mass: 0.4 });
  const [variant, setVariant] = useState<'default' | 'link' | 'hold'>('default');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    setEnabled(true);

    const move = (e: PointerEvent) => { x.set(e.clientX); y.set(e.clientY); };
    const over = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-cursor="hold"]')) return setVariant('hold');
      setVariant(t.closest('a,button,[role="button"]') ? 'link' : 'default');
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerover', over, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerover', over);
    };
  }, [x, y]);

  if (!enabled) return null;

  const size = variant === 'default' ? 8 : variant === 'link' ? 44 : 72;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] rounded-full mix-blend-difference"
      style={{ x: sx, y: sy, translateX: '-50%', translateY: '-50%' }}
      animate={{
        width: size,
        height: size,
        backgroundColor: variant === 'default' ? '#EAEAEA' : 'transparent',
        border: variant === 'default' ? '0px solid #EAEAEA' : '1px solid #EAEAEA',
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    />
  );
}
