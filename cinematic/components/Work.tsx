'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const BUILDS = [
  { n: '01', title: 'MusicGenAI', role: 'Generative audio',
    blurb: 'Prompt to a finished track — lyrics, vocals, production. Every stage exposed, so a drifting vocal can be debugged instead of re-rolled.',
    stack: ['Next.js', 'Python', 'Supabase', 'Audio DSP'], year: '2026' },
  { n: '02', title: 'Hey-Yaara', role: 'Voice-first companion',
    blurb: 'An AI companion for elderly users. One button to talk, one to stop. Voice first, not screen first — built for people apps intimidate.',
    stack: ['PWA', 'Web Speech', 'LLM', 'Accessibility'], year: '2025' },
  { n: '03', title: 'AI_TeleSuite', role: 'Sales intelligence',
    blurb: 'Real-time transcription, pitch scoring and conversion assist — the ET Prime playbook packaged for solo operators.',
    stack: ['GraphQL', 'Whisper', 'LLM', 'Realtime'], year: '2025' },
];

/**
 * PHASE 1: all Tailwind transition-* / duration-* / ease-* classes deleted.
 * PHASE 2: every state change is GSAP, so hover and scroll share one engine
 * and one ticker — a CSS transition running beside a GSAP tween on the same
 * property is the classic source of fighting animations.
 */
export default function Work() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-build]').forEach((card) => {
        // Heavy and deliberate: a long ease with a real distance to travel.
        gsap.from(card, {
          y: 90,
          opacity: 0,
          duration: 1.35,
          ease: 'power4.out',
          scrollTrigger: { trigger: card, start: 'top 90%', once: true },
        });

        // Parallax delay — the numeral lags the card, so the row has depth
        // instead of arriving as one flat slab.
        gsap.to(card.querySelector('[data-num]'), {
          yPercent: -55,
          ease: 'none',
          scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: 1.1 },
        });

        // Hover, in GSAP rather than a CSS transition.
        const title = card.querySelector('[data-title]');
        const enter = () => gsap.to(title, { color: '#EAEAEA', x: 10, duration: 0.5, ease: 'power3.out' });
        const leave = () => gsap.to(title, { color: '#8A8A8A', x: 0, duration: 0.5, ease: 'power3.out' });
        card.addEventListener('pointerenter', enter);
        card.addEventListener('pointerleave', leave);
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="px-6 py-32 md:px-10" id="work">
      <h2 className="mb-16 font-mono text-[11px] uppercase tracking-[0.3em] text-ash">
        The Work — selected systems
      </h2>

      <ul className="border-t border-edge">
        {BUILDS.map((b) => (
          <li
            key={b.n}
            data-build
            data-cursor="link"
            className="group relative grid grid-cols-1 gap-4 border-b border-edge py-12 md:grid-cols-12 md:gap-8"
          >
            <span data-num className="font-mono text-[11px] text-ash md:col-span-1">{b.n}</span>

            <div className="md:col-span-6">
              <h3
                data-title
                className="text-[clamp(1.8rem,4vw,3.4rem)] font-semibold leading-[1.0] tracking-tightest text-ash"
              >
                {b.title}
              </h3>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ash">{b.role}</p>
            </div>

            <p className="text-sm leading-relaxed text-ash md:col-span-4">{b.blurb}</p>
            <span className="font-mono text-[10px] text-ash md:col-span-1 md:text-right">{b.year}</span>

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
