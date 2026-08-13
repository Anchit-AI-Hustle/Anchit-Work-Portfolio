'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import SplitType from 'split-type';
import HoldReveal from './HoldReveal';

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Split per LINE as well as per char: one mask per line, so descenders
      // are clipped by their own line rather than the one above.
      const split = new SplitType('[data-split]', { types: 'lines,chars', lineClass: 'reveal-mask' });
      gsap.set(split.chars, { yPercent: 120 });

      gsap.timeline({ delay: 0.25 })
        .to(split.chars, {
          yPercent: 0,
          duration: 1.25,
          ease: 'power4.out',
          stagger: { each: 0.022, from: 'start' },
        })
        .from('[data-meta]',  { opacity: 0, y: 10, duration: 0.8, ease: 'power2.out' }, '-=0.7')
        .from('[data-stage]', { opacity: 0, duration: 1.2, ease: 'power2.out' }, '-=0.9')
        .from('[data-tip]',   { opacity: 0, duration: 0.8, ease: 'power2.out' }, '-=0.6');

      return () => split.revert();
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="relative flex min-h-[100svh] flex-col justify-between px-6 pb-10 pt-28 md:px-10">
      <div data-meta className="font-mono text-[10px] uppercase tracking-[0.22em] text-ash">
        Planet Earth-616 &nbsp;|&nbsp; Y2026 — 12°58&apos;12N, 77°38&apos;27E
      </div>

      <div className="flex flex-1 flex-col justify-center gap-12 md:flex-row md:items-center md:gap-16">
        <div>
          <h1
            data-split
            className="max-w-[12ch] text-[clamp(3.2rem,12vw,11rem)] font-semibold uppercase leading-[0.84] tracking-tightest"
          >
            Anchit Tandon
          </h1>
          <p data-meta className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-ash">
            Product &nbsp;|&nbsp; Building products people trust.
          </p>
        </div>

        <div
          data-stage
          data-cursor="hold"
          className="relative aspect-[4/5] w-full max-w-[400px] overflow-hidden border border-edge md:ml-auto"
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
        >
          <HoldReveal held={held} />
          <div
            data-tip
            className="pointer-events-none absolute inset-x-0 bottom-0 p-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ash"
          >
            tip: hold to see the future.
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-ash">
        <span>Index — 001</span>
        <span className="hidden md:block">scroll</span>
      </div>
    </section>
  );
}
