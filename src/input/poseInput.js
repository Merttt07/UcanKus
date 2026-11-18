import { inputState } from './inputState.js';
import { createWingTracker } from './wingGesture.js';
import { QUALITY } from '../game/quality.js';

const MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

// Kameradan vücut algılayıp inputState'e çırpış ve tek kol dönüşlerini yazar.
// Fizik hangi girdinin kullanıldığını bilmez; tuş/dokunma ile aynı arayüzü kullanır.
//
// Algılama mümkünse ayrı bir işçide (poseWorker.js) yapılır → oyun takılmaz.
// İşçi açılamazsa (eski tarayıcı) ana iş parçacığında yapılır.
//
// video, overlay: köşedeki kamera önizlemesi ve üstüne çizilen iskelet.
// onStatus(metin): kullanıcıya gösterilecek durum.
// onToggle(): eller başın üstünde tutulunca (dur/devam).
export async function initPoseInput({ video, overlay, onStatus, onToggle = () => {} }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Kamera sadece https:// ya da localhost adresinde açılabilir.');
  }

  onStatus('Kamera izni bekleniyor…');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: QUALITY.camWidth }, height: { ideal: QUALITY.camHeight } },
      audio: false,
    });
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Kamera izni verilmedi.');
    if (e.name === 'NotFoundError') throw new Error('Kamera bulunamadı.');
    throw new Error(`Kamera açılamadı (${e.name}).`);
  }
  video.srcObject = stream;
  await video.play();

  onStatus('Hareket modeli yükleniyor…');
  let detector;
  try {
    detector = await createWorkerDetector();
  } catch (workerErr) {
    console.warn('Algılama işçisi açılamadı, ana iş parçacığında çalışılacak:', workerErr);
    try {
      detector = await createMainThreadDetector();
    } catch (e) {
      for (const track of stream.getTracks()) track.stop(); // kamera ışığı boşuna yanmasın
      throw new Error(`Hareket modeli yüklenemedi (${e.message ?? e}).`);
    }
  }
  console.info(`Vücut algılama: ${detector.kind}`);

  inputState.poseActive = true; // artık tuş/dokunma uçuşu kontrol etmez
  inputState.steer = 0;
  const tracker = createWingTracker();
  const ctx = overlay.getContext('2d');
  let lastVideoTime = -1;
  let lastDetect = 0;
  let busy = false; // önceki kare hâlâ işleniyorsa yenisini gönderme
  let flash = { until: 0, side: 0 };
  let lastStatus = '';
  const setStatus = (s) => {
    if (s !== lastStatus) onStatus((lastStatus = s));
  };

  function handle(lm, t) {
    const g = tracker.update(lm, t / 1000, video.videoWidth, video.videoHeight);
    if (g.flap > 0) {
      inputState.flap(g.flap, g.turn);
      flash = { until: performance.now() + 250, side: Math.sign(g.turn) };
    }
    if (g.toggle) onToggle();
    setStatus(g.visible ? 'Hazır' : `Seni göremiyorum: ${g.reason}`);
    draw(ctx, lm, g, performance.now() < flash.until ? flash.side : null);
  }

  function tick() {
    const now = performance.now();
    // Yeni kamera karesi geldiyse ve önceki bittiyse işle. Telefonda daha seyrek (QUALITY.poseIntervalMs).
    if (!busy && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetect >= QUALITY.poseIntervalMs) {
      lastVideoTime = video.currentTime;
      lastDetect = now;
      busy = true;
      detector
        .detect(video, now)
        .then((lm) => handle(lm, now))
        .catch((e) => console.warn('Algılama hatası:', e))
        .finally(() => (busy = false));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// --- Algılayıcılar: ikisi de detect(video, t) → Promise<landmarks | null> ---

function createWorkerDetector() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./poseWorker.js', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('işçi zaman aşımı'));
    }, 30000);
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || 'işçi başlatılamadı'));
    };
    worker.onmessage = (e) => {
      if (e.data.type === 'error') {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(e.data.message));
        return;
      }
      if (e.data.type !== 'ready') return;
      clearTimeout(timer);

      let waiting = null;
      worker.onmessage = (ev) => {
        if (ev.data.type === 'result' && waiting) {
          waiting(ev.data.landmarks);
          waiting = null;
        }
      };
      let resizeOk = true;
      resolve({
        kind: `ayrı işçide (${e.data.delegate})`,
        async detect(video, t) {
          // Küçültülmüş kopya gönder: aktarım ve algılama daha hızlı (model zaten küçük görüntüyle çalışır).
          let bitmap;
          if (resizeOk) {
            try {
              const w = QUALITY.detectWidth;
              const h = Math.round((w * video.videoHeight) / video.videoWidth);
              bitmap = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' });
            } catch {
              resizeOk = false; // bu tarayıcı küçültmeyi desteklemiyor
            }
          }
          if (!bitmap) bitmap = await createImageBitmap(video);
          return new Promise((res) => {
            waiting = res;
            worker.postMessage({ type: 'frame', bitmap, t }, [bitmap]);
          });
        },
      });
    };
    worker.postMessage({ type: 'init', modelUrl: new URL(MODEL_URL, window.location.href).href });
  });
}

async function createMainThreadDetector() {
  const [{ PoseLandmarker }, loader, binary] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
    import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
  ]);
  const fileset = { wasmLoaderPath: loader.default, wasmBinaryPath: binary.default };
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let landmarker;
  let delegate = 'GPU';
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    delegate = 'CPU';
    landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
  }
  return {
    kind: `ana iş parçacığında (${delegate})`,
    async detect(video, t) {
      return landmarker.detectForVideo(video, t).landmarks?.[0] ?? null;
    },
  };
}

// Önizlemenin üstüne omuz-dirsek-bilek çizgilerini, çırpış ve dur/devam göstergesini çiz.
const ARMS = [[11, 13], [13, 15], [12, 14], [14, 16], [11, 12]];
function draw(ctx, lm, g, flashSide) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (flashSide !== null) {
    // Çift kol: tüm kare yeşil. Tek kol: dönülen taraf sarı.
    // Önizleme ayna gibi çevrildiği için kişinin sağı görüntünün solunda çizilir.
    ctx.fillStyle = flashSide === 0 ? 'rgba(80, 220, 120, 0.35)' : 'rgba(255, 211, 77, 0.45)';
    if (flashSide === 0) ctx.fillRect(0, 0, w, h);
    else ctx.fillRect(flashSide > 0 ? 0 : w / 2, 0, w / 2, h);
  }
  if (!lm) return;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = g.visible ? '#5cf08a' : '#ff8a7a';
  ctx.beginPath();
  for (const [a, b] of ARMS) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();

  // Eller başın üstündeyken dolan halka: dolunca dur/devam.
  if (g.holdProgress > 0) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.18, -Math.PI / 2, -Math.PI / 2 + g.holdProgress * Math.PI * 2);
    ctx.stroke();
  }
}
