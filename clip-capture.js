const CAPTURE_FPS = 20;
export const MIN_CLIP_MS = 500;

export function startSceneClip(canvas) {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) return null;
  const type = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/mp4'].find(value => MediaRecorder.isTypeSupported(value));
  if (!type) return null;
  let stream;
  try { stream = canvas.captureStream(CAPTURE_FPS); }
  catch { return null; }
  let recorder;
  try { recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_800_000 }); }
  catch { stream.getTracks().forEach(track => track.stop()); return null; }
  const chunks = [];
  let discarded = false, settled = false, resolve;
  const finished = new Promise(done => { resolve = done; });
  const settle = () => {
    if (settled) return;
    settled = true; stream.getTracks().forEach(track => track.stop());
    resolve(!discarded && chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
  };
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = settle;
  recorder.onerror = () => { discarded = true; if (recorder.state !== 'inactive') recorder.stop(); settle(); };
  const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  try { recorder.start(); }
  catch { discarded = true; settle(); return null; }
  return {
    startedAt: performance.now(),
    finish() { stop(); return finished; },
    cancel() { discarded = true; stop(); }
  };
}
