// ============================================================================
// HowToVisualCanvas — the main animated UI.
//   • A WebGL 3D backdrop (scroll/parallax-reactive) behind frosted-glass cards.
//   • The PromptOptimizer (ask bar + suggestions).
//   • On submit → cascade runs → a live model-cascade strip, then the guide
//     itself, rendered by GuideDesk: a rail of steps, one step at a time, and
//     the route map folded away underneath.
// ============================================================================

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';

import PromptOptimizer from './PromptOptimizer';
// React Flow and its stylesheet are only needed once a guide exists, which is
// after the cascade returns — so they are not part of the first load at all.
const FlowDiagram = lazy(() => import('./FlowDiagram'));
import GuideDesk from './GuideDesk';
import TornadoLoader from './TornadoLoader';
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
      <meshStandardMaterial color="#FF6940" roughness={0.22} metalness={0.72} emissive="#FF4D1F" emissiveIntensity={0.45} />
    </mesh>
  );
}

function Scene() {
  return (
    <Canvas className="bg-canvas" camera={{ position: [0, 0, 6], fov: 55 }} dpr={[1, 2]}>
      <color attach="background" args={["#0A0806"]} />
      {/* Lit entirely by local lights — no external HDR environment fetch, so
          the scene works fully offline / under a strict CSP. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 6, 4]} intensity={1.3} color="#FFB736" />
      <directionalLight position={[-4, -2, 3]} intensity={0.5} color="#FF6940" />
      <Stars radius={60} depth={30} count={1500} factor={4} fade speed={1} />
      <Backdrop />
    </Canvas>
  );
}

export default function HowToVisualCanvas() {
  const { loading, result, error, offline, run } = useCascade();
  const [activeId, setActiveId] = useState<string>();
  const guide = result?.guide;

  useEffect(() => {
    if (guide?.steps.length) setActiveId(guide.steps[0].id);
  }, [guide]);

  // Selecting a step (via the flow diagram OR a card) makes it active AND
  // scrolls its card into view — clicking any node in the flow map jumps you
  // straight to that step.
  const selectStep = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(`howto-step-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="canvas-root">
      <div className="bg-fixed"><Scene /></div>

      {/* The 3D tornado is the "search buffer" while the user's input is turned
          into a guide — it stays up for as long as the cascade is running. */}
      {loading && !guide && (
        <TornadoLoader label="Searching the model cascade…" sub="Fusing the best answers into your guide" />
      )}

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

              {/* A generic outline must never be mistaken for a real answer.
                  This banner is the whole reason the placeholder guide could
                  sit in production unnoticed: nothing on screen distinguished
                  "the models wrote this for your task" from "the service was
                  unreachable, so here is a template". */}
              {offline && (
                <div className="fallback-note" role="status">
                  <strong>Generic outline</strong>
                  <span>{error || 'The guide service did not answer, so these are placeholder steps rather than real instructions for this task.'}</span>
                </div>
              )}

              {/* The steps used to be a scrolling column of cards with the map
                  pinned beside it — everything on screen at once, and the
                  reader deciding where to look. The desk shows one step at a
                  time, with the rail carrying the sense of where you are. The
                  map is still here, below, as a map rather than as a sidebar. */}
              <GuideDesk guide={guide} activeId={activeId} onSelect={selectStep} />

              <details className="gd-map">
                <summary>See the whole route</summary>
                <Suspense fallback={<div className="flow-pane-placeholder" aria-hidden="true" />}>
                  <FlowDiagram guide={guide} activeId={activeId} onSelect={selectStep} />
                </Suspense>
              </details>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
