'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TARGET = 'ANCHIT TANDON';
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>[]{}#*';

/** Scrambles to the name, then wipes away with a clip-path reveal. */
export default function Preloader() {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      const settled = Math.floor(frame / 2);
      setText(
        TARGET.split('').map((ch, i) => {
          if (ch === ' ') return ' ';
          return i < settled ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }).join('')
      );
      if (settled >= TARGET.length) {
        clearInterval(id);
        setTimeout(() => setDone(true), 260);
      }
    }, 45);
    return () => clearInterval(id);
  }, []);

  // Lock scroll only while the curtain is up.
  useEffect(() => {
    document.documentElement.style.overflow = done ? '' : 'hidden';
    return () => { document.documentElement.style.overflow = ''; };
  }, [done]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-void"
          initial={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-silver">
            {text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
