import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { activeShares, archivePicture, archiveVideo, createShare, getShare, readShareAsset, saveShareVideo, SHARE_TTL_MS, validShareId, videoExtension } from './share-storage.js';
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
    const { id, expiresAt } = await createShare(png(), root, 1_000_000);
    assert.equal(validShareId(id), true);
    assert.equal(expiresAt, 1_000_000 + SHARE_TTL_MS);
    assert.equal(await getShare(id, root, expiresAt), null);
    assert.deepEqual((await readShareAsset(id, 'photo', root, 1_000_000)).buffer, png());
    assert.equal(await getShare('../other', root), null);
    assert.equal(await readShareAsset(id, 'video', root, 1_000_000), null);
    const video = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
    assert.equal(videoExtension('video/webm', video), 'webm');
    assert.equal(videoExtension('video/mp4', video), null);
    const current = await createShare(png(), root);
    assert.equal(await saveShareVideo(current.id, 'video/webm', video, root), 'webm');
    assert.deepEqual((await readShareAsset(current.id, 'video', root)).buffer, video);
    await assert.rejects(saveShareVideo(current.id, 'video/webm', video, root), /EEXIST/);
    const archive = path.join(root, 'cssbooth');
    assert.match(await archivePicture(png(), archive), /\.png$/);
    assert.match(await archiveVideo('video/webm', video, archive), /\.webm$/);
    assert.equal((await activeShares(root, expiresAt + 1)).some(share => share.id === id), false);
    await assert.rejects(readdir(path.join(root, id)), { code: 'ENOENT' });
    await assert.rejects(createShare(Buffer.from('bad'), root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local QR link serves a phone page with photo and video downloads', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'css-share-server-test-'));
  const previousUrl = process.env.BOOTH_PUBLIC_URL;
  const previousSite = process.env.BOOTH_SITE_ORIGIN;
  const server = createBoothServer(root);
  try {
    process.env.BOOTH_PUBLIC_URL = 'http://booth.example.test:3000';
    process.env.BOOTH_SITE_ORIGIN = 'https://css-photo-club.example.test';
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const preflight = await fetch(`${base}/api/shares`, { method: 'OPTIONS', headers: { Origin: process.env.BOOTH_SITE_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), process.env.BOOTH_SITE_ORIGIN);
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
    assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'https://other.example.test' } })).status, 403);
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
    assert.equal((await readdir(path.join(root, 'cssbooth', 'picture'))).length, 1);
    assert.equal((await readdir(path.join(root, 'cssbooth', 'video'))).length, 1);
    assert.equal((await fetch(`${base}/share/../bad`)).status, 403);
    assert.equal((await fetch(`${base}/share-media/${share.id}/photo.png`)).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
    if (previousUrl === undefined) delete process.env.BOOTH_PUBLIC_URL; else process.env.BOOTH_PUBLIC_URL = previousUrl;
    if (previousSite === undefined) delete process.env.BOOTH_SITE_ORIGIN; else process.env.BOOTH_SITE_ORIGIN = previousSite;
  }
});

test('QR copies expire while the laptop picture archive remains', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'css-share-expiry-test-'));
  const mediaRoot = path.join(root, 'share-media');
  const archiveRoot = path.join(root, 'cssbooth');
  const filename = await archivePicture(png(), archiveRoot);
  const share = await createShare(png(), mediaRoot, Date.now() - SHARE_TTL_MS + 1000);
  const server = createBoothServer(root);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/share/${share.id}`)).status, 200);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal((await fetch(`${base}/share/${share.id}`)).status, 404);
    await assert.rejects(readdir(path.join(mediaRoot, share.id)), { code: 'ENOENT' });
    assert.deepEqual(await readFile(path.join(archiveRoot, 'picture', filename)), png());
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
