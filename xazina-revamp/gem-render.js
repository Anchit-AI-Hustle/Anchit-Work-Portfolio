import * as THREE from '/assets/vendor/three.module.min.js';
import { facets } from './model.js?v=light-2';

const vertexShader = /* glsl */ `
varying vec3 vPosition;
varying vec3 vNormal;
varying float vFacet;
attribute float facet;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosition = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vFacet = facet;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
varying vec3 vPosition;
varying vec3 vNormal;
varying float vFacet;

float panel(vec3 d, vec3 axis, float width, float edge) {
  return smoothstep(width, min(1.0, width + edge), dot(d, normalize(axis)));
}

vec3 studio(vec3 d) {
  float shift = sin(uTime * 1.35);
  vec3 light = vec3(.02, .012, .017);
  light += panel(d, vec3(-.86 + .34 * shift, .8, .55), .66, .17) * vec3(1.0, .88, .66) * 1.5;
  light += panel(d, vec3(.65, .28, -.9), .76, .12) * vec3(.74, .9, 1.0) * 1.4;
  light += panel(d, vec3(.94, .12 + shift * .28, .3), .84, .13) * vec3(1.0, .62, .27) * 1.5;
  light += panel(d, vec3(-.55, -.48, -.38), .85, .10) * vec3(.33, .49, .88);
  light += panel(d, vec3(.3, -.9, .34), .72, .23) * vec3(1.0, .57, .27) * .7;
  light += pow(max(0.0, dot(d, normalize(vec3(.25, .9, .45)))), 56.0) * vec3(1.0, .95, .81) * 2.0;
  light += smoothstep(.04, .22, abs(d.y + d.x * .18)) * vec3(.045, .035, .045);
  return light;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vPosition);
  float facet = fract(sin(floor(vFacet + .5) * 23.151 + 3.5) * 4682.31);
  vec3 reflected = reflect(-view, n);
  vec3 ray = refract(-view, n, .414);
  vec3 innerNormal = normalize(n * .19 + normalize(vPosition + vec3(.003, .012, .002)) * .64 + vec3((facet - .5) * .49, -.48, .36));
  vec3 bounced = reflect(ray, innerNormal);
  vec3 split = normalize(cross(bounced, n + vec3(.01,.02,.03))) * (.055 + facet * .10);
  vec3 red = studio(normalize(bounced + split));
  vec3 green = studio(bounced);
  vec3 blue = studio(normalize(bounced - split));
  vec3 transmitted = vec3(red.r, green.g, blue.b);
  float fresnel = pow(1.0 - max(0.0, dot(n, view)), 3.5);
  vec3 radiance = studio(reflected) * (.30 + fresnel * .76)
    + transmitted * (.39 + facet * .59);
  radiance += vec3(.045, .028, .016) * (1.0 + facet);
  vec3 color = pow(1.0 - exp(-radiance * 1.65), vec3(.85));
  gl_FragColor = vec4(color, 1.0);
}
`;

function geometry() {
  const vertices = [], ids = [];
  facets.forEach((face, id) => {
    const a = new THREE.Vector3(...face[0]), b = new THREE.Vector3(...face[1]), c = new THREE.Vector3(...face[2]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const reversed = normal.dot(a.clone().add(b).add(c)) < 0;
    for (let i = 1; i < face.length - 1; i++) {
      vertices.push(...face[0], ...face[reversed ? i + 1 : i], ...face[reversed ? i : i + 1]);
      ids.push(id, id, id);
    }
  });
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  result.setAttribute('facet', new THREE.Float32BufferAttribute(ids, 1));
  result.computeVertexNormals();
  return result;
}

let sharedGeometry;
export function createGemRenderer(canvas, parent, onLost, scale = 1) {
  // Probe before asking Three to construct a renderer, so older browsers can use
  // the canvas projection without emitting a WebGL initialization error.
  const options = { alpha: true, antialias: true, powerPreference: 'low-power' };
  const context = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
  if (!context) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, context, ...options });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
  camera.position.z = 4.8;
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uTime: { value: 0 } } });
  sharedGeometry ||= geometry();
  const gem = new THREE.Mesh(sharedGeometry, material);
  gem.scale.setScalar(scale);
  const pivot = new THREE.Group();
  pivot.rotation.z = -.21;
  pivot.add(gem);
  scene.add(pivot);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    onLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // The visible 2D model is already running. Leave it as the safe fallback.
    renderer.dispose();
    material.dispose();
  });
  function resize() {
    const { width, height } = parent.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function draw({ time, angle, yaw, pitch }) {
    material.uniforms.uTime.value = time;
    gem.rotation.set(.82 + pitch, angle + yaw + .24, .06 + Math.sin(time * .7) * .1, 'XYZ');
    renderer.render(scene, camera);
  }
  resize();
  return { resize, draw };
}
