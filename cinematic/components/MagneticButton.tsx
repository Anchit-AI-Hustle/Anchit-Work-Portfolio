'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';

/**
 * PHASE 1: the Tailwind transition-colors / duration-300 / ease-cine classes
 * were deleted. Colour and position are both GSAP now, so hover state cannot
 * fight a CSS transition running on the same property.
 */
export default function MagneticButton({
  children, href, strength = 0.4,
}: { children: ReactNode; href: string; strength?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);

  return (
    <a
      ref={ref}
      href={href}
      data-magnetic
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noopener"
      onPointerMove={(e) => {
        const el = ref.current!;
        const r = el.getBoundingClientRect();
        gsap.to(el, {
          x: (e.clientX - (r.left + r.width / 2)) * strength,
          y: (e.clientY - (r.top + r.height / 2)) * strength,
          borderColor: '#EAEAEA',
          color: '#EAEAEA',
          duration: 0.4,
          ease: 'power3.out',
        });
      }}
      onPointerLeave={() => {
        // Overshoot on release: the pull had weight, so letting go should too.
        gsap.to(ref.current, {
          x: 0, y: 0, borderColor: 'rgba(234,234,234,0.10)', color: '#8A8A8A',
          duration: 0.9, ease: 'elastic.out(1, 0.4)',
        });
      }}
      className="inline-flex items-center gap-2 border border-edge px-7 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ash"
    >
      {children}
    </a>
  );
}
