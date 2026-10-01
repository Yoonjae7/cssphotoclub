import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { validStripPng } from './photo-storage.js';

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SHARE_TTL_MS = 5 * 60 * 1000;
export const validShareId = id => SHARE_ID.test(id);
export const shareExpiresAt = createdAt => createdAt + SHARE_TTL_MS;

export function videoExtension(type, buffer) {
  if (type === 'video/webm' && buffer.length > 16 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (type === 'video/mp4' && buffer.length > 16 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  return null;
}

export async function createShare(buffer, root, now = Date.now()) {
  if (!validStripPng(buffer)) throw new Error('Expected a complete four-cut PNG');
  const id = randomUUID();
  const directory = path.join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'photo.png'), buffer, { flag: 'wx' });
  await writeFile(path.join(directory, 'expires-at'), String(shareExpiresAt(now)), { flag: 'wx' });
  return { id, expiresAt: shareExpiresAt(now) };
}

export async function getShare(id, root, now = Date.now()) {
  if (!validShareId(id)) return null;
  const directory = path.join(root, id);
  try {
    if (!(await stat(path.join(directory, 'photo.png'))).isFile()) return null;
    const expiresAt = Number(await readFile(path.join(directory, 'expires-at'), 'utf8'));
    if (!Number.isFinite(expiresAt) || now >= expiresAt) return null;
    let video = null;
    for (const extension of ['mp4', 'webm']) {
      try { if ((await stat(path.join(directory, `video.${extension}`))).isFile()) video = extension; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return { id, directory, video, expiresAt };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function removeShare(id, root) {
  if (!validShareId(id)) return;
  await rm(path.join(root, id), { recursive: true, force: true });
}

export async function activeShares(root, now = Date.now()) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const active = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !validShareId(entry.name)) continue;
    const share = await getShare(entry.name, root, now);
    if (share) active.push(share);
    else await removeShare(entry.name, root);
  }
  return active;
}

async function archiveFile(buffer, directory, extension) {
  await mkdir(directory, { recursive: true });
  const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  const filename = `css-four-cut-${digest}.${extension}`;
  try { await writeFile(path.join(directory, filename), buffer, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return filename;
}

export async function archivePicture(buffer, archiveRoot) {
  if (!validStripPng(buffer)) throw new Error('Expected a complete four-cut PNG');
  return archiveFile(buffer, path.join(archiveRoot, 'picture'), 'png');
}

export async function archiveVideo(type, buffer, archiveRoot) {
  const extension = videoExtension(type, buffer);
  if (!extension) throw new Error('Invalid video');
  return archiveFile(buffer, path.join(archiveRoot, 'video'), extension);
}

export async function saveShareVideo(id, type, buffer, root) {
  const share = await getShare(id, root);
  if (!share) throw new Error('Share not found');
  const extension = videoExtension(type, buffer);
  if (!extension) throw new Error('Invalid video');
  await writeFile(path.join(share.directory, `video.${extension}`), buffer, { flag: 'wx' });
  return extension;
}

export async function readShareAsset(id, kind, root, now = Date.now()) {
  const share = await getShare(id, root, now);
  if (!share) return null;
  const filename = kind === 'photo' ? 'photo.png' : kind === 'video' && share.video ? `video.${share.video}` : null;
  if (!filename) return null;
  return { buffer: await readFile(path.join(share.directory, filename)), filename };
}
