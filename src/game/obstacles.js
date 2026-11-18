import * as THREE from 'three';
import { FLIGHT } from './bird.js';
import { FORMATIONS, ringTrail } from './formations.js';
import { buildFormationMesh } from './karst.js';
import { groundHeight, surfaceHeight, WATER_LEVEL } from './terrain.js';
import { QUALITY } from './quality.js';

// Parkur ayarları: zorluk buradan ayarlanır.
export const COURSE = {
  firstAhead: 80,     // ilk formasyonun kuşa uzaklığı
  ahead: 170,         // yenileri kuşun bu kadar önünde (baktığı yönde) çıkar
  spacingStart: 75,   // başta iki formasyon arası mesafe (m), aralarında halkalar olur
  spacingMin: 50,     // zorlaştıkça inebileceği en kısa mesafe
  spacingStep: 1,     // her formasyonda mesafe bu kadar kısalır
  despawn: 300,       // kuştan bu kadar uzaklaşan her şey silinir
};

export const RING_R = 2.3;
const ringGeo = new THREE.TorusGeometry(RING_R, 0.28, 8, 20);
const ringMat = new THREE.MeshLambertMaterial({ color: '#ffcc33', emissive: '#aa6600', emissiveIntensity: 0.45 });

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TYPES = Object.keys(FORMATIONS);
const UP = new THREE.Vector3(0, 1, 0);

// --- Yerleştirme -------------------------------------------------------------
// Kuşun önünde `dist` metre ileride, kuşun yönüne göre yerel (u,w) → dünya (x,z).
export function placement(position, forward, dist) {
  const f = new THREE.Vector3(forward.x, 0, forward.z).normalize();
  const right = new THREE.Vector3(-f.z, 0, f.x);
  const ox = position.x + f.x * dist;
  const oz = position.z + f.z * dist;
  return {
    ox, oz, forward: f, right,
    yaw: Math.atan2(f.x, f.z), // halkaların yüzü kuşa dönük
    toWorld: (u, w = 0) => [ox + right.x * u + f.x * w, oz + right.z * u + f.z * w],
  };
}

// Formasyonun oturacağı yükseklik: açıklıkların altındaki en yüksek yer (ya da göl yüzeyi).
// Böylece halkalar hiçbir zaman yerin içinde kalmaz.
function formationBase(pl) {
  let hi = WATER_LEVEL;
  for (const [u, w] of [[0, 0], [-6, 0], [6, 0], [-12, 0], [12, 0], [0, -6], [0, 6]]) {
    const [x, z] = pl.toWorld(u, w);
    hi = Math.max(hi, groundHeight(x, z));
  }
  return hi;
}

// Yerel şekli dünyaya çevir. Yere değen uçlar arazinin 3 m içine gömülür (yamaçta havada kalmasın).
// bury verilirse araziye bakılmaz, yere değen uçlar tabanın `bury` metre altına uzatılır.
export function toWorldPrims(shape, pl, base, bury = null) {
  const point = (u, y, w) => {
    const [x, z] = pl.toWorld(u, w);
    let wy = base + y;
    if (y <= 0.01) wy = bury !== null ? base - bury : Math.min(groundHeight(x, z), base) - 3;
    return new THREE.Vector3(x, wy, z);
  };
  const back = pl.forward.clone().negate();
  return {
    pillars: shape.pillars.map((p) => ({
      ...p,
      a: point(p.u0, p.y0, p.w0 ?? 0),
      b: point(p.u1, p.y1, p.w1 ?? p.w0 ?? 0),
    })),
    arcs: shape.arcs.map((a) => {
      const [x, z] = pl.toWorld(a.u, a.w ?? 0);
      return { ...a, center: new THREE.Vector3(x, base + a.y, z), right: pl.right, up: UP, back };
    }),
    blobs: shape.blobs.map((b) => ({ pos: point(b.u, b.y, b.w ?? 0), r: b.r })),
  };
}

