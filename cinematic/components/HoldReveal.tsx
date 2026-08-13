'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

/**
 * Hold-to-reveal, in GLSL.
 *
 * `uProgress` is eased toward 1 while the pointer is held and back to 0 when
 * released, and drives a radial displacement + chromatic split. It is deliberately
 * NOT a texture crossfade: no image is shipped, so nothing 404s and the effect
 * works before any art direction exists. Drop two textures in and mix on
 * uProgress when you have them.
 */
const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uProgress;
  uniform vec2  uMouse;

  // cheap value noise
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }

  void main() {
    vec2 uv = vUv;
    float d = distance(uv, uMouse);

    // Displacement grows from the cursor outward as the hold deepens.
    float ripple = sin(d * 26.0 - uTime * 2.4) * 0.014 * uProgress;
    uv += normalize(uv - uMouse + 0.0001) * ripple;

    float n = noise(uv * 3.2 + uTime * 0.06);
    float grid = smoothstep(0.985, 1.0, max(
      abs(fract(uv.x * 18.0) - 0.5) * 2.0,
      abs(fract(uv.y * 24.0) - 0.5) * 2.0));

    // Base: near-black with a slow drifting field. Hold pushes toward signal.
    vec3 base   = mix(vec3(0.02), vec3(0.06, 0.065, 0.07), n);
    vec3 future = mix(base, vec3(0.776, 1.0, 0.310), 0.55 * uProgress);
    vec3 col    = future + grid * (0.06 + 0.35 * uProgress);

    // Chromatic split, only while held — the "pressure" read.
    col.r += uProgress * 0.05 * sin(d * 18.0 - uTime);
    col.b += uProgress * 0.05 * cos(d * 18.0 + uTime);

    // Vignette keeps it cinematic rather than flat.
    col *= 1.0 - smoothstep(0.35, 0.95, distance(uv, vec2(0.5)));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Plane({ held }: { held: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    }),
    []
  );

  useFrame((state, dt) => {
    if (!mat.current) return;
    const u = mat.current.uniforms;
    u.uTime.value += dt;
    // Critically damped-ish easing, so press and release both feel weighted.
    u.uProgress.value += ((held ? 1 : 0) - u.uProgress.value) * Math.min(1, dt * 4.5);
    const { x, y } = state.pointer;                    // -1..1
    u.uMouse.value.lerp(new THREE.Vector2((x + 1) / 2, (y + 1) / 2), 0.08);
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} />
    </mesh>
  );
}

export default function HoldReveal({ held }: { held: boolean }) {
  return (
    <Canvas
      className="absolute inset-0"
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 1] }}
    >
      <Plane held={held} />
    </Canvas>
  );
}
