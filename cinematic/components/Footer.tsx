import MagneticButton from './MagneticButton';

export default function Footer() {
  return (
    <footer className="flex flex-col gap-10 px-6 py-24 md:px-10">
      <p className="max-w-[18ch] text-[clamp(2rem,6vw,4.5rem)] font-semibold leading-[0.92] tracking-tightest">
        Let’s build something worth measuring.
      </p>

      <div className="flex flex-wrap gap-3">
        <MagneticButton href="https://linkedin.com/in/anchit-tandon">LinkedIn ↗</MagneticButton>
        <MagneticButton href="https://github.com/anchittandon-create">GitHub ↗</MagneticButton>
        <MagneticButton href="mailto:anchit.tandon@gmail.com">Email ↗</MagneticButton>
      </div>

      <div className="flex items-end justify-between border-t border-edge pt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-ash">
        <span>© {new Date().getFullYear()} Anchit Tandon</span>
        <span>Planet Earth-616</span>
      </div>
    </footer>
  );
}
