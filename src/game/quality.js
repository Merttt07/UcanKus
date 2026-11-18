// Grafik kalitesi: telefonda otomatik "düşük", bilgisayarda "yüksek".
// Elle seçmek için adrese ekle: ?kalite=dusuk  ya da  ?kalite=yuksek
// Ayrıca main.js oyun sırasında kare hızına bakıp çözünürlüğü kendiliğinden düşürür.

const inBrowser = typeof window !== 'undefined';
const forced = inBrowser ? new URLSearchParams(window.location.search).get('kalite') : null;
const isMobile =
  inBrowser &&
  (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export const LOW_QUALITY = forced ? forced === 'dusuk' : isMobile;

export const QUALITY = LOW_QUALITY
  ? {
      name: 'düşük',
      pixelRatio: 0.8,           // ekran çözünürlüğü çarpanı (başlangıç)
      minPixelRatio: 0.5,        // kare hızı düşerse en fazla buraya kadar inilir
      targetFps: 50,             // bunun altında çözünürlük azaltılır
      antialias: false,
      fogNear: 40,
      fogFar: 150,               // görüş mesafesi; arazi de buna göre küçülür
      terrainSize: 320,
      terrainSegments: 40,       // arazi ızgarası (köşe sayısı ~ bunun karesi)
      trees: 90,
      flowersPerColor: 120,
      vineDensity: 0.2,          // sarmaşık yaprağı miktarı çarpanı
      pillarSides: 6,            // kaya sütunlarının kenar sayısı
      backdrop: { far: 12, thin: 10, mid: 3 },
      formationVariants: 3,      // her şekilden açılışta hazırlanan kopya sayısı
      transparentWater: false,   // saydam su her karede ek çizim maliyeti
      poseIntervalMs: 80,        // vücut algılama en fazla ~12 kez/sn
      camWidth: 320,
      camHeight: 240,
      detectWidth: 256,          // algılamaya gönderilen görüntünün genişliği
    }
  : {
      name: 'yüksek',
      pixelRatio: inBrowser ? Math.min(window.devicePixelRatio, 1.5) : 1,
      minPixelRatio: 0.75,
      targetFps: 45,
      antialias: true,
      fogNear: 70,
      fogFar: 230,
      terrainSize: 480,
      terrainSegments: 120,
      trees: 420,
      flowersPerColor: 700,
      vineDensity: 1,
      pillarSides: 10,
      backdrop: { far: 28, thin: 34, mid: 10 },
      formationVariants: 4,
      transparentWater: true,
      poseIntervalMs: 0,         // her kamera karesinde
      camWidth: 640,
      camHeight: 480,
      detectWidth: 320,
    };
