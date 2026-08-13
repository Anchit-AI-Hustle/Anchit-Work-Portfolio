'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import SplitType from 'split-type';
import HoldReveal from './HoldReveal';

const META = "Planet Earth-616  |  Y2026 — 12°58'12N, 77°38'27E";

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Split into characters, then lift them out from behind a mask. Each line
      // is its own mask so descenders are not clipped by the line above.
      const split = new SplitType('[data-split]', { types: 'lines,chars', lineClass: 'reveal-mask' });

      gsap.set(split.chars, { yPercent: 118 });
      const tl = gsap.timeline({ delay: 0.35 });   // waits out the preloader wipe

      tl.to(split.chars, {
        yPercent: 0,
        duration: 1.15,
        ease: 'power4.out',
        stagger: { each: 0.018, from: 'start' },
      })
        .from('[data-meta]', { opacity: 0, y: 8, duration: 0.7, ease: 'power2.out' }, '-=0.65')
        .from('[data-tip]',  { opacity: 0, y: 8, duration: 0.7, ease: 'power2.out' }, '-=0.55')
        .from('[data-stage]', { opacity: 0, scale: 0.985, duration: 1.1, ease: 'power3.out' }, '-=0.85');

      return () => split.revert();
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      className="relative flex min-h-[100svh] flex-col justify-between px-6 pb-10 pt-28 md:px-10"
    >
      {/* Sci-fi telemetry line */}
      <div data-meta className="font-mono text-[10px] uppercase tracking-[0.22em] text-ash">
        {META}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-10 md:flex-row md:items-center md:gap-16">
        <h1
          data-split
          className="max-w-[14ch] text-[clamp(3rem,11vw,10rem)] font-semibold leading-[0.86] tracking-tightest"
        >
          Anchit Tandon
        </h1>

        {/* Hold-to-reveal focal area */}
        <div
          data-stage
          className="relative aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-sm border border-edge md:ml-auto"
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          data-cursor="hold"
        >
          <HoldReveal held={held} />
          <div
            data-tip
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ash"
          >
            {/* The two states say different things on purpose: hover glimpses,
                hold commits. Identical copy would make the interaction unreadable. */}
            <span>tip: hover to glimpse</span>
            <span className={held ? 'text-signal' : ''}>hold to see the future</span>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-ash">
        <span>Product · Growth · AI</span>
        <span className="hidden md:block">scroll ↓</span>
      </div>
    </section>
  );
}
