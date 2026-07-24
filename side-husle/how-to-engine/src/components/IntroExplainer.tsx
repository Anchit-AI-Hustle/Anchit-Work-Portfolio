// The first thing the user sees: a cinematic explainer of what the engine does,
// with a floating 3D object behind frosted glass. Clicking the CTA triggers the
// tornado loader (handled by the parent) and then the ask interface.

import { Canvas } from '@react-three/fiber';
import { Float, Icosahedron, MeshDistortMaterial } from '@react-three/drei';
import { motion } from 'framer-motion';

function Hero3D() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} />
      <Float speed={1.4} rotationIntensity={1.1} floatIntensity={1.6}>
        <Icosahedron args={[1.6, 6]}>
          <MeshDistortMaterial color="#7b5bff" roughness={0.15} metalness={0.6} distort={0.35} speed={1.6} />
        </Icosahedron>
      </Float>
    </Canvas>
  );
}

export default function IntroExplainer({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="intro">
      <div className="intro-3d"><Hero3D /></div>
      <motion.div
        className="intro-card glass"
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
      >
        <span className="eyebrow">How-To Engine</span>
        <h1>Learn to do <em>anything</em> — one tiny, can’t-fail step at a time.</h1>
        <p className="lede">
          Ask for any skill, from <strong>switching on a phone</strong> to <strong>swimming breaststroke</strong> or
          <strong> solving a quadratic</strong>. Several frontier AIs answer in parallel; the best three are fused into
          one visual, step-by-step guide — colour-coded, branchable, with an animated clip for every step.
        </p>
        <ul className="intro-points">
          <li>🧠 Multi-model consensus, not one opinion</li>
          <li>🎯 ADHD-friendly: zero walls of text</li>
          <li>🎬 A short animation per step</li>
        </ul>
        <motion.button className="btn primary xl" onClick={onEnter} whileTap={{ scale: 0.96 }}>
          Enter the engine →
        </motion.button>
        <div className="intro-hint">Click to spin it up</div>
      </motion.div>
    </section>
  );
}
