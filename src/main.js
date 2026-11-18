import { createScene, updateFollowCamera } from './game/scene.js';
import { QUALITY } from './game/quality.js';
import { createBird } from './game/bird.js';
import { createObstacleCourse } from './game/obstacles.js';
import { groundHeight, surfaceHeight, WATER_LEVEL } from './game/terrain.js';
import { inputState } from './input/inputState.js';
import { initTouchInput } from './input/touchInput.js';
import { initPoseInput } from './input/poseInput.js';
import { createMenu } from './ui/menu.js';

const canvas = document.getElementById('game');
const debugEl = document.getElementById('debug');

const { renderer, scene, camera, updateWorld, decor, setPixelRatio } = createScene(canvas);
const bird = createBird();
scene.add(bird.object);
const course = createObstacleCourse(scene);
// Ağaçlar kaya formasyonlarının ve halkaların içinde çıkmasın.
decor.setClearTest((x, z) => course.isClear(x, z));
course.onLayoutChange = () => decor.refresh();

// Kuşun altındaki yer ya da göl yüzeyi.
const floorUnderBird = () => surfaceHeight(bird.position.x, bird.position.z);
initTouchInput(canvas);

// --- Oyun durumu ---
// 'ready'   : ilk açılış, dokununca başlar
// 'playing' : oyun akıyor
// 'paused'  : ESC / duraklat butonu, dünya donar
// 'over'    : çarpıldı, oyun sonu menüsü
let state = 'ready';
let score = 0;
let overTimer = 0; // oyun bittikten sonra geçen süre (yanlışlıkla hemen yeniden başlamasın)
const RESTART_DELAY = 0.7;

const BEST_KEY = 'ucankus.best.halka';
let best = Number(localStorage.getItem(BEST_KEY)) || 0;

const menu = createMenu({ onPause: pause, onResume: resume, onRestart: restart });

function resetRun() {
  bird.reset(surfaceHeight(0, 0) + 8);
  course.reset(bird);
  score = 0;
  menu.setScore(0);
  inputState.clearFlaps();
  // Kamerayı kuşun arkasına koy, ilk karede uçarak gelmesin.
  camera.position.set(bird.position.x, bird.position.y + 3.2, bird.position.z + 8);
  updateWorld(bird.position);
}

function restart() {
  resetRun();
  state = 'playing';
  menu.show(null);
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  menu.show('pause');
}

function resume() {
  if (state !== 'paused') return;
  inputState.clearFlaps();
  state = 'playing';
  menu.show(null);
}

function gameOver(reason) {
  state = 'over';
  overTimer = 0;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  menu.showGameOver(reason, score, best);
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  e.preventDefault();
  if (state === 'playing') pause();
  else if (state === 'paused') resume();
});
// Sekme değişince / telefon kilitlenince otomatik duraklat.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function updatePlaying(dt) {
  bird.update(dt, inputState, floorUnderBird());

  const { collected, hit } = course.update(bird, dt);
  if (collected) {
    score += collected;
    menu.setScore(score);
  }
  if (hit) return gameOver('Kayaya çarptın!');
  if (decor.hitsTree(bird.position, bird.radius)) return gameOver('Ağaca çarptın!');
  if (bird.position.y <= floorUnderBird() + bird.radius + 1e-3) {
    const inLake = groundHeight(bird.position.x, bird.position.z) < WATER_LEVEL;
    return gameOver(inLake ? 'Göle düştün!' : 'Yere düştün!');
  }
}

resetRun();
menu.show('ready');

// Kamera ile kontrol. Açılamazsa dokunma/klavye yedek olarak çalışmaya devam eder.
const camPanel = document.getElementById('cam-panel');
const camStatus = document.getElementById('cam-status');
menu.setControlMode('loading');
initPoseInput({
  video: document.getElementById('cam-video'),
  overlay: document.getElementById('cam-overlay'),
  onStatus: (s) => (camStatus.textContent = s),
  // Eller başın üstünde ~1 sn: oynarken durdurur, dururken devam ettirir.
  onToggle: () => {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
  },
})
  .then(() => menu.setControlMode('pose'))
  .catch((err) => {
    console.warn('Kamera kontrolü açılamadı:', err);
    camPanel.classList.add('off');
    camStatus.textContent = `${err.message} Dokunma/klavye ile oynanıyor.`;
    menu.setControlMode('touch', err.message);
  });

let last = performance.now();
let debugTimer = 0;

// Kare hızı düşükse çözünürlüğü kademeli azalt (sadece oynarken ölçülür, geri yükseltilmez).
let pixelRatio = QUALITY.pixelRatio;
let fpsTime = 0;
let fpsFrames = 0;
function adaptResolution(rawDt) {
  if (state !== 'playing') return;
  fpsTime += rawDt;
  fpsFrames++;
  if (fpsTime < 2) return;
  const fps = fpsFrames / fpsTime;
  fpsTime = 0;
  fpsFrames = 0;
  if (fps < QUALITY.targetFps && pixelRatio > QUALITY.minPixelRatio + 0.01) {
    pixelRatio = Math.max(QUALITY.minPixelRatio, pixelRatio - 0.1);
    setPixelRatio(pixelRatio);
  }
}

function frame(now) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(rawDt, 0.05);
  last = now;
  adaptResolution(rawDt);

  switch (state) {
    case 'ready':
      // İlk dokunuş/Space oyunu başlatır; o çırpma silinmez, kuş zıplayarak başlar.
      if (inputState.pendingFlaps > 0) {
        state = 'playing';
        menu.show(null);
      }
      break;
    case 'playing':
      updatePlaying(dt);
      break;
    case 'paused':
      inputState.clearFlaps();
      break;
    case 'over':
      overTimer += dt;
      bird.updateCrashed(dt, floorUnderBird());
      if (overTimer < RESTART_DELAY) inputState.clearFlaps();
      else if (inputState.pendingFlaps > 0) restart();
      break;
  }

  updateWorld(bird.position);
  if (state !== 'paused') updateFollowCamera(camera, bird, dt);
  renderer.render(scene, camera);

  debugTimer += dt;
  if (debugTimer > 0.2) {
    debugTimer = 0;
    debugEl.textContent =
      `Yerden ${(bird.position.y - floorUnderBird()).toFixed(1)} m\n` +
      `Mesafe ${(-bird.position.z).toFixed(0)} m\n` +
      `En iyi ${best}\n` +
      `Kalite ${QUALITY.name} · ${pixelRatio.toFixed(1)}x`;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
