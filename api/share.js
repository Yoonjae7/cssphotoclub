import { randomUUID, timingSafeEqual } from 'node:crypto';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BYTES = 4_000_000;

function authorized(request) {
  const expected = process.env.BOOTH_UPLOAD_KEY;
  const actual = request.headers.get('x-booth-upload-key') || '';
  if (!expected || !actual) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validMedia(kind, type, bytes) {
  if (kind === 'photo' && type === 'image/jpeg') return bytes.length > 100 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (kind === 'video' && type === 'video/webm') return bytes.length > 16 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (kind === 'video' && type === 'video/mp4') return bytes.length > 16 && Buffer.from(bytes).toString('ascii', 4, 8) === 'ftyp';
  return false;
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!ID.test(id || '')) return Response.json({ error: 'Invalid link' }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: 'Photo sharing is not configured' }, { status: 503 });
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: `shares/${id}/`, limit: 4 });
  const photo = blobs.find(blob => blob.pathname === `shares/${id}/photo.jpg`);
  const video = blobs.find(blob => /^shares\/[0-9a-f-]+\/video\.(webm|mp4)$/.test(blob.pathname));
  if (!photo) return Response.json({ error: 'Photo not found' }, { status: 404 });
  return Response.json({ photo: { url: photo.url, downloadUrl: photo.downloadUrl }, video: video ? { url: video.url, downloadUrl: video.downloadUrl, type: video.pathname.endsWith('.mp4') ? 'MP4' : 'WebM' } : null }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  if (!authorized(request)) return Response.json({ error: 'Invalid booth sharing key' }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: 'Connect a public Vercel Blob store to this project first' }, { status: 503 });
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const type = (request.headers.get('content-type') || '').split(';')[0];
  const id = url.searchParams.get('id') || (kind === 'photo' ? randomUUID() : '');
  if (!ID.test(id) || !['photo', 'video'].includes(kind)) return Response.json({ error: 'Invalid share' }, { status: 400 });
  const declaredLength = Number(request.headers.get('content-length'));
  if (declaredLength > MAX_BYTES) return Response.json({ error: 'File is too large' }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BYTES) return Response.json({ error: 'File is too large' }, { status: 413 });
  if (!validMedia(kind, type, bytes)) return Response.json({ error: 'Invalid photo or video' }, { status: 415 });
  const extension = kind === 'photo' ? 'jpg' : type === 'video/mp4' ? 'mp4' : 'webm';
  const { put } = await import('@vercel/blob');
  try {
    await put(`shares/${id}/${kind}.${extension}`, bytes.buffer, { access: 'public', contentType: type, addRandomSuffix: false });
  } catch (error) {
    if (/already exists|overwrite|conflict/i.test(error.message)) return Response.json({ error: 'This share already exists' }, { status: 409 });
    throw error;
  }
  return Response.json({ id, shareUrl: `${url.origin}/download.html?id=${id}` }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
