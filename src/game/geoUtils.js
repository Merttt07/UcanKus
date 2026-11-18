import * as THREE from 'three';

// Geometri üretiminde ortak yardımcılar.

// Konumdan türeyen sözde-rastgele sayı (0..1). Aynı noktadaki köşeler (geometrinin
// dikiş yerleri) aynı değeri alır, böylece pürüzlendirince yüzeyde çatlak oluşmaz.
const q = (v) => Math.round(v * 100) / 100;
export function hash(x, y, z, seed = 0) {
  const s = Math.sin(q(x) * 127.1 + q(y) * 311.7 + q(z) * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

// Sadece konum bilgisini tutan indekssiz kopya (birleştirme için hepsi aynı biçimde olmalı).
export function positionsOnly(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  return out;
}

// Her üçgeni tek renge boyar (low-poly görünüm).
// pick(merkez, yüzNormali, rastgele0..1) → THREE.Color
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Vector3();
const _m = new THREE.Vector3();
export function paintFaces(geo, pick) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    _n.subVectors(_b, _a).cross(_e.subVectors(_c, _a)).normalize();
    _m.copy(_a).add(_b).add(_c).divideScalar(3);
    const col = pick(_m, _n, hash(_m.x, _m.y, _m.z, 3));
    for (let k = 0; k < 3; k++) col.toArray(colors, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export const choose = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
export const palette = (...hex) => hex.map((h) => new THREE.Color(h));
