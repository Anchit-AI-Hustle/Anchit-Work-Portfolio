'use client';

const ITEMS = ['VAHDAM INDIA', 'TIMES INTERNET', 'ET MARKETS', 'ET PRIME',
  'TIMES HEALTH+', 'DELHI HALF MARATHON', 'CITYMALL', 'TUPLE'];

/** Duplicated track so the loop is seamless; CSS-only so it costs no JS frames. */
export default function Marquee() {
  return (
    <section className="border-y border-edge py-6" aria-label="Where I have worked">
      <div className="flex overflow-hidden [--gap:4rem]">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1}
            className="flex shrink-0 animate-[marquee_38s_linear_infinite] items-center gap-[--gap] pr-[--gap] motion-reduce:animate-none"
          >
            {ITEMS.map((t) => (
              <span key={t} className="font-mono text-[11px] uppercase tracking-[0.28em] text-ash">
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes marquee { to { transform: translateX(-100%); } }
      `}</style>
    </section>
  );
}
