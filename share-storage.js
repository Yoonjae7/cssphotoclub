import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { validStripPng } from './photo-storage.js';

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const validShareId = id => SHARE_ID.test(id);

export function videoExtension(type, buffer) {
  if (type === 'video/webm' && buffer.length > 16 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (type === 'video/mp4' && buffer.length > 16 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  return null;
}

export async function createShare(buffer, root) {
  if (!validStripPng(buffer)) throw new Error('Expected a complete four-cut PNG');
  const id = randomUUID();
  const directory = path.join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'photo.png'), buffer, { flag: 'wx' });
  return id;
}

export async function getShare(id, root) {
  if (!validShareId(id)) return null;
  const directory = path.join(root, id);
  try {
    if (!(await stat(path.join(directory, 'photo.png'))).isFile()) return null;
    let video = null;
    for (const extension of ['mp4', 'webm']) {
      try { if ((await stat(path.join(directory, `video.${extension}`))).isFile()) video = extension; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return { id, directory, video };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveShareVideo(id, type, buffer, root) {
  const share = await getShare(id, root);
  if (!share) throw new Error('Share not found');
  const extension = videoExtension(type, buffer);
  if (!extension) throw new Error('Invalid video');
  await writeFile(path.join(share.directory, `video.${extension}`), buffer, { flag: 'wx' });
  return extension;
}

export async function readShareAsset(id, kind, root) {
  const share = await getShare(id, root);
  if (!share) return null;
  const filename = kind === 'photo' ? 'photo.png' : kind === 'video' && share.video ? `video.${share.video}` : null;
  if (!filename) return null;
  return { buffer: await readFile(path.join(share.directory, filename)), filename };
}
