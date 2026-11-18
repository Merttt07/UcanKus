// Vücut noktalarından (MediaPipe Pose) kanat hareketlerini çıkarır.
// Kamera/model kodundan bağımsız: sadece nokta listesi alır → kolayca test edilir.
//
//   İki kol birlikte aşağı: çırpış → kuş yükselir (dönmez).
//   Tek kol aşağı:          o tarafa dönüş + biraz yükselme.
//                           Ters kolla çırpınca mevcut dönüş aşılır (bkz. bird.js).
//   İki el başın üstünde ~1 sn: dur/devam.
//
// "Aşağı çırpma" = kolun kısa sürede yeterince hızlı inmesi; sonuna kadar indirmek gerekmez.
// Bütün mesafeler "omuz genişliği" cinsinden: kameraya yakın ya da uzak durmak fark etmez.

export const GESTURE = {
  flapDistance: 0.35,  // kolun aşağı inmesi gereken mesafe (omuz genişliği)
  flapWindow: 0.6,     // ... bu kadar saniye içinde
  flapMinSpeed: 2,     // en az bu hızla (omuz genişliği/sn); yavaşça kol indirmek çırpış değil
  rearm: 0.2,          // aynı kolla yeni çırpış için kolun en az bu kadar geri kalkması gerekir
  refSpeed: 7,         // bu hızda çırpış gücü 1
  minStrength: 0.6,
  maxStrength: 1.3,
  pairWindow: 0.12,    // iki kol bu kadar saniye arayla inerse "birlikte" sayılır
  singleLift: 0.5,     // tek kol çırpışının yükseltme gücü (iki kola göre)
  handsUpY: -1.1,      // iki bilek de omuzların bu kadar üstündeyse "eller başın üstünde"
  handsUpHold: 1.0,    // ... ve bu kadar saniye tutulursa dur/devam
  handsDownY: 1.0,     // dur/devamdan sonra kollar bu kadar inene dek çırpış sayılmaz
  minVisibility: 0.35, // noktanın "görünüyor" sayılması için gereken güven
};

// MediaPipe Pose nokta numaraları (kişinin kendi sağı/solu; görüntü aynası değil).
const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14, L_WRIST = 15, R_WRIST = 16;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Tek bir kolun aşağı çırpışını algılar. update() çırpış anında gücü, yoksa 0 döndürür.
function createArmDetector(cfg) {
  const history = []; // son flapWindow saniyedeki kol yüksekliği: { t, y }
  let armed = true;   // yeni çırpışa hazır mı (kol önce geri kalkmalı)
  let bottom = 0;     // son çırpıştan beri kolun indiği en alt nokta
  return {
    reset() {
      history.length = 0;
    },
    // Kol inmiş durumda başlasın: önce kalkması gereksin.
    disarm(y) {
      armed = false;
      bottom = y;
      history.length = 0;
    },
    update(y, t) {
      history.push({ t, y });
      while (history.length && t - history[0].t > cfg.flapWindow) history.shift();
      if (armed) {
        // Pencere içindeki en yüksek noktadan (en son anından) buraya ne kadar hızlı inildi?
        let top = Infinity;
        let topT = t;
        for (const s of history) {
          if (s.y <= top) {
            top = s.y;
            topT = s.t;
          }
        }
        const drop = y - top;
        const speed = drop / Math.max(t - topT, 1e-3);
        if (drop > cfg.flapDistance && speed > cfg.flapMinSpeed) {
          armed = false;
          bottom = y;
          return clamp(speed / cfg.refSpeed, cfg.minStrength, cfg.maxStrength);
        }
      } else {
        // İnmeye devam ederken en alt noktayı izle; geri kalkınca yeni çırpışa hazır.
        bottom = Math.max(bottom, y);
        if (y < bottom - cfg.rearm) {
          armed = true;
          history.length = 0;
          history.push({ t, y });
        }
      }
      return 0;
    },
  };
}

