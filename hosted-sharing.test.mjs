import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareHandler } from './hosted-sharing.js';
import { shareFiles } from './phone-share.js';
import { setBoothToken } from './booth-session.js';
import { CHUNK_BYTES, SHARE_TTL_MS } from './sharing-config.js';
import { memoryRedis } from './test-support/redis-memory.mjs';

const origin = 'https://booth.example.test';
let boothToken = '';
async function setup(now = Date.now) {
  const store = memoryRedis(now), handle = createShareHandler(store.command, now, { passwordMatches: password => password === 'test-password' });
  const response = await handle(request('?login=1', { method: 'POST', body: JSON.stringify({ password: 'test-password' }) }));
  assert.equal(response.status, 200); boothToken = (await response.json()).token; setBoothToken(boothToken);
  return { store, handle };
}
function png(size = 57) {
  const bytes = Buffer.alloc(size);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(1000, 16); bytes.writeUInt32BE(3136, 20);
  bytes.write('IEND', size - 8); return bytes;
}
function mp4(size = 80) { const bytes = Buffer.alloc(size); bytes.write('ftyp', 4); return bytes; }
const fileSpec = bytes => ({ size: bytes.length, chunks: Math.ceil(bytes.length / CHUNK_BYTES) });
function request(query = '', options = {}) {
  return new Request(`${origin}/api/share${query}`, { ...options, headers: { Origin: origin, 'x-booth-token': boothToken, ...options.headers } });
}
async function begin(handle, photo = png(), video = mp4()) {
  const response = await handle(request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: fileSpec(photo), video: fileSpec(video) }) }));
  assert.equal(response.status, 201); return response.json();
}
async function send(handle, upload, kind, bytes, index = 0) {
  return handle(request(`?id=${upload.id}&kind=${kind}&chunk=${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'x-upload-token': upload.uploadToken }, body: bytes }));
}
const finish = (handle, upload) => handle(request(`?id=${upload.id}`, { method: 'POST', headers: { 'x-upload-token': upload.uploadToken } }));

test('public QR gives both files and storage deletes them at the shared five-minute deadline', async () => {
  let clock = 1_000_000;
  const { store, handle } = await setup(() => clock);
  const photo = png(5 * 1024 * 1024 + 17), video = mp4(CHUNK_BYTES + 71);
  const nativeFetch = globalThis.fetch;
  let largestUpload = 0;
  globalThis.fetch = async (url, options) => {
    if (options.body instanceof Blob) largestUpload = Math.max(largestUpload, options.body.size);
    return handle(request(url.replace('/api/share', ''), options));
  };
  let share;
  try {
    share = await shareFiles(new Blob([photo], { type: 'image/png' }), new Blob([video], { type: 'video/mp4' }));
  } finally { globalThis.fetch = nativeFetch; }
  assert.equal(largestUpload, CHUNK_BYTES);
  assert.equal(share.expiresAt, clock + SHARE_TTL_MS);
  assert.equal(share.shareUrl, `${origin}/download.html?id=${share.id}`);
  const info = await handle(new Request(`${origin}/api/share?id=${share.id}`));
  const links = await info.json();
  assert.equal(info.headers.get('cache-control'), 'private, no-store');
  assert.equal(links.uploadToken, undefined);
  for (const [kind, expected, type] of [['photo', photo, 'image/png'], ['video', video, 'video/mp4']]) {
    const file = await handle(new Request(`${origin}/api/share?id=${share.id}&kind=${kind}&download=1`));
    assert.equal(file.status, 200); assert.equal(file.headers.get('content-type'), type);
    assert.match(file.headers.get('content-disposition'), kind === 'photo' ? /\.png"$/ : /\.mp4"$/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), expected);
  }
  const keys = [...store.snapshot()].filter(([key]) => key.startsWith(`cssbooth:shares:${share.id}:`));
  assert.ok(keys.length > 3);
  assert.ok(keys.every(([, value]) => value.expiresAt === share.expiresAt));
  clock = share.expiresAt - 1;
  assert.equal((await handle(request(`?id=${share.id}`))).status, 200);
  clock++;
  assert.equal((await handle(request(`?id=${share.id}`))).status, 410);
  assert.equal((await handle(request(`?id=${share.id}&kind=photo`))).status, 410);
  assert.equal([...store.snapshot().keys()].filter(key => key.startsWith('cssbooth:shares:')).length, 0);
});

test('upload capabilities cannot modify another share, incomplete files or finalized files', async () => {
  const { handle } = await setup();
  const upload = await begin(handle);
  assert.equal((await handle(request(`?id=${upload.id}`))).status, 404);
  assert.equal((await send(handle, { ...upload, uploadToken: 'wrong' }, 'photo', png())).status, 403);
  assert.equal((await finish(handle, upload)).status, 409);
  assert.equal((await send(handle, upload, 'photo', png())).status, 200);
  assert.equal((await send(handle, upload, 'video', mp4())).status, 200);
  assert.equal((await finish(handle, upload)).status, 201);
  assert.equal((await send(handle, upload, 'photo', png())).status, 403);
  assert.equal((await finish(handle, upload)).status, 403);
});

test('abandoned upload expires without the booth browser remaining open', async () => {
  let clock = 1_000_000;
  const { store, handle } = await setup(() => clock);
  const upload = await begin(handle);
  await send(handle, upload, 'photo', png());
  clock += SHARE_TTL_MS;
  assert.equal((await finish(handle, upload)).status, 410);
  assert.equal([...store.snapshot().keys()].filter(key => key.startsWith('cssbooth:shares:')).length, 0);
});

test('cross-origin, invalid paths, oversized chunks and non-MP4 videos are rejected', async () => {
  const { handle } = await setup();
  assert.equal((await handle(request('', { method: 'POST', headers: { Origin: 'https://other.test' }, body: '{}' }))).status, 403);
  assert.equal((await handle(request('?id=../../secret'))).status, 404);
  const upload = await begin(handle);
  assert.equal((await send(handle, upload, 'photo', Buffer.alloc(CHUNK_BYTES + 1))).status, 413);
  assert.equal((await send(handle, upload, 'photo', Buffer.from('short'))).status, 400);
  await send(handle, upload, 'photo', png());
  await send(handle, upload, 'video', Buffer.alloc(80));
  assert.equal((await finish(handle, upload)).status, 415);
});

test('upload rate limits prevent unlimited share creation', async () => {
  const { handle } = await setup();
  for (let i = 0; i < 12; i++) await begin(handle);
  const response = await handle(request('', { method: 'POST', body: JSON.stringify({ photo: fileSpec(png()), video: fileSpec(mp4()) }) }));
  assert.equal(response.status, 429);
});

test('booth uploads require a server-verified password token while public QR reads stay open', async () => {
  const { handle } = await setup();
  const input = JSON.stringify({ photo: fileSpec(png()), video: fileSpec(mp4()) });
  for (const token of ['', 'fake', 'a'.repeat(64)]) {
    const denied = await handle(request('', { method: 'POST', headers: { 'x-booth-token': token }, body: input }));
    assert.equal(denied.status, 401);
  }
  const upload = await begin(handle);
  const denied = await handle(request(`?id=${upload.id}&kind=photo&chunk=0`, { method: 'PUT', headers: { 'x-booth-token': '', 'x-upload-token': upload.uploadToken, 'Content-Type': 'application/octet-stream' }, body: png() }));
  assert.equal(denied.status, 401);
  assert.equal((await handle(request('?login=1', { method: 'POST', body: JSON.stringify({ password: 'wrong-password' }) }))).status, 401);
  assert.equal((await handle(request('?login=1', { method: 'POST', body: 'null' }))).status, 401);
  assert.equal((await handle(request('?login=1', { method: 'POST', headers: { Origin: 'https://other.test' }, body: JSON.stringify({ password: 'test-password' }) }))).status, 403);
});

test('password guesses are limited and expired booth tokens cannot create media', async () => {
  let clock = 1_000_000;
  const { handle, store } = await setup(() => clock);
  for (let i = 0; i < 9; i++) assert.equal((await handle(request('?login=1', { method: 'POST', body: JSON.stringify({ password: 'wrong-password' }) }))).status, 401);
  assert.equal((await handle(request('?login=1', { method: 'POST', body: JSON.stringify({ password: 'test-password' }) }))).status, 429);
  clock += 12 * 60 * 60 * 1000;
  const expired = await handle(request('', { method: 'POST', body: JSON.stringify({ photo: fileSpec(png()), video: fileSpec(mp4()) }) }));
  assert.equal(expired.status, 401);
  assert.equal([...store.snapshot().keys()].filter(key => key.startsWith('cssbooth:access:')).length, 0);
  assert.equal([...store.snapshot().keys()].filter(key => key.startsWith('cssbooth:shares:')).length, 0);
});
