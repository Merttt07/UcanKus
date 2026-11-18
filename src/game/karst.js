import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash, paintFaces, positionsOnly, choose, palette } from './geoUtils.js';
import { QUALITY } from './quality.js';

// Düşük kalitede daha az ama biraz daha büyük yaprak.
const VD = QUALITY.vineDensity;
const LEAF_STEP = 1 / Math.sqrt(VD);

// Çin manzarası tarzı ince uzun kaya sütunlarının görünümü.
// Bir formasyonun bütün parçaları (sütunlar, kemerler, yeşil tepeler, sarmaşıklar)
// tek bir geometriye birleştirilir → formasyon başına tek çizim çağrısı.
//
// Girdi (dünya koordinatında):
//   pillars: { a, b (Vector3 uçlar), r0 (a'daki yarıçap), r1 (b'deki), cap, capStart, vines, hang }
//   arcs:    { center, right, up, back (Vector3), R, rt, a0, a1 }  — yuvarlak kemer/halka
//   blobs:   { pos, r }

const ROCK = palette('#a8a295', '#9a9487', '#b4aea1', '#8f897d');
const STREAK = palette('#77726a', '#6b675f');
const MOSS = palette('#5f8f45', '#6d9e4d', '#557f3e');
const CANOPY = palette('#4a8a3a', '#57983f', '#3f7a33', '#62a348');
const VINE = palette('#3d7b30', '#4b8f3d', '#5aa548', '#356b2a');
const VINE_FLOWER = palette('#e8394d', '#9a4fd8', '#f2f2f2');

export const karstMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

// Kaya rengi: yukarı bakan yüzler yosunlu, arada koyu damarlar.
const rockPaint = (c, n, r) => {
  if (n.y > 0.55 && r < 0.85) return choose(MOSS, r / 0.85);
  if (r > 0.9) return choose(STREAK, r);
  return choose(ROCK, r);
};
const canopyPaint = (c, n, r) => choose(CANOPY, r);

// Sütun boyunca şişkinlik çarpanı; sarmaşıklar da yüzeye otursun diye ortak.
const bulge = (y, seed) => 1 + 0.12 * Math.sin(y * 0.45 + seed * 3.1) + 0.07 * Math.sin(y * 1.3 + seed);

// --- Yapraklar: hepsi tek bir dizide toplanır ---
const LEAF = Array.from(new THREE.OctahedronGeometry(1, 0).attributes.position.array);
const _lm = new THREE.Matrix4();
const _lq = new THREE.Quaternion();
const _le = new THREE.Euler();
const _ls = new THREE.Vector3();
const _lv = new THREE.Vector3();
const _lc = new THREE.Color();

