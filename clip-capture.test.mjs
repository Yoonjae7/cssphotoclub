import test from 'node:test';
import assert from 'node:assert/strict';
import { startSceneClip } from './clip-capture.js';

async function withRecorder(run) {
  const original = globalThis.MediaRecorder;
  const frames = new Blob(['recorded camera frames']);
  let stoppedTracks = 0, stops = 0;
  class Recorder {
    static isTypeSupported(type) { return type === 'video/webm;codecs=vp8'; }
    constructor(stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      stops++; this.state = 'inactive';
      queueMicrotask(() => { this.ondataavailable({ data: frames }); this.onstop(); });
    }
  }
  globalThis.MediaRecorder = Recorder;
  const canvas = { captureStream: () => ({ getTracks: () => [{ stop() { stoppedTracks++; } }] }) };
  try { await run({ canvas, frames, counts: () => ({ stops, stoppedTracks }) }); }
  finally { if (original === undefined) delete globalThis.MediaRecorder; else globalThis.MediaRecorder = original; }
}

test('finishing a camera clip preserves its recorded bytes and releases the capture track once', async () => {
  await withRecorder(async ({ canvas, frames, counts }) => {
    const clip = startSceneClip(canvas);
    const first = clip.finish(), second = clip.finish();
    assert.equal(first, second);
    const result = await first;
    assert.equal(result.type, 'video/webm;codecs=vp8');
    assert.deepEqual(await result.arrayBuffer(), await frames.arrayBuffer());
    assert.deepEqual(counts(), { stops: 1, stoppedTracks: 1 });
  });
});

test('a cancelled countdown discards its frames and stops its capture track', async () => {
  await withRecorder(async ({ canvas, counts }) => {
    const clip = startSceneClip(canvas);
    clip.cancel();
    assert.equal(await clip.finish(), null);
    assert.deepEqual(counts(), { stops: 1, stoppedTracks: 1 });
  });
});

test('unavailable recording does not prevent still capture, and failed initialization releases its track', async () => {
  await withRecorder(async ({ canvas, counts }) => {
    assert.equal(startSceneClip({}), null);
    assert.equal(startSceneClip({ captureStream() { throw new Error('Unavailable'); } }), null);
    globalThis.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor() { throw new Error('Encoder unavailable'); }
    };
    assert.equal(startSceneClip(canvas), null);
    assert.deepEqual(counts(), { stops: 0, stoppedTracks: 1 });
  });
});
