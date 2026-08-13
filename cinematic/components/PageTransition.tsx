'use client';

import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

/** Clip-path circle wipe between routes — the scene cut. */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={pathname}>
        {children}
        <motion.div
          className="pointer-events-none fixed inset-0 z-[9998] bg-void"
          initial={{ clipPath: 'circle(140% at 50% 50%)' }}
          animate={{ clipPath: 'circle(0% at 50% 50%)' }}
          exit={{ clipPath: 'circle(140% at 50% 50%)' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
