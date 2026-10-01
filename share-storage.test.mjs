import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createShare, getShare, readShareAsset, saveShareVideo, validShareId, videoExtension } from './share-storage.js';
import { GET, POST } from './api/share.js';
import { createBoothServer } from './server.mjs';

function png() {
  const buffer = Buffer.alloc(57);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(1000, 16); buffer.writeUInt32BE(3136, 20); buffer.write('IEND', 49, 'ascii');
  return buffer;
}

test('local share saves an unguessable photo and optional video, rejecting invalid paths and media', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'css-share-test-'));
  try {
    const id = await createShare(png(), root);
    assert.equal(validShareId(id), true);
    assert.deepEqual((await readShareAsset(id, 'photo', root)).buffer, png());
    assert.equal(await getShare('../other', root), null);
    assert.equal(await readShareAsset(id, 'video', root), null);
    const video = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
    assert.equal(videoExtension('video/webm', video), 'webm');
    assert.equal(videoExtension('video/mp4', video), null);
    assert.equal(await saveShareVideo(id, 'video/webm', video, root), 'webm');
    assert.deepEqual((await readShareAsset(id, 'video', root)).buffer, video);
    await assert.rejects(saveShareVideo(id, 'video/webm', video, root), /EEXIST/);
    await assert.rejects(createShare(Buffer.from('bad'), root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('hosted share API requires a key and a connected Blob store before uploading', async () => {
  const previousKey = process.env.BOOTH_UPLOAD_KEY, previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    process.env.BOOTH_UPLOAD_KEY = 'test-key';
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const bad = await POST(new Request('https://example.test/api/share?kind=photo', { method: 'POST' }));
    assert.equal(bad.status, 401);
    const unconfigured = await POST(new Request('https://example.test/api/share?kind=photo', { method: 'POST', headers: { 'x-booth-upload-key': 'test-key' } }));
    assert.equal(unconfigured.status, 503);
    const invalid = await GET(new Request('https://example.test/api/share?id=../bad'));
    assert.equal(invalid.status, 400);
  } finally {
    if (previousKey === undefined) delete process.env.BOOTH_UPLOAD_KEY; else process.env.BOOTH_UPLOAD_KEY = previousKey;
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  }
});

test('local QR link serves a phone page with photo and video downloads', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'css-share-server-test-'));
  const previousUrl = process.env.BOOTH_PUBLIC_URL;
  const server = createBoothServer(root);
  try {
    process.env.BOOTH_PUBLIC_URL = 'http://booth.example.test:3000';
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const created = await fetch(`${base}/api/shares`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png() });
    assert.equal(created.status, 201);
    const share = await created.json();
    assert.equal(share.shareUrl, `http://booth.example.test:3000/share/${share.id}`);
    const page = await fetch(`${base}/share/${share.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Download photo/);
    const photo = await fetch(`${base}/api/shares/${share.id}/photo`);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png());
    const video = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
    const uploaded = await fetch(`${base}/api/shares/${share.id}/video`, { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: video });
    assert.equal(uploaded.status, 201);
    const withVideo = await fetch(`${base}/share/${share.id}`);
    assert.match(await withVideo.text(), /Download video/);
    const movie = await fetch(`${base}/api/shares/${share.id}/video`);
    assert.equal(movie.headers.get('content-type'), 'video/webm');
    assert.deepEqual(Buffer.from(await movie.arrayBuffer()), video);
    assert.equal((await fetch(`${base}/share/../bad`)).status, 403);
    assert.equal((await fetch(`${base}/share-media/${share.id}/photo.png`)).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
    if (previousUrl === undefined) delete process.env.BOOTH_PUBLIC_URL; else process.env.BOOTH_PUBLIC_URL = previousUrl;
  }
});
