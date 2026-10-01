import { containFit } from './photo-session.js';

const WIDTH = 720, HEIGHT = 960, SHOT_MS = 1700;

function supportedType() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(type => MediaRecorder.isTypeSupported(type)) || null;
}

export function canMakeVideo() { return Boolean(supportedType()); }

export async function makePhotoVideo(photos) {
  if (photos.length !== 4) throw new Error('Choose four photos first');
  const type = supportedType();
  if (!type) throw new Error('This browser cannot make a video. The photo QR will still work.');
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(20);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 500_000 });
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => reject(event.error || new Error('Video recording failed'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType.split(';')[0] }));
  });
  let frameId;
  const draw = now => {
    const elapsed = now - started;
    const index = Math.min(3, Math.floor(elapsed / SHOT_MS));
    context.fillStyle = '#e7e2f1'; context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#3d3854'; context.fillRect(24, 24, WIDTH - 48, HEIGHT - 48);
    context.fillStyle = '#faf5f0'; context.font = '600 29px sans-serif';
    context.fillText('CSS PHOTO CLUB', 53, 75);
    context.textAlign = 'right'; context.fillText(`${String(index + 1).padStart(2, '0')} / 04`, WIDTH - 52, 75); context.textAlign = 'left';
    const image = photos[index];
    const fit = containFit(image.naturalWidth, image.naturalHeight, WIDTH - 100, HEIGHT - 245);
    context.fillStyle = '#22202f'; context.fillRect(50, 108, WIDTH - 100, HEIGHT - 245);
    context.drawImage(image, 50 + fit.x, 108 + fit.y, fit.width, fit.height);
    context.fillStyle = '#b9cfbf'; context.fillRect(50, HEIGHT - 112, WIDTH - 100, 55);
    context.fillStyle = '#363449'; context.font = '600 23px sans-serif';
    context.fillText("WE DON'T CODE, WE BUILD", 69, HEIGHT - 76);
    if (elapsed < SHOT_MS * 4) frameId = requestAnimationFrame(draw);
    else recorder.stop();
  };
  let started;
  try {
    recorder.start();
    started = performance.now();
    draw(started);
    const result = await finished;
    if (!result.size) throw new Error('The video is empty');
    return result;
  } finally {
    cancelAnimationFrame(frameId);
    stream.getTracks().forEach(track => track.stop());
  }
}
