import * as THREE from 'three';

// Çin manzarası tarzı kaya formasyonları. Hepsi YEREL koordinatta:
//   u = sağ(+)/sol(-), y = formasyonun tabanından yükseklik, w = ileri (kuşun uçtuğu yön)
// obstacles.js bunları kuşun o anki yönüne çevirip önüne, araziye oturtur.
//
// Parça türleri:
//   pillars: kaya sütunu / kol  {u0,y0,w0, u1,y1,w1, r0 (alt uç yarıçapı), r1 (üst uç), cap, capStart, vines, hang}
//            y=0'a değen uç yerin içine gömülür.
//   arcs:    yuvarlak kemer      {u, y, w, R (yarıçap), rt (kalınlık), a0, a1 (açı aralığı, radyan)}
//            açılar u-y düzleminde: 0 = sağ, π/2 = yukarı
//   blobs:   kaya yumrusu        {u, y, w, r}
//   rings:   halka               {u, y, w}
// bound: formasyonun kabaca yarıçapı.

const rand = (a, b) => a + Math.random() * (b - a);

// Dikey sütun.
function pillar(u, w, h, r, opts = {}) {
  return { u0: u, y0: 0, w0: w, u1: u, y1: h, w1: w, r0: r * 1.2, r1: r, cap: 'green', vines: true, ...opts };
}

// Ana şeklin yanında yükselen ince uzun "kardeş" sütunlar.
function companions(minU, n, sides = [-1, 1]) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = sides[i % sides.length];
    out.push(pillar(side * (minU + rand(0, 7)), rand(-8, 8), rand(24, 46), rand(2.2, 3.4)));
  }
  return out;
}

// Şekli sağ-sol ayna çevir (ters L ve R iki yöne de baksın).
function mirror(s) {
  for (const p of s.pillars) {
    p.u0 = -p.u0;
    p.u1 = -p.u1;
  }
  for (const a of s.arcs) {
    a.u = -a.u;
    [a.a0, a.a1] = [Math.PI - a.a1, Math.PI - a.a0];
  }
  for (const b of s.blobs) b.u = -b.u;
  for (const r of s.rings) r.u = -r.u;
  return s;
}
const maybeMirror = (s) => (Math.random() < 0.5 ? mirror(s) : s);