export function createWingTracker(cfg = GESTURE) {
  const arms = { L: createArmDetector(cfg), R: createArmDetector(cfg) };
  const lastSource = { L: null, R: null }; // 'bilek' | 'dirsek'
  let pending = null;      // tek kol inmiş; öbür kol da gelecek mi diye kısa süre beklenir
  let handsUpSince = null; // eller ne zamandan beri başın üstünde
  let toggleLatch = false; // dur/devam tetiklendi; kollar inene kadar çırpış/tetik yok

  const result = (o) => ({ visible: true, reason: null, flap: 0, turn: 0, toggle: false, holdProgress: 0, ...o });

  // landmarks: [{x, y, visibility}] (0..1 normalize) ya da null; t: saniye; w,h: görüntü boyutu.
  // Döner: { visible, reason, flap (yükseltme gücü, 0 = yok), turn (-güç sol .. +güç sağ),
  //          toggle (dur/devam), holdProgress (0..1), leftY, rightY }
  function update(landmarks, t, w, h) {
    const lost = (reason) => {
      arms.L.reset();
      arms.R.reset();
      pending = null;
      handsUpSince = null;
      return result({ visible: false, reason });
    };
    if (!landmarks) return lost('kişi yok');

    // Piksele çevir: x ve y'nin ölçeği aynı olsun.
    const P = (i) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h, v: landmarks[i].visibility ?? 1 });
    const ls = P(L_SHOULDER), rs = P(R_SHOULDER);
    if (ls.v < cfg.minVisibility || rs.v < cfg.minVisibility) return lost('omuzlar görünmüyor');
    const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    if (sw < 1) return lost('omuzlar görünmüyor');
    const shY = (ls.y + rs.y) / 2;

    // Her kolun yüksekliği: bilek görünüyorsa bilekten; kadrajdan çıktıysa dirsekten
    // (dirsek bileğin yaklaşık yarısı kadar hareket eder, o yüzden 2 ile çarpılır).
    const armHeight = (side, wristIdx, elbowIdx) => {
      const wr = P(wristIdx);
      let source, y;
      if (wr.v >= cfg.minVisibility) {
        source = 'bilek';
        y = (wr.y - shY) / sw;
      } else {
        const el = P(elbowIdx);
        if (el.v < cfg.minVisibility) return null;
        source = 'dirsek';
        y = (2 * (el.y - shY)) / sw;
      }
      if (source !== lastSource[side]) {
        arms[side].reset(); // bilekten dirseğe geçişteki sıçrama çırpış sanılmasın
        lastSource[side] = source;
      }
      return { y, source };
    };
    const left = armHeight('L', L_WRIST, L_ELBOW);
    const right = armHeight('R', R_WRIST, R_ELBOW);
    if (!left || !right) return lost('kollar görünmüyor');
    const leftY = left.y;   // + = omuzların altında
    const rightY = right.y;

    // --- Dur/devam: iki el de başın üstünde, belli bir süre (sadece bileklerle) ---
    let toggle = false;
    let holdProgress = 0;
    const handsUp = left.source === 'bilek' && right.source === 'bilek' && leftY < cfg.handsUpY && rightY < cfg.handsUpY;
    if (toggleLatch) {
      if ((leftY + rightY) / 2 > cfg.handsDownY) {
        toggleLatch = false;
        arms.L.disarm(leftY);
        arms.R.disarm(rightY);
      }
      return result({ leftY, rightY });
    }
    if (handsUp) {
      if (handsUpSince === null) handsUpSince = t;
      holdProgress = Math.min(1, (t - handsUpSince) / cfg.handsUpHold);
      if (holdProgress >= 1) {
        toggle = true;
        toggleLatch = true;
        handsUpSince = null;
        pending = null;
        return result({ toggle, holdProgress, leftY, rightY });
      }
    } else {
      handsUpSince = null;
    }

    // --- Çırpış: iki kol birlikte mi, tek kol mu? ---
    const sL = arms.L.update(leftY, t);
    const sR = arms.R.update(rightY, t);
    let flap = 0;
    let turn = 0;
    if (sL && sR) {
      flap = Math.max(sL, sR);
      pending = null;
    } else if (sL || sR) {
      const side = sL ? 'L' : 'R';
      const s = sL || sR;
      if (pending && pending.side !== side) {
        flap = Math.max(pending.s, s); // öbür kol da geldi → birlikte çırpış
        pending = null;
      } else {
        pending = { side, s, t };
      }
    }
    // Öbür kol gelmedi → tek kol çırpışı: o tarafa dön.
    if (pending && t - pending.t >= cfg.pairWindow) {
      flap = pending.s * cfg.singleLift;
      turn = (pending.side === 'R' ? 1 : -1) * pending.s;
      pending = null;
    }
    return result({ flap, turn, holdProgress, leftY, rightY });
  }

  return { update };
}