// --- Çarpışma ---------------------------------------------------------------
// Çizimdeki pürüzler (şişkinlikler) yüzünden çarpışma yarıçapları biraz büyütülür.

// Sütun = uçlarda farklı yarıçaplı kapsül: noktaya eksen üzerindeki en yakın nokta.
function hitSeg(s, p, br) {
  const abx = s.b.x - s.a.x, aby = s.b.y - s.a.y, abz = s.b.z - s.a.z;
  const apx = p.x - s.a.x, apy = p.y - s.a.y, apz = p.z - s.a.z;
  const t = THREE.MathUtils.clamp((apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  const r = (s.r0 + (s.r1 - s.r0) * t) * 1.1 + br;
  return dx * dx + dy * dy + dz * dz < r * r;
}

// Kemer = simit parçası: nokta kemer düzlemine indirilir, açısı aralıktaysa simit borusuna,
// değilse uçlardaki kaya yumrularına uzaklık ölçülür.
function hitArc(a, p, br) {
  const dx = p.x - a.center.x, dy = p.y - a.center.y, dz = p.z - a.center.z;
  const u = dx * a.right.x + dz * a.right.z;
  const w = -(dx * a.back.x + dz * a.back.z);
  const rt = a.rt * 1.08 + br;
  const rho = Math.hypot(u, dy);
  if (Math.abs(rho - a.R) > rt + 1 || Math.abs(w) > rt) return false;
  let ang = Math.atan2(dy, u);
  while (ang < a.a0) ang += Math.PI * 2;
  while (ang >= a.a0 + Math.PI * 2) ang -= Math.PI * 2;
  if (ang <= a.a1) return Math.hypot(rho - a.R, w) < rt;
  for (const e of [a.a0, a.a1]) {
    if (Math.hypot(u - Math.cos(e) * a.R, dy - Math.sin(e) * a.R, w) < rt) return true;
  }
  return false;
}

function hitBlob(b, p, br) {
  const rr = b.r * 0.95 + br;
  return b.pos.distanceToSquared(p) < rr * rr;
}

export function hitsPrims(prims, p, br) {
  return (
    prims.pillars.some((s) => hitSeg(s, p, br)) ||
    prims.arcs.some((a) => hitArc(a, p, br)) ||
    prims.blobs.some((b) => hitBlob(b, p, br))
  );
}

function hitsFormation(f, p, br) {
  if (Math.hypot(p.x - f.center.x, p.z - f.center.z) > f.bound + br + 4) return false; // uzaktaysa hiç bakma
  return hitsPrims(f.prims, p, br);
}

// --- Hazır formasyon havuzu --------------------------------------------------
// Kaya geometrisi (sarmaşıklar, birleştirme) pahalı. Oyun sırasında üretmek telefonda kısa
// donmalara yol açıyordu; bu yüzden açılışta her şekilden birkaç kopya YEREL koordinatta
// üretilir. Oyun sırasında sadece yerine konur, döndürülür ve bazen aynalanır.
const BURY = 10; // yere değen uçlar tabanın bu kadar altına uzanır → yamaçta da havada kalmaz
const LOCAL = placement(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0); // u → x, w → -z

function buildVariant(type) {
  const shape = FORMATIONS[type]();
  const prims = toWorldPrims(shape, LOCAL, 0, BURY);
  const mesh = buildFormationMesh(prims);
  const rings = shape.rings.map((r) => new THREE.Vector3(r.u, r.y, -(r.w ?? 0)));
  return { bound: shape.bound, prims, rings, geometry: mesh.geometry, material: mesh.material };
}

// Yerel parçaları dünyaya taşı (m: konum + dönüş + aynalama).
function transformPrims(local, m) {
  const tp = (v) => v.clone().applyMatrix4(m);
  const td = (v) => v.clone().transformDirection(m);
  return {
    pillars: local.pillars.map((p) => ({ ...p, a: tp(p.a), b: tp(p.b) })),
    arcs: local.arcs.map((a) => ({ ...a, center: tp(a.center), right: td(a.right), up: td(a.up), back: td(a.back) })),
    blobs: local.blobs.map((b) => ({ pos: tp(b.pos), r: b.r })),
  };
}

// --- Parkur yöneticisi ------------------------------------------------------
export function createObstacleCourse(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const pool = {};
  for (const type of TYPES) {
    pool[type] = Array.from({ length: QUALITY.formationVariants }, () => buildVariant(type));
  }

  let formations = []; // { center, bound, prims, mesh }
  let rings = [];      // { pos, mesh, collected, t }
  let travelled = 0;
  let nextEventAt = 0;
  let spacing = COURSE.spacingStart;
  let eventIndex = 0;
  let lastType = null;
  let layoutChanged = false;

  function addRing(pl, pos, owner = null) {
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.position.copy(pos);
    mesh.rotation.y = pl.yaw;
    root.add(mesh);
    // owner: halka bir formasyona aitse o formasyon. dir: halkanın baktığı (kuşun geleceği) yön.
    rings.push({ pos, mesh, collected: false, t: 0, owner, dir: pl.forward.clone() });
  }

  // Serbest halkaya düz yaklaşan kuşun yolu (halkanın 8 m önü ve arkası) kayaya çarpıyor mu?
  // Sadece halkanın etrafına bakmak yetmiyor: kuş dönmüşse halka bir sütunun hemen arkasına düşebilir.
  const _p = new THREE.Vector3();
  function ringPathBlocked(pos, dir, list = formations) {
    for (let w = -8; w <= 8; w += 0.5) {
      _p.copy(pos).addScaledVector(dir, w);
      if (list.some((f) => hitsFormation(f, _p, RING_R))) return true;
    }
    return false;
  }

  function pickType() {
    if (lastType === null) return 'kemer'; // ilk engel hep ters U
    let t;
    do t = pick(TYPES); while (t === lastType);
    return t;
  }

  function spawnFormation(bird, dist) {
    const pl = placement(bird.position, bird.forward, dist);
    const type = pickType();
    const variant = pick(pool[type]);
    const center = new THREE.Vector3(pl.ox, 0, pl.oz);
    // Kuş dönüp eski formasyonların yanına geldiyse üst üste bindirme.
    for (const o of formations) {
      if (Math.hypot(o.center.x - center.x, o.center.z - center.z) < o.bound + variant.bound + 8) return;
    }
    lastType = type;

    // Yerel kopyayı kuşun önüne, kuşa dönük koy; yarı yarıya aynala (çeşitlilik).
    const base = formationBase(pl);
    const mesh = new THREE.Mesh(variant.geometry, variant.material);
    mesh.position.set(pl.ox, base, pl.oz);
    mesh.rotation.y = Math.atan2(-pl.forward.x, -pl.forward.z);
    if (Math.random() < 0.5) mesh.scale.x = -1;
    mesh.updateMatrix();
    root.add(mesh);
    const prims = transformPrims(variant.prims, mesh.matrix);
    const f = { center, bound: variant.bound, prims, mesh };
    formations.push(f);

    // Yeni formasyon, henüz alınmamış serbest bir halkanın yolunu kapatıyorsa o halkayı kaldır.
    rings = rings.filter((rg) => {
      if (rg.collected || rg.owner || !ringPathBlocked(rg.pos, rg.dir, [f])) return true;
      root.remove(rg.mesh);
      return false;
    });
    for (const r of variant.rings) addRing(pl, r.clone().applyMatrix4(mesh.matrix), f);
    layoutChanged = true;
  }

  function spawnRingTrail(bird, dist) {
    const pl = placement(bird.position, bird.forward, dist);
    for (const r of ringTrail()) {
      const [x, z] = pl.toWorld(r.u, r.w);
      const y = Math.min(surfaceHeight(x, z) + r.y, FLIGHT.maxY - 3);
      const p = new THREE.Vector3(x, y, z);
      if (ringPathBlocked(p, pl.forward)) continue; // kayanın içine ya da arkasına halka koyma
      addRing(pl, p);
    }
    layoutChanged = true;
  }

  // Sırayla: formasyon, halka dizisi, formasyon, ... Bir sonraki olaya kalan mesafeyi döndürür.
  function spawnEvent(bird, dist) {
    if (eventIndex % 2 === 0) spawnFormation(bird, dist);
    else spawnRingTrail(bird, dist);
    eventIndex++;
    const step = spacing / 2;
    if (eventIndex % 2 === 0) spacing = Math.max(COURSE.spacingMin, spacing - COURSE.spacingStep);
    return step;
  }

  function removeFormation(f) {
    root.remove(f.mesh); // geometri havuzda, silinmez
  }

  function removeFar(bird) {
    const p = bird.position;
    const far = (x, z, extra = 0) => Math.hypot(x - p.x, z - p.z) > COURSE.despawn + extra;
    formations = formations.filter((f) => {
      if (!far(f.center.x, f.center.z, f.bound)) return true;
      removeFormation(f);
      return false;
    });
    rings = rings.filter((rg) => {
      if (!far(rg.pos.x, rg.pos.z)) return true;
      root.remove(rg.mesh);
      return false;
    });
  }

  const course = {
    // Test/hata ayıklama için: o anki formasyonlar ve halkalar (sadece okunur).
    inspect: () => ({ formations, rings }),

    // Yerleşim değişince çağrılır (main.js ağaçları yeniden dizmek için bağlar).
    onLayoutChange: () => {},

    // Bu noktaya ağaç konabilir mi? Formasyonların ve halkaların çevresi boş kalsın.
    isClear(x, z) {
      for (const f of formations) {
        const r = f.bound * 0.75 + 2;
        if ((x - f.center.x) ** 2 + (z - f.center.z) ** 2 < r * r) return false;
      }
      for (const rg of rings) {
        if (!rg.collected && (x - rg.pos.x) ** 2 + (z - rg.pos.z) ** 2 < 49) return false;
      }
      return true;
    },

    reset(bird) {
      for (const f of formations) removeFormation(f);
      for (const rg of rings) root.remove(rg.mesh);
      formations = [];
      rings = [];
      spacing = COURSE.spacingStart;
      eventIndex = 0;
      lastType = null;
      // Başlangıçta görüş mesafesi boyunca doldur.
      let d = COURSE.firstAhead;
      while (d <= COURSE.ahead) d += spawnEvent(bird, d);
      travelled = 0;
      nextEventAt = d - COURSE.ahead;
      layoutChanged = false;
      course.onLayoutChange();
    },

    // Her karede: yol aldıkça önde yenilerini üret, uzaktakileri sil,
    // halka toplandı mı ve kayaya çarpıldı mı bak.
    update(bird, dt) {
      travelled += FLIGHT.forwardSpeed * dt;
      while (travelled >= nextEventAt) nextEventAt += spawnEvent(bird, COURSE.ahead);
      removeFar(bird);
      if (layoutChanged) {
        layoutChanged = false;
        course.onLayoutChange();
      }

      let collected = 0;
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        if (!rg.collected) {
          rg.mesh.rotation.z += dt * 1.2;
          if (rg.pos.distanceTo(bird.position) < RING_R * 0.92) {
            rg.collected = true;
            collected++;
          }
        } else {
          // Toplanma efekti: hızla dönüp büyür, sonra kaybolur.
          rg.t += dt;
          rg.mesh.rotation.z += dt * 12;
          rg.mesh.scale.setScalar(1 + rg.t * 3);
          if (rg.t > 0.25) {
            root.remove(rg.mesh);
            rings.splice(i, 1);
          }
        }
      }

      const hit = formations.some((f) => hitsFormation(f, bird.position, bird.radius));
      return { collected, hit };
    },
  };
  return course;
}
