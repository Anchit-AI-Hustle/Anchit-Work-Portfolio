// ============================================================================
// HowToVisualCanvas — the main animated UI.
//   • A WebGL 3D backdrop (scroll/parallax-reactive) behind frosted-glass cards.
//   • The PromptOptimizer (ask bar + suggestions).
//   • On submit → cascade runs → a progress track, a live model-cascade strip,
//     a dynamic React Flow diagram, and the step-by-step cards (each with an
//     animated video from the text-to-video pipeline).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Environment } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';

import PromptOptimizer from './PromptOptimizer';
import FlowDiagram from './FlowDiagram';
import StepCard from './StepCard';
import { useCascade } from '../hooks/useCascade';

// ── 3D backdrop: a slowly drifting knot behind the glass, reacts to scroll ──
function Backdrop() {
  const mesh = useRef<THREE.Mesh>(null);
  const scroll = useRef(0);
  useEffect(() => {
    const onScroll = () => { scroll.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useFrame((state, dt) => {
    if (!mesh.current) return;
    mesh.current.rotation.x += dt * 0.08;
    mesh.current.rotation.y += dt * 0.11;
    mesh.current.position.y = -scroll.current / 600;       // scroll-driven parallax
    const s = 1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.04;
    mesh.current.scale.setScalar(s);
  });
  return (
    <mesh ref={mesh} position={[2.2, 0, -2]}>
      <torusKnotGeometry args={[1.5, 0.42, 220, 32]} />
      <meshStandardMaterial color="#6b4bff" roughness={0.2} metalness={0.7} emissive="#2a1e66" emissiveIntensity={0.4} />
    </mesh>
  );
}

function Scene() {
  return (
    <Canvas className="bg-canvas" camera={{ position: [0, 0, 6], fov: 55 }} dpr={[1, 2]}>
      <color attach="background" args={["#08070f"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 6, 4]} intensity={1.2} />
      <Stars radius={60} depth={30} count={1800} factor={4} fade speed={1} />
      <Backdrop />
      <Environment preset="city" />
    </Canvas>
  );
}

export default function HowToVisualCanvas() {
  const { loading, result, error, run } = useCascade();
  const [activeId, setActiveId] = useState<string>();
  const guide = result?.guide;

  const done = useMemo(() => guide?.steps.findIndex((s) => s.id === activeId) ?? -1, [guide, activeId]);
  const progress = guide ? Math.max(0, done + 1) / guide.steps.length : 0;

  useEffect(() => {
    if (guide?.steps.length) setActiveId(guide.steps[0].id);
  }, [guide]);

  return (
    <div className="canvas-root">
      <div className="bg-fixed"><Scene /></div>

      <main className="content">
        <PromptOptimizer onSubmit={run} busy={loading} />

        {error && <div className="banner error glass">⚠ {error}</div>}

        {/* Live model-cascade strip — shows the parallel models + who made top 3 */}
        {result && result.answers.length > 0 && (
          <div className="cascade-strip glass">
            <span className="cascade-title">Model cascade</span>
            {result.answers.map((a) => {
              const isTop = result.top.some((t) => t.model === a.model);
              return (
                <span key={a.model} className={`model-pill ${a.ok ? 'ok' : 'fail'} ${isTop ? 'top' : ''}`} title={`${a.latencyMs}ms`}>
                  {a.ok ? '✓' : '✕'} {a.model}{isTop ? ' ★' : ''}
                </span>
              );
            })}
            <span className="consensus">consensus {Math.round((guide?.provenance.consensus ?? 0) * 100)}%</span>
          </div>
        )}

        <AnimatePresence>
          {guide && (
            <motion.section
              key={guide.task}
              className="result"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              <header className="result-head glass">
                <div>
                  <h2>{guide.task}</h2>
                  <p>{guide.summary}</p>
                </div>
                <div className="meta">
                  <span className={`diff diff-${guide.difficulty}`}>{guide.difficulty}</span>
                  <span>≈ {guide.estMinutes} min</span>
                  <span>{guide.steps.length} steps</span>
                </div>
              </header>

              {/* Progress track */}
              <div className="track" aria-label="Progress">
                <motion.div className="track-fill" animate={{ width: `${progress * 100}%` }} />
              </div>

              <div className="result-grid">
                <div className="steps">
                  {guide.steps.map((s) => (
                    <StepCard key={s.id} step={s} active={s.id === activeId} onFocus={() => setActiveId(s.id)} />
                  ))}
                </div>
                <aside className="flow-pane">
                  <FlowDiagram guide={guide} activeId={activeId} onSelect={setActiveId} />
                </aside>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {loading && !guide && (
          <div className="skeletons">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton glass" />)}
          </div>
        )}
      </main>
    </div>
  );
}
