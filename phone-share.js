import { CHUNK_BYTES, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from './sharing-config.js';
import { getBoothToken } from './booth-session.js';

async function request(url, options) {
  const response = await fetch(url, { ...options, headers: { ...options.headers, 'x-booth-token': getBoothToken() }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not prepare your phone link. Please try again.');
  return result;
}

export async function shareFiles(photo, video, { active = () => true, progress = () => {} } = {}) {
  if (photo.type !== 'image/png' || video.type !== 'video/mp4') throw new Error('Expected a PNG photo and an MP4 video.');
  if (photo.size > MAX_PHOTO_BYTES || video.size > MAX_VIDEO_BYTES) throw new Error('These files are too large to share. Download them on this computer.');
  const spec = blob => ({ size: blob.size, chunks: Math.ceil(blob.size / CHUNK_BYTES) });
  const upload = await request('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: spec(photo), video: spec(video) }) });
  const tasks = ['photo', 'video'].flatMap(kind => {
    const blob = kind === 'photo' ? photo : video;
    return Array.from({ length: Math.ceil(blob.size / CHUNK_BYTES) }, (_, index) => ({ kind, index, blob: blob.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES) }));
  });
  let next = 0, complete = 0;
  const worker = async () => {
    while (next < tasks.length) {
      if (!active()) throw new Error('Cancelled');
      const { kind, index, blob } = tasks[next++];
      await request(`/api/share?id=${upload.id}&kind=${kind}&chunk=${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'x-upload-token': upload.uploadToken }, body: blob });
      progress(Math.round(++complete / tasks.length * 100));
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
  if (!active()) throw new Error('Cancelled');
  return request(`/api/share?id=${upload.id}`, { method: 'POST', headers: { 'x-upload-token': upload.uploadToken } });
}