class LeafBatch {
  constructor() {
    this.pos = [];
    this.col = [];
  }
  add(p, size, color) {
    _lq.setFromEuler(_le.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
    _lm.compose(p, _lq, _ls.set(size, size * 0.45, size * 1.3));
    for (let i = 0; i < LEAF.length; i += 3) {
      _lv.set(LEAF[i], LEAF[i + 1], LEAF[i + 2]).applyMatrix4(_lm);
      this.pos.push(_lv.x, _lv.y, _lv.z);
    }
    for (let f = 0; f < LEAF.length / 9; f++) {
      _lc.copy(color).multiplyScalar(0.85 + Math.random() * 0.3);
      for (let k = 0; k < 3; k++) this.col.push(_lc.r, _lc.g, _lc.b);
    }
  }
  // Sarmaşık yaprağı; arada bir küçük çiçek.
  vine(p, size) {
    if (Math.random() < 0.05) this.add(p, size * 0.7, choose(VINE_FLOWER, Math.random()));
    else this.add(p, size, choose(VINE, Math.random()));
  }
  // Bir noktadan aşağı sarkan sarmaşık dalı.
  hangFrom(start, length) {
    const sway = rand(0, 6.3);
    for (let d = 0; d < length; d += 0.45 * LEAF_STEP) {
      _lv.set(start.x + Math.sin(d * 0.8 + sway) * 0.15, start.y - d, start.z + Math.cos(d * 0.7 + sway) * 0.15);
      this.vine(_lv.clone(), (0.42 - (d / length) * 0.2) * Math.sqrt(LEAF_STEP));
    }
  }
  toGeometry() {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

// --- Parçalar ---

function addBlob(geos, pos, r, seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.88 + hash(x, y, z, seed) * 0.24;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.scale(r, r, r).translate(pos.x, pos.y, pos.z);
  geos.push(paintFaces(positionsOnly(g), rockPaint));
}

// Sütunun tepesindeki yeşil kubbe + üstünde birkaç küçük çam.
function addCanopy(geos, top, r, quat, seed) {
  const m = new THREE.Matrix4().compose(top, quat, new THREE.Vector3(1, 1, 1));
  const g = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.85 + hash(x, y, z, seed) * 0.3;
    p.setXYZ(i, x * k * r * 1.2, y * k * r * 0.75 - 0.3, z * k * r * 1.2);
  }
  g.applyMatrix4(m);
  geos.push(paintFaces(positionsOnly(g), canopyPaint));

  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r * 0.6;
    const h = rand(2, 3.6);
    const cone = new THREE.ConeGeometry(rand(0.7, 1.1), h, 6);
    cone.translate(Math.cos(a) * d, r * 0.45 + h / 2, Math.sin(a) * d);
    cone.applyMatrix4(m);
    geos.push(paintFaces(positionsOnly(cone), canopyPaint));
  }
}

function addPillar(geos, leaves, pl, seed) {
  const dir = new THREE.Vector3().subVectors(pl.b, pl.a);
  const len = dir.length();
  dir.divideScalar(len);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const mid = pl.a.clone().add(pl.b).multiplyScalar(0.5);
  const m = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));

  // Yerel uzayda: eksen y, -len/2 (a ucu) .. +len/2 (b ucu).
  const g = new THREE.CylinderGeometry(pl.r1, pl.r0, len, QUALITY.pillarSides, Math.max(3, Math.round(len / (2.2 * LEAF_STEP))), true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ang = Math.atan2(z, x);
    const k = bulge(y, seed) * (1 + 0.07 * Math.sin(ang * 3 + seed * 1.7)) * (1 + (hash(x, y, z, seed) - 0.5) * 0.16);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.applyMatrix4(m);
  geos.push(paintFaces(positionsOnly(g), rockPaint));

  const topR = pl.r1 * bulge(len / 2, seed);
  if (pl.cap === 'green') addCanopy(geos, pl.b, topR, quat, seed);
  else if (pl.cap === 'rock') addBlob(geos, pl.b, topR * 1.05, seed + 0.5);
  if (pl.capStart === 'rock') addBlob(geos, pl.a, pl.r0 * bulge(-len / 2, seed) * 1.05, seed + 0.7);

  // Yüzey boyunca aşağı inen sarmaşıklar.
  if (pl.vines) {
    const count = Math.max(1, Math.round(Math.min(9, 2 + Math.round(len / 7)) * VD));
    const local = new THREE.Vector3();
    for (let v = 0; v < count; v++) {
      let th = Math.random() * Math.PI * 2;
      const yTop = len / 2 - rand(0.3, 3);
      const L = rand(5, Math.min(18, len * 0.7));
      for (let y = yTop; y > yTop - L; y -= 0.5 * LEAF_STEP) {
        th += Math.sin(y * 0.35 + v) * 0.05;
        const t = (y + len / 2) / len;
        const r = (pl.r0 + (pl.r1 - pl.r0) * t) * bulge(y, seed) * 1.16 + 0.15;
        local.set(Math.cos(th) * r, y, Math.sin(th) * r).applyMatrix4(m);
        const size = (0.3 + 0.25 * ((y - (yTop - L)) / L)) * Math.sqrt(LEAF_STEP);
        leaves.vine(local.clone(), size);
        if (Math.random() < 0.25 * VD) {
          local.set(Math.cos(th + 0.2) * r, y + 0.2, Math.sin(th + 0.2) * r).applyMatrix4(m);
          leaves.vine(local.clone(), size * 0.8);
        }
      }
    }
  }

  // Yatay/eğik kolların altından sarkan sarmaşıklar.
  if (pl.hang) {
    const pt = new THREE.Vector3();
    for (let d = 1; d < len - 0.5; d += 1.1) {
      if (Math.random() > 0.65 * Math.sqrt(VD)) continue;
      const t = d / len;
      pt.lerpVectors(pl.a, pl.b, t);
      pt.y -= (pl.r0 + (pl.r1 - pl.r0) * t) * 0.85;
      leaves.hangFrom(pt.clone(), rand(1, 3.5));
    }
  }
}

