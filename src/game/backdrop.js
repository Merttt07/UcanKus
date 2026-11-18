import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash, paintFaces, positionsOnly } from './geoUtils.js';
import { QUALITY } from './quality.js';

// Ufuktaki sabit manzara: dev karlı dağlar ve sisli ince kaya sütunları.
// Kuşla birlikte hareket eder → hiçbir zaman ulaşılamaz, gökyüzü gibi hep orada durur.
// Etekleri gökyüzü rengine karışır, böylece uzak bir pusun içinden yükseliyor gibi görünür.

const rand = (a, b) => a + Math.random() * (b - a);
const SNOW = new THREE.Color('#eef3f7');
const SUN = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
const SINK = 15; // tabanı biraz aşağıda, yere oturmuş gibi

export function createBackdrop(scene, sky) {
  const geos = [];
  const col = new THREE.Color();

  function addPeak({ angle, dist, R, h, mid, snowLine, thin, seed }) {
    const g = thin
      ? new THREE.CylinderGeometry(0.55, 1, 1, 7, 6) // ince uzun kaya sütunu
      : new THREE.ConeGeometry(1, 1, 9, 5);         // dev dağ
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + (hash(x, y, z, seed) - 0.5) * 0.3 + (thin ? 0.12 * Math.sin(y * 9 + seed) : 0);
      const dy = y > 0.001 && y < 0.999 ? (hash(z, x, y, seed) - 0.5) * 0.05 : 0;
      p.setXYZ(i, x * k, y + dy, z * k);
    }
    g.scale(R, h, R);
    g.translate(Math.cos(angle) * dist, -SINK, Math.sin(angle) * dist);
    const pg = positionsOnly(g);
    g.dispose();
    paintFaces(pg, (c, n, r) => {
      const t = THREE.MathUtils.clamp((c.y + SINK) / h, 0, 1);
      col.lerpColors(sky, mid, THREE.MathUtils.smoothstep(t, 0, 0.45));
      if (t > snowLine + (r - 0.5) * 0.08) col.copy(SNOW).lerp(sky, 0.2);
      const shade = 0.82 + 0.22 * Math.max(0, n.dot(SUN));
      return col.multiplyScalar(1 - (1 - shade) * t); // etekte gölge yok → puslu ufka karışır
    });
    geos.push(pg);
  }

  let seed = 0;
  // En arkada dev karlı dağlar.
  const { far, thin, mid } = QUALITY.backdrop;
  for (let i = 0; i < far; i++) {
    addPeak({
      angle: (i / far) * Math.PI * 2 + rand(0, 0.15), dist: rand(850, 1000),
      R: rand(140, 240), h: rand(230, 420), mid: new THREE.Color('#8ea6bb'), snowLine: 0.72, seed: seed++,
    });
  }
  // Önde ince uzun kaya sütunları ve birkaç orta boy dağ.
  for (let i = 0; i < thin; i++) {
    addPeak({
      angle: rand(0, Math.PI * 2), dist: rand(420, 560),
      R: rand(16, 34), h: rand(90, 190), mid: new THREE.Color('#7e9a92'), snowLine: 2, thin: true, seed: seed++,
    });
  }
  for (let i = 0; i < mid; i++) {
    addPeak({
      angle: rand(0, Math.PI * 2), dist: rand(480, 600),
      R: rand(60, 100), h: rand(100, 160), mid: new THREE.Color('#8aa39c'), snowLine: 2, seed: seed++,
    });
  }

  const geo = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    update(p) {
      mesh.position.set(p.x, 0, p.z);
    },
  };
}
