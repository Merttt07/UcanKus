// Vücut algılama işçisi (Web Worker). MediaPipe Pose burada, oyundan ayrı bir iş
// parçacığında çalışır: algılama ne kadar sürerse sürsün oyun kareleri beklemez.
//
// Mesajlar:
//   ← { type: 'init', modelUrl }          → { type: 'ready', delegate } | { type: 'error', message }
//   ← { type: 'frame', bitmap, t }        → { type: 'result', landmarks, t }
import { PoseLandmarker } from '@mediapipe/tasks-vision';
// İşçide ES modülü sürümü gerekir (klasik sürüm importScripts ister, modül işçide yok).
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';

let landmarker = null;

const options = (modelUrl, delegate) => ({
  baseOptions: { modelAssetPath: modelUrl, delegate },
  runningMode: 'VIDEO',
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    const fileset = { wasmLoaderPath, wasmBinaryPath };
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options(msg.modelUrl, 'GPU'));
      self.postMessage({ type: 'ready', delegate: 'GPU' });
    } catch {
      try {
        // Bazı cihazlarda işçide GPU yolu yok; işlemciyle dene.
        landmarker = await PoseLandmarker.createFromOptions(fileset, options(msg.modelUrl, 'CPU'));
        self.postMessage({ type: 'ready', delegate: 'CPU' });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err?.message ?? err) });
      }
    }
  } else if (msg.type === 'frame') {
    let landmarks = null;
    try {
      const r = landmarker.detectForVideo(msg.bitmap, msg.t);
      landmarks = r.landmarks?.[0] ?? null;
    } catch {
      landmarks = null;
    } finally {
      msg.bitmap.close();
    }
    self.postMessage({ type: 'result', landmarks, t: msg.t });
  }
};
