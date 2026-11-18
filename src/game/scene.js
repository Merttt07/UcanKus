import * as THREE from 'three';
import { createTerrain, surfaceHeight } from './terrain.js';
import { createDecor } from './decor.js';
import { createBackdrop } from './backdrop.js';
import { QUALITY } from './quality.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(QUALITY.pixelRatio);

  const scene = new THREE.Scene();
  const sky = new THREE.Color('#bfe3f2');
  scene.background = sky;
  // Yakın dünya sisle kaybolur; ufuktaki manzara sisten etkilenmez.
  scene.fog = new THREE.Fog(sky, QUALITY.fogNear, QUALITY.fogFar);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1600);

  scene.add(new THREE.HemisphereLight('#fff6e0', '#6a8f4e', 1.6));
  const sun = new THREE.DirectionalLight('#fff3d6', 1.4);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const terrain = createTerrain(scene);
  const decor = createDecor(scene);
  const backdrop = createBackdrop(scene, sky);

  // Kuşun konumuna göre araziyi, süsleri ve ufku taşı.
  function updateWorld(pos) {
    terrain.update(pos);
    decor.update(pos);
    backdrop.update(pos);
  }

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Dikey ekranda yatay görüş çok daralmasın.
    camera.fov = w < h ? 75 : 60;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // Kare hızı düşünce main.js çözünürlüğü buradan azaltır.
  function setPixelRatio(r) {
    renderer.setPixelRatio(r);
    resize();
  }

  return { renderer, scene, camera, updateWorld, decor, setPixelRatio };
}

// Kuşu arkadan-yukarıdan yumuşakça takip eden kamera.
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
export function updateFollowCamera(camera, bird, dt) {
  _desired.copy(bird.position).addScaledVector(bird.forward, -8);
  _desired.y += 3.2;
  const t = 1 - Math.exp(-3 * dt);
  camera.position.lerp(_desired, t);
  // Kamera tepelerin içine gömülmesin.
  const minY = surfaceHeight(camera.position.x, camera.position.z) + 1.2;
  if (camera.position.y < minY) camera.position.y = minY;
  _look.copy(bird.position).addScaledVector(bird.forward, 5);
  camera.lookAt(_look);
}
