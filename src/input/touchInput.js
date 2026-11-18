import { inputState } from './inputState.js';

// Dokunma: her dokunuş çırpar. Ekranın sol/sağ üçte birlik kısmına basılı tutmak döndürür.
// Klavye: Space/W/↑ çırpar, A/D/←/→ döndürür.
// Kamera kontrolü çalışıyorsa (inputState.poseActive) bunların hiçbiri uçuşu etkilemez;
// sadece kamera açılamadığında yedek kontrol olarak kullanılır.
export function initTouchInput(target) {
  const pointers = new Map(); // pointerId -> steer yönü
  const keys = new Set();

  const zoneOf = (x) => {
    const w = window.innerWidth;
    if (x < w / 3) return -1;
    if (x > (w * 2) / 3) return 1;
    return 0;
  };

  const update = () => {
    if (inputState.poseActive) return;
    let s = 0;
    for (const d of pointers.values()) s += d;
    if (keys.has('left')) s -= 1;
    if (keys.has('right')) s += 1;
    inputState.steer = Math.max(-1, Math.min(1, s));
  };

  target.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointers.set(e.pointerId, zoneOf(e.clientX));
    if (!inputState.poseActive) inputState.flap(1);
    update();
  });
  target.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, zoneOf(e.clientX));
    update();
  });
  const up = (e) => { pointers.delete(e.pointerId); update(); };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('pointerleave', up);

  const keyMap = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
      if (!e.repeat && !inputState.poseActive) inputState.flap(1);
      e.preventDefault();
      return;
    }
    const k = keyMap[e.code];
    if (k) { keys.add(k); update(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.code];
    if (k) { keys.delete(k); update(); }
  });
}