function addArc(geos, leaves, a, seed) {
  const span = a.a1 - a.a0;
  const full = span > Math.PI * 2 - 0.01;
  const m = new THREE.Matrix4().makeBasis(a.right, a.up, a.back).setPosition(a.center);

  const g = new THREE.TorusGeometry(a.R, a.rt, 9, Math.max(10, Math.round((span * a.R) / 1.4)), span);
  const p = g.attributes.position;
  const ring = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const phi = Math.atan2(v.y, v.x);
    ring.set(Math.cos(phi) * a.R, Math.sin(phi) * a.R, 0);
    const k = 1 + (hash(v.x, v.y, v.z, seed) - 0.5) * 0.22 + 0.08 * Math.sin(phi * 5 + seed);
    v.sub(ring).multiplyScalar(k).add(ring);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.rotateZ(a.a0);
  g.applyMatrix4(m);
  geos.push(paintFaces(positionsOnly(g), rockPaint));

  // Açık uçlar kaya yumrusuyla kapansın.
  if (!full) {
    for (const e of [a.a0, a.a1]) {
      addBlob(geos, new THREE.Vector3(Math.cos(e) * a.R, Math.sin(e) * a.R, 0).applyMatrix4(m), a.rt * 1.05, seed + e);
    }
  }

  // Kemerin iç tavanından sarkan, sırtını saran sarmaşıklar.
  const local = new THREE.Vector3();
  for (let phi = a.a0; phi <= a.a1; phi += 1.6 / a.R) {
    const s = Math.sin(phi);
    if (s > 0.3 && Math.random() < 0.55 * Math.sqrt(VD)) {
      const off = rand(-0.6, 0.6) * a.rt;
      const rho = a.R - Math.sqrt(a.rt * a.rt - off * off) * 0.95;
      local.set(Math.cos(phi) * rho, s * rho, off).applyMatrix4(m);
      leaves.hangFrom(local.clone(), rand(1, 3.2));
    }
    if (s > 0.2) {
      for (let j = 0; j < Math.max(1, Math.round(3 * VD)); j++) {
        const beta = rand(-1.1, 1.1);
        const rho = a.R + a.rt * 1.1 * Math.cos(beta);
        local.set(Math.cos(phi) * rho, s * rho, a.rt * 1.1 * Math.sin(beta)).applyMatrix4(m);
        leaves.vine(local.clone(), rand(0.35, 0.55));
      }
    }
  }
}

export function buildFormationMesh(prims) {
  const geos = [];
  const leaves = new LeafBatch();
  let seed = Math.random() * 100;
  for (const pl of prims.pillars) addPillar(geos, leaves, pl, seed++);
  for (const a of prims.arcs) addArc(geos, leaves, a, seed++);
  for (const b of prims.blobs) addBlob(geos, b.pos, b.r, seed++);
  const lg = leaves.toGeometry();
  if (lg) geos.push(lg);

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  merged.computeVertexNormals();
  return new THREE.Mesh(merged, karstMat);
}
