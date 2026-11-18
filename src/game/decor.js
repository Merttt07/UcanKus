import * as THREE from 'three';
import { groundHeight, WATER_LEVEL } from './terrain.js';
import { QUALITY } from './quality.js';

// Yerdeki süsler: ağaçlar (çarpılabilir) ve kırmızı/mor çiçekler (çok alçak, çarpışma yok).
// Hepsi kuşun etrafında bir karede durur, kuş ilerledikçe arkada kalan öne sarılır.

const TREE_TILE = 360;
const TREE_COUNT = QUALITY.trees;
const FLOWER_TILE = 200;
const FLOWERS_PER_COLOR = QUALITY.flowersPerColor;

const wrapTo = (v, c, tile) => c + ((((v - c) % tile) + tile * 1.5) % tile) - tile / 2;

function makeWrapped(items, tile, write) {
  items.forEach((it, i) => write(i, it));
  return {
    update(cx, cz) {
      let dirty = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const nx = wrapTo(it.x, cx, tile);
        const nz = wrapTo(it.z, cz, tile);
        if (Math.abs(nx - it.x) > 0.01 || Math.abs(nz - it.z) > 0.01) {
          it.x = nx;
          it.z = nz;
          write(i, it);
          dirty = true;
        }
      }
      return dirty;
    },
    rewriteAll() {
      items.forEach((it, i) => write(i, it));
    },
  };
}

