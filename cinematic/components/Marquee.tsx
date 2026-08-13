'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const ITEMS = ['MUSICGENAI', 'HEY-YAARA', 'AI_TELESUITE', 'LIFECYCLE OS',
  'THE THIRD EYE', 'MAILER ARCHITECT', 'JOBFIT AGENT'];

/**
 * PHASE 1: the CSS @keyframes loop was deleted. Motion is GSAP-owned now, so
 * it shares one ticker with Lenis and ScrollTrigger instead of running on a
 * separate compositor timeline nothing else can pause or sync to.
 */
export default function Marquee() {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // One copy's width is exactly half the track: wrapping at -50% is seamless.
      gsap.to('[data-marquee-copy]', {
        xPercent: -100,
        ease: 'none',
        duration: 26,
        repeat: -1,
      });
    }, track);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={track} className="border-y border-edge py-6" aria-label="Selected systems">
      <div className="flex overflow-hidden [--gap:4rem]">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            data-marquee-copy
            aria-hidden={copy === 1}
            className="flex shrink-0 items-center gap-[--gap] pr-[--gap]"
          >
            {ITEMS.map((t) => (
              <span key={t} className="font-mono text-[11px] uppercase tracking-[0.28em] text-ash">
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
