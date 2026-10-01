import { containFit } from './photo-session.js';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } from './vendor/mediabunny.mjs';

const WIDTH = 720, HEIGHT = 960, SHOT_MS = 1700, FPS = 20;
const quality = new Quality({ bitrate: 1_200_000 });
const recorderType = () => typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype.captureStream
  ? ['video/mp4;codecs=avc1', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) : null;
export function canMakeVideo() { return typeof VideoEncoder !== 'undefined' || Boolean(recorderType()); }

function drawFrame(context, photos, index) {
  context.fillStyle = '#e7e2f1'; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#3d3854'; context.fillRect(24, 24, WIDTH - 48, HEIGHT - 48);
  context.fillStyle = '#faf5f0'; context.font = '600 29px sans-serif';
  context.fillText('CSS PHOTO CLUB', 53, 75);
  context.textAlign = 'right'; context.fillText(`${String(index + 1).padStart(2, '0')} / 04`, WIDTH - 52, 75); context.textAlign = 'left';
  const image = photos[index];
  const fit = containFit(image.naturalWidth || image.width, image.naturalHeight || image.height, WIDTH - 100, HEIGHT - 245);
  context.fillStyle = '#22202f'; context.fillRect(50, 108, WIDTH - 100, HEIGHT - 245);
  context.drawImage(image, 50 + fit.x, 108 + fit.y, fit.width, fit.height);
  context.fillStyle = '#b9cfbf'; context.fillRect(50, HEIGHT - 112, WIDTH - 100, 55);
  context.fillStyle = '#363449'; context.font = '600 23px sans-serif';
  context.fillText("WE DON'T CODE, WE BUILD", 69, HEIGHT - 76);
}

async function recordMp4(canvas, context, photos, active) {
  const type = recorderType();
  if (!type) throw new Error('MP4 creation needs a current Chrome or Edge browser. Your PNG download is still available.');
  const stream = canvas.captureStream(FPS), recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_200_000 });
  const chunks = [];
  let timer, stopped = false;
  const finished = new Promise((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => reject(event.error || new Error('Video recording failed'));
    recorder.onstop = () => stopped ? reject(new Error('Cancelled')) : resolve(new Blob(chunks, { type: 'video/mp4' }));
  });
  const started = performance.now();
  const draw = () => {
    if (!active()) { stopped = true; recorder.stop(); return; }
    const elapsed = performance.now() - started;
    drawFrame(context, photos, Math.min(3, Math.floor(elapsed / SHOT_MS)));
    if (elapsed < SHOT_MS * 4) timer = setTimeout(draw, 1000 / FPS);
    else recorder.stop();
  };
  try { drawFrame(context, photos, 0); recorder.start(); draw(); return await finished; }
  finally { clearTimeout(timer); stream.getTracks().forEach(track => track.stop()); }
}

export async function makePhotoVideo(photos, { active = () => true } = {}) {
  if (photos.length !== 4) throw new Error('Choose four photos first');
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!await canEncodeVideo('avc', { width: WIDTH, height: HEIGHT, frameRate: FPS, quality })) {
    return recordMp4(canvas, context, photos, active);
  }
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', quality });
  output.addVideoTrack(source, { frameRate: FPS });
  try {
    await output.start();
    const framesPerPhoto = SHOT_MS / 1000 * FPS;
    for (let frame = 0; frame < framesPerPhoto * 4; frame++) {
      if (!active()) throw new Error('Cancelled');
      const index = Math.floor(frame / framesPerPhoto);
      drawFrame(context, photos, index);
      await source.add(frame / FPS, 1 / FPS, { keyFrame: frame % framesPerPhoto === 0 });
    }
    source.close(); await output.finalize();
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
}