export function createDecor(scene) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let clearTest = () => true; // dağ formasyonlarının ve halkaların çevresi ağaçsız kalsın

  // --- Ağaçlar: çam, yuvarlak ağaç ve ara sıra pembe çiçekli ağaç ---
  const trees = [];
  while (trees.length < TREE_COUNT) {
    const x = (Math.random() - 0.5) * TREE_TILE;
    const z = (Math.random() - 0.5) * TREE_TILE;
    // Ağaçlar kümelensin: bazı yerler ormanlık, bazı yerler açık çayır.
    const f = 0.5 + 0.5 * Math.sin(x * 0.031) * Math.cos(z * 0.027 + 1);
    if (Math.random() > f * f + 0.08) continue;
    trees.push({ x, z, k: 0.9 + Math.random() * 0.8, pine: Math.random() < 0.55, a: Math.random() * 6.28, g: 0, visible: false });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 1, 5).translate(0, 0.5, 0);
  const pineGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const roundGeo = new THREE.IcosahedronGeometry(1, 1);
  const lam = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, lam('#8a6a4a'), TREE_COUNT);
  const pines = new THREE.InstancedMesh(pineGeo, lam('#ffffff'), TREE_COUNT);
  const rounds = new THREE.InstancedMesh(roundGeo, lam('#ffffff'), TREE_COUNT);

  const PINE_COLORS = ['#3f8a4a', '#357a40', '#4a9655'].map((c) => new THREE.Color(c));
  const ROUND_COLORS = ['#5aa548', '#6bb552', '#4f9a40', '#f0a6c0', '#e993b3'].map((c) => new THREE.Color(c));
  trees.forEach((t, i) => {
    pines.setColorAt(i, PINE_COLORS[i % PINE_COLORS.length]);
    // Yuvarlak ağaçların ~%15'i pembe çiçekli (son iki renk).
    const ri = Math.random() < 0.15 ? 3 + (i % 2) : i % 3;
    rounds.setColorAt(i, ROUND_COLORS[ri]);
  });

  function writeTree(i, t) {
    t.g = groundHeight(t.x, t.z);
    t.visible = t.g > WATER_LEVEL + 0.4 && clearTest(t.x, t.z);
    if (!t.visible) {
      trunks.setMatrixAt(i, zero);
      pines.setMatrixAt(i, zero);
      rounds.setMatrixAt(i, zero);
      return;
    }
    const k = t.k;
    q.setFromAxisAngle(up, t.a);
    m.compose(p.set(t.x, t.g - 0.2, t.z), q, s.set(k, (t.pine ? 1.5 : 1.9) * k, k));
    trunks.setMatrixAt(i, m);
    if (t.pine) {
      m.compose(p.set(t.x, t.g + 1.2 * k, t.z), q, s.set(1.6 * k, 3.6 * k, 1.6 * k));
      pines.setMatrixAt(i, m);
      rounds.setMatrixAt(i, zero);
    } else {
      m.compose(p.set(t.x, t.g + 3.1 * k, t.z), q, s.set(1.5 * k, 1.35 * k, 1.5 * k));
      rounds.setMatrixAt(i, m);
      pines.setMatrixAt(i, zero);
    }
  }
  const treeStrip = makeWrapped(trees, TREE_TILE, writeTree);

  // --- Çiçekler: küçük kümeler halinde kırmızı ve mor ---
  function makeFlowers(color) {
    const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), lam(color), FLOWERS_PER_COLOR);
    const items = [];
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < FLOWERS_PER_COLOR; i++) {
      if (i % 12 === 0) {
        cx = (Math.random() - 0.5) * FLOWER_TILE;
        cz = (Math.random() - 0.5) * FLOWER_TILE;
      }
      items.push({ x: cx + (Math.random() - 0.5) * 6, z: cz + (Math.random() - 0.5) * 6, k: 0.8 + Math.random() * 0.6, a: Math.random() * 6.28 });
    }
    const strip = makeWrapped(items, FLOWER_TILE, (i, f) => {
      const g = groundHeight(f.x, f.z);
      if (g < WATER_LEVEL + 0.25) return mesh.setMatrixAt(i, zero); // suda/kıyıda çiçek yok
      q.setFromAxisAngle(up, f.a);
      m.compose(p.set(f.x, g + 0.28 * f.k, f.z), q, s.set(f.k, f.k * 0.7, f.k));
      mesh.setMatrixAt(i, m);
    });
    return { mesh, strip };
  }
  const red = makeFlowers('#e8394d');
  const purple = makeFlowers('#9a4fd8');

  const all = [trunks, pines, rounds, red.mesh, purple.mesh];
  for (const im of all) {
    im.frustumCulled = false; // örnekler sürekli yer değiştiriyor
    scene.add(im);
  }
  const markTrees = () => {
    trunks.instanceMatrix.needsUpdate = true;
    pines.instanceMatrix.needsUpdate = true;
    rounds.instanceMatrix.needsUpdate = true;
  };

  // Çam: gövde + koni taç. Yuvarlak ağaç: gövde + küre taç.
  function hitsTree(pos, br) {
    for (const t of trees) {
      if (!t.visible) continue;
      const dx = pos.x - t.x;
      const dz = pos.z - t.z;
      if (Math.abs(dx) > 3.5 || Math.abs(dz) > 3.5) continue;
      const d = Math.hypot(dx, dz);
      const k = t.k;
      const yy = pos.y - t.g;
      if (yy < 1.5 * k && d < 0.35 * k + br) return true;
      if (t.pine) {
        const y0 = 1.2 * k, R = 1.6 * k, h = 3.6 * k;
        const ly = yy - y0;
        if (ly < -br || ly > h + br) continue;
        const ry = R * (1 - THREE.MathUtils.clamp(ly, 0, h) / h);
        if ((d - ry) * (h / Math.hypot(h, R)) < br) return true;
      } else {
        const cy = yy - 3.1 * k;
        const rr = 1.4 * k + br;
        if (d * d + cy * cy < rr * rr) return true;
      }
    }
    return false;
  }

  return {
    hitsTree,
    setClearTest(fn) {
      clearTest = fn;
    },
    // Yeni dağ/halka çıktığında ağaçları yeniden yerleştir (dağın içinde ağaç kalmasın).
    refresh() {
      treeStrip.rewriteAll();
      markTrees();
    },
    update(pos) {
      if (treeStrip.update(pos.x, pos.z)) markTrees();
      if (red.strip.update(pos.x, pos.z)) red.mesh.instanceMatrix.needsUpdate = true;
      if (purple.strip.update(pos.x, pos.z)) purple.mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
