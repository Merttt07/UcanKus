import * as THREE from 'three';
import { QUALITY } from './quality.js';

// İnişli çıkışlı arazi ve göller.
// Yükseklik bir formülden geliyor: aynı (x,z) için hep aynı sonuç → dünya sonsuz ve tutarlı.
// Su seviyesinin (0) altında kalan çukurlar göl olur.

export const WATER_LEVEL = 0;

export function groundHeight(x, z) {
  const b = Math.sin(x * 0.0065 + 2.0) * Math.sin(z * 0.0071 + 1.0);
  const hills = b > 0 ? 5 * b * b : 0; // ara sıra belirgin tepeler
  return (
    1.6 +
    3.0 * Math.sin(x * 0.012 + 0.7) * Math.cos(z * 0.010 - 0.4) +
    1.8 * Math.sin(x * 0.027 - z * 0.021 + 1.9) +
    1.0 * Math.cos(x * 0.043 + z * 0.037) +
    hills
  );
}

// Kuşun çarpabileceği yüzey: kara ya da göl yüzeyi.
export const surfaceHeight = (x, z) => Math.max(groundHeight(x, z), WATER_LEVEL);

const WET = new THREE.Color('#a99b70');
const SAND = new THREE.Color('#d8c690');
const GRASS_A = new THREE.Color('#86c262');
const GRASS_B = new THREE.Color('#69a94f');
const HILL = new THREE.Color('#7aa95a');

function groundColor(h, x, z, out) {
  if (h < -0.4) return out.copy(WET);   // göl dibi
  if (h < 0.7) return out.copy(SAND);   // kıyı
  const n = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.052);
  out.lerpColors(GRASS_A, GRASS_B, n);
  if (h > 7) out.lerp(HILL, Math.min(1, (h - 7) / 4));
  return out;
}

export function createTerrain(scene) {
  // Kuşun etrafında QUALITY.terrainSize metrelik bir ızgara. Kuş bir hücre ilerleyince ızgara da bir hücre
  // kayar ve yükseklikler yeniden hesaplanır → köşeler hep aynı dünya noktasında durur.
  const SIZE = QUALITY.terrainSize;
  const SEG = QUALITY.terrainSegments;
  const CELL = SIZE / SEG;

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const baseX = new Float32Array(pos.count);
  const baseZ = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    baseX[i] = pos.getX(i);
    baseZ[i] = pos.getZ(i);
  }
  const colors = new Float32Array(pos.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.frustumCulled = false; // köşeler sürekli değiştiği için sınır kutusu güvenilmez
  scene.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    QUALITY.transparentWater
      ? new THREE.MeshPhongMaterial({ color: '#4fa6d0', specular: '#e8f6ff', shininess: 90, transparent: true, opacity: 0.85 })
      : new THREE.MeshLambertMaterial({ color: '#58acd3' }), // telefonda saydam/parlak su yok
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  const c = new THREE.Color();
  let cx = NaN;
  let cz = NaN;

  function rebuild() {
    for (let i = 0; i < pos.count; i++) {
      const wx = cx + baseX[i];
      const wz = cz + baseZ[i];
      const h = groundHeight(wx, wz);
      pos.setY(i, h);
      groundColor(h, wx, wz, c).toArray(colors, i * 3);
    }
    pos.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return {
    update(p) {
      const nx = Math.round(p.x / CELL) * CELL;
      const nz = Math.round(p.z / CELL) * CELL;
      if (nx !== cx || nz !== cz) {
        cx = nx;
        cz = nz;
        ground.position.set(cx, 0, cz);
        rebuild();
      }
      water.position.set(p.x, WATER_LEVEL, p.z);
    },
  };
}
