import { STRIP, drawStrip } from './photo-strip.js';
import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output, Quality, canEncodeVideo } from './vendor/mediabunny.mjs';

export const VIDEO_SECONDS = 3;
const FPS = 20, FRAME_COUNT = VIDEO_SECONDS * FPS;
const quality = new Quality({ bitrate: 2_800_000 });
export function canMakeVideo() { return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'; }

export async function makePhotoVideo(clips, { active = () => true, progress = () => {}, ...stripOptions } = {}) {
  if (clips.length !== 4 || clips.some(clip => !(clip instanceof Blob) || !clip.size)) {
    throw new Error('These shots have no camera clips. Start a new round to make your moving strip. Your PNG is still available.');
  }
  const inputs = [], iterators = [];
  let output;
  try {
    // Decode each selected clip on the same three-second timeline. Short quick-shutter
    // clips are slowed to fit, so all four windows keep moving together.
    for (const clip of clips) {
      if (!active()) throw new Error('Cancelled');
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(clip) }); inputs.push(input);
      const track = await input.getPrimaryVideoTrack();
      if (!track || !await track.canDecode()) throw new Error('Could not read a camera clip. Retake this round in current Chrome or Edge.');
      const start = await track.getFirstTimestamp(), end = await track.computeDuration();
      if (!Number.isFinite(end) || end <= start) throw new Error('A camera clip is empty. Retake this round.');
      const sink = new CanvasSink(track, { width: 720, poolSize: 1 });
      const times = Array.from({ length: FRAME_COUNT }, (_, frame) => start + frame / FRAME_COUNT * (end - start));
      iterators.push(sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]());
    }
    let width;
    for (const candidate of [750, 500]) {
      const height = candidate / STRIP.width * STRIP.height;
      if (await canEncodeVideo('avc', { width: candidate, height, frameRate: FPS, quality })) { width = candidate; break; }
    }
    if (!width) throw new Error('MP4 creation needs H.264 support in current Chrome or Edge. Your PNG is still available.');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width / STRIP.width * STRIP.height;
    const context = canvas.getContext('2d', { alpha: false });
    // Draw artwork at the PNG's native size before scaling the completed strip.
    // This preserves the pixel font and border rendering in the still export.
    const strip = document.createElement('canvas'); strip.width = STRIP.width; strip.height = STRIP.height;
    const stripContext = strip.getContext('2d', { alpha: false });
    output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const source = new CanvasSource(canvas, { codec: 'avc', quality });
    output.addVideoTrack(source, { frameRate: FPS }); await output.start();
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      if (!active()) throw new Error('Cancelled');
      const decoded = await Promise.all(iterators.map(iterator => iterator.next()));
      if (decoded.some(result => result.done || !result.value)) throw new Error('Could not read all four camera clips. Retake this round.');
      drawStrip(stripContext, decoded.map(result => result.value.canvas), stripOptions);
      context.drawImage(strip, 0, 0, canvas.width, canvas.height);
      await source.add(frame / FPS, 1 / FPS, { keyFrame: frame % FPS === 0 });
      progress(Math.round((frame + 1) / FRAME_COUNT * 100));
    }
    source.close(); await output.finalize();
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  } catch (error) { if (output) await output.cancel().catch(() => {}); throw error; }
  finally {
    await Promise.allSettled(iterators.map(iterator => iterator.return?.()));
    inputs.forEach(input => input.dispose());
  }
}
