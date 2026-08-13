'use client';

import { useEffect, type ReactNode } from 'react';
import { initLenis, destroyLenis } from '@/lib/lenis';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Wraps the app. Honours prefers-reduced-motion by simply not starting Lenis —
 * hijacking scroll for someone who asked the OS for less motion is the one
 * place this aesthetic should yield.
 */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    initLenis();
    // Fonts change layout, which changes every trigger position.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => destroyLenis();
  }, []);

  return <>{children}</>;
}
