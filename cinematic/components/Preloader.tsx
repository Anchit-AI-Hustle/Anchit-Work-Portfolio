'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

const LINES = [
  'INITIALISING RUNTIME',
  'MOUNTING WEBGL CONTEXT',
  'CALIBRATING SCROLL',
  'ANCHIT TANDON',
];
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>[]{}#*·';

/** Terminal-style init log that scrambles into place, then SNAPS out — no fade. */
export default function Preloader() {
  const el = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<string[]>(LINES.map(() => ''));

  useEffect(() => {
    let line = 0, frame = 0;
    const id = setInterval(() => {
      frame++;
      const settled = Math.floor(frame / 1.6);
      setRows((prev) => {
        const next = [...prev];
        next[line] = LINES[line]
          .split('')
          .map((ch, i) => (ch === ' ' ? ' ' : i < settled ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join('');
        return next;
      });
      if (settled >= LINES[line].length) {
        line++; frame = 0;
        if (line >= LINES.length) {
          clearInterval(id);
          // Snap, not fade: a hard clip cut reads as a scene change.
          gsap.to(el.current, {
            clipPath: 'inset(0% 0% 100% 0%)',
            duration: 0.55,
            ease: 'expo.inOut',
            delay: 0.25,
            onComplete: () => { if (el.current) el.current.style.display = 'none'; },
          });
        }
      }
    }, 28);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      ref={el}
      className="fixed inset-0 z-[10000] flex flex-col justify-end gap-1 bg-void p-6 md:p-10"
      style={{ clipPath: 'inset(0% 0% 0% 0%)' }}
    >
      {rows.map((r, i) => (
        <div key={i} className="font-mono text-[11px] uppercase tracking-[0.28em] text-ash">
          <span className="mr-3 text-edge">{String(i + 1).padStart(2, '0')}</span>
          <span className={i === LINES.length - 1 ? 'text-silver' : ''}>{r}</span>
        </div>
      ))}
    </div>
  );
}
