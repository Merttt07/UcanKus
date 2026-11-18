// Menü katmanları (başlangıç, duraklatma, oyun sonu) ve skor yazısı.
// Oyunun durumunu bilmez; sadece gösterir ve butonlara basılınca main.js'e haber verir.
export function createMenu({ onPause, onResume, onRestart }) {
  const $ = (id) => document.getElementById(id);
  const overlays = {
    ready: $('menu-ready'),
    pause: $('menu-pause'),
    over: $('menu-over'),
  };
  const scoreEl = $('score');
  const pauseBtn = $('pause-btn');

  // Tıklanan buton odakta kalırsa sonraki Space basışı onu tekrar tetikler; odağı bırak.
  const handler = (fn) => (e) => {
    e.currentTarget.blur();
    fn();
  };
  pauseBtn.addEventListener('click', handler(onPause));
  $('resume-btn').addEventListener('click', handler(onResume));
  $('restart-btn').addEventListener('click', handler(onRestart));
  $('again-btn').addEventListener('click', handler(onRestart));

  // name: 'ready' | 'pause' | 'over' | null (null = oyun oynanıyor, menü yok)
  function show(name) {
    for (const [key, el] of Object.entries(overlays)) el.hidden = key !== name;
    pauseBtn.hidden = name !== null;
  }

  // Menülerdeki kontrol yönergeleri: 'loading' | 'pose' | 'touch' (kamera açılamadı, yedek kontrol)
  const HINTS = {
    loading: ['Kamera hazırlanıyor…', 'Kamera hazırlanıyor…', ''],
    pose: [
      'İki kolu birlikte çırp: yüksel · Tek kolu çırp: o tarafa dön · Ellerini başının üstünde tut: dur',
      'Başlamak için kollarını çırp',
      'ya da kollarını çırp',
    ],
    touch: [
      'Dokun / Space: çırp · Sol-sağ kenar / A-D: dön · ESC: dur',
      'Başlamak için dokun',
      'ya da dokun / Space',
    ],
  };

  return {
    show,
    setControlMode(mode, note = '') {
      const [controls, start, again] = HINTS[mode];
      $('controls-hint').textContent = note ? `${note} ${controls}` : controls;
      $('start-hint').textContent = start;
      $('again-hint').textContent = again;
    },
    setScore(n) {
      scoreEl.textContent = n;
    },
    showGameOver(reason, score, best) {
      $('over-reason').textContent = reason;
      $('final-score').textContent = score;
      $('best-score').textContent = best;
      show('over');
    },
  };
}
