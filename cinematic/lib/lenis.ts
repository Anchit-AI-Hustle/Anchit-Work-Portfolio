'use client';

import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let lenis: Lenis | null = null;

/**
 * One Lenis instance, driven by GSAP's ticker.
 *
 * This is the part that is usually got wrong: running Lenis on its own
 * requestAnimationFrame AND ScrollTrigger on another means two loops disagree
 * about what "now" is, and every scroll-triggered animation lands a frame late
 * — which reads as the jerkiness Lenis was added to remove. So Lenis is ticked
 * BY gsap.ticker, and ScrollTrigger is told to update on every Lenis scroll.
 */
export function initLenis() {
  if (lenis) return lenis;
  gsap.registerPlugin(ScrollTrigger);

  lenis = new Lenis({
    duration: 1.1,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // long, filmic tail
    smoothWheel: true,
    touchMultiplier: 1.6,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);          // never "catch up" in a jump after a stall

  return lenis;
}

export function destroyLenis() {
  lenis?.destroy();
  lenis = null;
}

export const getLenis = () => lenis;
