'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const BUILDS = [
  { n: '01', title: 'VAHDAM Lifecycle OS', role: 'AGM — Product, D2C Growth',
    blurb: 'A retention workflow connecting analytics, planning, segmentation and mailer generation into one loop.',
    stack: ['Klaviyo', 'WebEngage', 'SQL', 'Experimentation'], year: '2026' },
  { n: '02', title: 'ET Markets Rebuild', role: 'Product Manager · Times Internet',
    blurb: 'Rebuilt across iOS, Android and web into ₹3Cr+ of new annual revenue.',
    stack: ['iOS', 'Android', 'Web', 'Growth'], year: '2023—25' },
  { n: '03', title: 'Assisted Sales 5×', role: 'Product Manager · Times Internet',
    blurb: 'Scaled from ₹15L to ₹80L MRR in eight to ten months.',
    stack: ['Funnels', 'CRM', 'Pricing'], year: '2023' },
  { n: '04', title: 'Delhi Half Marathon', role: 'Senior PM · 0→1 IP',
    blurb: 'A new consumer IP taken from zero to fifteen thousand runners on the ground.',
    stack: ['0→1', 'Events', 'Acquisition'], year: '2026' },
];

export default function Work() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-build]').forEach((card) => {
        // Bottom-up fade…
        gsap.from(card, {
          y: 64, opacity: 0, duration: 1.1, ease: 'power3.out',
          scrollTrigger: { trigger: card, start: 'top 88%', once: true },
        });
        // …plus a slow parallax on the index numeral, so the row has depth
        // rather than moving as one flat slab.
        gsap.to(card.querySelector('[data-num]'), {
          yPercent: -38, ease: 'none',
          scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="px-6 py-28 md:px-10" id="work">
      <h2 className="mb-14 font-mono text-[11px] uppercase tracking-[0.3em] text-ash">
        Selected builds
      </h2>

      <ul className="border-t border-edge">
        {BUILDS.map((b) => (
          <li
            key={b.n}
            data-build
            className="group relative grid grid-cols-1 gap-4 border-b border-edge py-10 transition-colors duration-500 ease-cine hover:bg-white/[0.02] md:grid-cols-12 md:gap-8"
          >
            <span data-num className="font-mono text-[11px] text-ash md:col-span-1">{b.n}</span>

            <div className="md:col-span-6">
              <h3 className="text-[clamp(1.6rem,3.4vw,2.8rem)] font-semibold leading-[1.02] tracking-tightest transition-colors duration-500 ease-cine group-hover:text-signal">
                {b.title}
              </h3>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ash">{b.role}</p>
            </div>

            <p className="text-sm leading-relaxed text-ash md:col-span-4">{b.blurb}</p>

            <div className="flex flex-wrap items-start gap-2 md:col-span-1 md:justify-end">
              <span className="font-mono text-[10px] text-ash">{b.year}</span>
            </div>

            <div className="flex flex-wrap gap-2 md:col-span-12">
              {b.stack.map((s) => (
                <span key={s} className="border border-edge px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ash">
                  {s}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
