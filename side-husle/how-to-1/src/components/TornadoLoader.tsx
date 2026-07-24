// A spinning 3D "tornado" of instanced points — used as the transition loader
// after the user clicks into the engine from the intro explainer.

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT = 2600;

function Vortex() {
  const ref = useRef<THREE.Points>(null);
  // Precompute a cone/vortex distribution: radius grows with height, points
  // carry an angular offset + speed so they spiral.
  const { positions, meta } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const meta = new Float32Array(COUNT * 3); // [baseAngle, height, radius]
    for (let i = 0; i < COUNT; i++) {
      const h = Math.pow(Math.random(), 1.5);      // dense at the base
      const radius = 0.15 + h * 2.4;               // funnel shape
      const angle = Math.random() * Math.PI * 2;
      meta[i * 3] = angle;
      meta[i * 3 + 1] = h * 4 - 2;                 // y from -2..2
      meta[i * 3 + 2] = radius;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = meta[i * 3 + 1];
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return { positions, meta };
  }, []);

  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      // Higher points spin faster → the classic tornado shear.
      const speed = 0.6 + (meta[i * 3 + 1] + 2) * 0.35;
      const a = (meta[i * 3] += speed * dt);
      const r = meta[i * 3 + 2];
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.rotation.y += dt * 0.25;
    // Gentle overall tilt/wobble for cinematic feel.
    pts.rotation.z = Math.sin(state.clock.elapsedTime * 0.6) * 0.08;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#8b5cff" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export default function TornadoLoader({ label = 'Spinning up your guide…', onDone, ms = 2200 }: {
  label?: string; onDone?: () => void; ms?: number;
}) {
  useEffect(() => {
    if (!onDone) return;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [onDone, ms]);

  return (
    <div className="tornado-wrap">
      <Canvas camera={{ position: [0, 0.4, 6], fov: 55 }} dpr={[1, 2]}>
        <color attach="background" args={["#07060d"]} />
        <fog attach="fog" args={["#07060d", 5, 11]} />
        <Vortex />
      </Canvas>
      <div className="tornado-label">{label}</div>
    </div>
  );
}