export const FORMATIONS = {
  // Ters U: iki sütunun üstünde yarım daire kemer. Halka kemerin altında.
  kemer() {
    const Ra = rand(7, 8.5);
    const rt = rand(2.4, 2.8);
    const springY = rand(6, 9); // kemerin başladığı yükseklik
    const rp = rt + 0.3;
    return {
      pillars: [
        { u0: -Ra, y0: 0, u1: -Ra, y1: springY, r0: rp * 1.25, r1: rp, cap: 'none', vines: true },
        { u0: Ra, y0: 0, u1: Ra, y1: springY, r0: rp * 1.25, r1: rp, cap: 'none', vines: true },
        ...companions(Ra + 6, 1 + Math.floor(Math.random() * 2)),
      ],
      arcs: [{ u: 0, y: springY, w: 0, R: Ra, rt, a0: 0, a1: Math.PI }],
      blobs: [],
      rings: [{ u: 0, y: Math.max(3.2, springY * 0.7), w: 0 }],
      bound: Ra + 17,
    };
  },

  // Ters L (Γ): uzun sütundan yana uzanan kol; köşenin altı yuvarlak. Halka kolun altında.
  tersL() {
    const H = rand(30, 42);
    const rp = rand(2.8, 3.3);
    const rt = rand(2.2, 2.6);
    const ovY = rand(13, 17); // kolun yüksekliği
    const Rq = rand(4, 5.5);  // köşe yuvarlaklığı
    const L = rand(7, 11);    // kolun uzunluğu
    const ex = Rq + L;
    const ey = ovY - rand(0, 1.5); // kol ucu hafif aşağı sarkar
    return maybeMirror({
      pillars: [
        pillar(0, 0, H, rp),
        { u0: Rq, y0: ovY, w0: 0, u1: ex, y1: ey, w1: 0, r0: rt, r1: rt * 0.9, cap: 'rock', vines: false, hang: true },
        ...companions(8, 1, [-1]),
      ],
      // Merkezi (Rq, ovY-Rq): sütundan (açı π) başlayıp kolun başına (açı π/2) kıvrılır.
      arcs: [{ u: Rq, y: ovY - Rq, w: 0, R: Rq, rt, a0: Math.PI / 2, a1: Math.PI }],
      blobs: [],
      rings: [{ u: Rq + L * 0.45, y: ovY - 6.8, w: 0 }],
      bound: ex + 8,
    });
  },

  // R: dik gövde, üstte D biçiminde yuvarlak göbek, çapraz bacak. Halka göbeğin içinde.
  r() {
    const rp = 2.8;
    const Rb = rand(9.4, 10);
    const rt = 2.4;
    const c = 2.6;            // göbeğin merkezi gövdeden bu kadar sağda
    const yb = rand(14.5, 16.5);
    return maybeMirror({
      pillars: [
        pillar(0, 0, yb + Rb + 1, rp),
        { u0: c + 1, y0: yb - Rb, w0: 0, u1: c + Rb * 1.2, y1: 0, w1: 0, r0: rt, r1: rt * 1.2, cap: 'none', capStart: 'rock', vines: true },
      ],
      arcs: [{ u: c, y: yb, w: 0, R: Rb, rt, a0: -Math.PI / 2, a1: Math.PI / 2 }],
      blobs: [],
      rings: [{ u: c + 3.8, y: yb, w: 0 }],
      bound: c + Rb * 1.2 + 8,
    });
  },

  // Ay kapısı: kısa bir kaya kaidesinin üstünde tam daire, iki yanında ince sütunlar.
  ayKapisi() {
    const Rm = rand(6.5, 7.5);
    const rt = 2.5;
    const cy = Rm + rand(3.5, 5); // dairenin merkezi
    return {
      pillars: [
        { u0: 0, y0: 0, u1: 0, y1: cy - Rm + 0.8, r0: 4.2, r1: 3, cap: 'none', vines: false },
        ...companions(Rm + 5, 2),
      ],
      arcs: [{ u: 0, y: cy, w: 0, R: Rm, rt, a0: 0, a1: Math.PI * 2 }],
      blobs: [],
      rings: [{ u: 0, y: cy, w: 0 }],
      bound: Rm + 16,
    };
  },

  // Sütun ormanı: farklı boylarda ince uzun sütunlar, aralarından süzülmek gerek.
  orman() {
    const n = 6 + Math.floor(Math.random() * 4);
    const pillars = [];
    for (let tries = 0; pillars.length < n && tries < 200; tries++) {
      const u = rand(-22, 22);
      const w = rand(-16, 16);
      const r = rand(2, 3.8);
      if (pillars.some((p) => Math.hypot(p.u0 - u, p.w0 - w) < p.r0 + r * 1.2 + 6)) continue;
      pillars.push(pillar(u, w, rand(18, 50), r));
    }
    const rings = [];
    for (let tries = 0; rings.length < 2 && tries < 40; tries++) {
      const u = rand(-14, 14);
      const w = rand(-10, 10);
      // Sadece halkanın etrafı değil, halkaya düz yaklaşma yolu (önü ve arkası 12 m) da boş olmalı.
      const clear = pillars.every(
        (p) => Math.abs(p.u0 - u) > p.r0 * 1.35 + 3.2 || Math.abs(p.w0 - w) > 12 + p.r0 * 1.3,
      );
      if (clear) rings.push({ u, y: rand(5, 14), w });
    }
    return { pillars, arcs: [], blobs: [], rings, bound: 30 };
  },
};

// Dağ grupları arasına serpiştirilen halka dizisi (y = o noktadaki yerden yükseklik).
export function ringTrail() {
  const n = 3 + Math.floor(Math.random() * 2);
  let y = rand(5, 14);
  let u = rand(-4, 4);
  const rings = [];
  for (let i = 0; i < n; i++) {
    rings.push({ u, y, w: (i - (n - 1) / 2) * 9 });
    y = THREE.MathUtils.clamp(y + rand(-2.5, 2.5), 3.5, 16.5);
    u += rand(-3, 3);
  }
  return rings;
}
