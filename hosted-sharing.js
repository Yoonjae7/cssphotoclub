import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { validStripPng } from './photo-storage.js';
import { CHUNK_BYTES, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, SHARE_TTL_MS } from './sharing-config.js';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const metaKey = id => `cssbooth:shares:${id}:meta`;
const chunkKey = (id, kind, index) => `cssbooth:shares:${id}:${kind}:${index}`;
const hash = value => createHash('sha256').update(value).digest('hex');
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200) => Response.json(data, { status, headers });
class ShareError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function redisCommand(command) {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!endpoint || !token) throw new ShareError(503, 'Phone sharing needs its storage connection. The booth operator must connect Upstash Redis in Vercel.');
  const response = await fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new ShareError(503, 'Phone sharing is temporarily unavailable. Please try again.');
  return body.result;
}

const RATE_SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`;
const UPLOAD_SCRIPT = `if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; redis.call('SET',KEYS[2],ARGV[2],'PXAT',ARGV[3]); return 1`;
const FINISH_SCRIPT = `if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; for i=2,#KEYS do if redis.call('EXISTS',KEYS[i])==0 then return 0 end end; for i=2,#KEYS do redis.call('PEXPIREAT',KEYS[i],ARGV[3]) end; redis.call('SET',KEYS[1],ARGV[2],'PXAT',ARGV[3]); return 1`;

function spec(input, limit) {
  if (!Number.isInteger(input?.size) || input.size < 57 || input.size > limit || input.chunks !== Math.ceil(input.size / CHUNK_BYTES)) {
    throw new ShareError(400, 'Invalid photo or video size.');
  }
  return { size: input.size, chunks: input.chunks };
}
async function readLimited(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new ShareError(413, 'File is too large.');
  const chunks = []; let length = 0;
  if (request.body) for await (const part of request.body) {
    length += part.length;
    if (length > limit) throw new ShareError(413, 'File is too large.');
    chunks.push(Buffer.from(part));
  }
  return Buffer.concat(chunks);
}
async function readJson(request) {
  try { return JSON.parse((await readLimited(request, 2048)).toString()); }
  catch (error) { if (error instanceof ShareError) throw error; throw new ShareError(400, 'Invalid request.'); }
}
function sameOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
function checkWriter(request, meta) {
  const actual = hash(request.headers.get('x-upload-token') || '');
  const expected = meta.uploadHash || '';
  if (meta.ready || expected.length !== actual.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    throw new ShareError(403, 'This upload is no longer available.');
  }
}
function mediaKeys(id, meta) {
  return ['photo', 'video'].flatMap(kind => Array.from({ length: meta[kind].chunks }, (_, index) => chunkKey(id, kind, index)));
}

export function createShareHandler(command = redisCommand, now = Date.now) {
  async function load(id) {
    if (!ID.test(id || '')) throw new ShareError(404, 'This QR link is invalid.');
    const raw = await command(['GET', metaKey(id)]);
    if (!raw) throw new ShareError(410, 'This QR link has expired.');
    const meta = JSON.parse(raw);
    if (now() >= meta.expiresAt) throw new ShareError(410, 'This QR link has expired.');
    return { meta, raw };
  }
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.searchParams.get('health') === '1') {
        await command(['PING']); return json({ ready: true });
      }
      if (['POST', 'PUT'].includes(request.method) && !sameOrigin(request)) throw new ShareError(403, 'Invalid request origin.');
      if (request.method === 'POST' && !url.searchParams.has('id')) {
        const input = await readJson(request);
        const photo = spec(input.photo, MAX_PHOTO_BYTES), video = spec(input.video, MAX_VIDEO_BYTES);
        const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown';
        const count = await command(['EVAL', RATE_SCRIPT, 1, `cssbooth:rate:${hash(ip).slice(0, 24)}`]);
        if (count > 12) throw new ShareError(429, 'Too many new links. Wait a minute and try again.');
        const id = randomUUID(), uploadToken = randomBytes(24).toString('hex');
        const meta = { photo, video, ready: false, expiresAt: now() + SHARE_TTL_MS, uploadHash: hash(uploadToken) };
        await command(['SET', metaKey(id), JSON.stringify(meta), 'PXAT', meta.expiresAt, 'NX']);
        return json({ id, uploadToken, chunkBytes: CHUNK_BYTES }, 201);
      }
      const id = url.searchParams.get('id');
      const { meta, raw } = await load(id);
      if (request.method === 'PUT') {
        checkWriter(request, meta);
        const kind = url.searchParams.get('kind'), index = Number(url.searchParams.get('chunk'));
        if (!['photo', 'video'].includes(kind) || !url.searchParams.has('chunk') || !Number.isInteger(index) || index < 0 || index >= meta[kind].chunks) {
          throw new ShareError(400, 'Invalid upload chunk.');
        }
        if (request.headers.get('content-type') !== 'application/octet-stream') throw new ShareError(415, 'Invalid upload type.');
        const bytes = await readLimited(request, CHUNK_BYTES);
        if (bytes.length !== Math.min(CHUNK_BYTES, meta[kind].size - index * CHUNK_BYTES)) throw new ShareError(400, 'Incomplete upload chunk.');
        const saved = await command(['EVAL', UPLOAD_SCRIPT, 2, metaKey(id), chunkKey(id, kind, index), raw, bytes.toString('base64'), meta.expiresAt]);
        if (!saved) throw new ShareError(409, 'This upload is no longer available.');
        return json({ saved: true });
      }
      if (request.method === 'POST') {
        checkWriter(request, meta);
        const parts = {};
        for (const kind of ['photo', 'video']) {
          const buffers = [];
          for (let index = 0; index < meta[kind].chunks; index++) {
            const part = await command(['GET', chunkKey(id, kind, index)]);
            if (!part) throw new ShareError(409, 'The upload is incomplete. Please try again.');
            buffers.push(Buffer.from(part, 'base64'));
          }
          parts[kind] = Buffer.concat(buffers);
          if (parts[kind].length !== meta[kind].size) throw new ShareError(409, 'The upload is incomplete.');
        }
        if (!validStripPng(parts.photo) || parts.video.toString('ascii', 4, 8) !== 'ftyp') throw new ShareError(415, 'Expected a PNG photo and an MP4 video.');
        const complete = { photo: meta.photo, video: meta.video, ready: true, expiresAt: now() + SHARE_TTL_MS };
        const keys = [metaKey(id), ...mediaKeys(id, meta)];
        const saved = await command(['EVAL', FINISH_SCRIPT, keys.length, ...keys, raw, JSON.stringify(complete), complete.expiresAt]);
        if (!saved) throw new ShareError(409, 'The upload expired. Please try again.');
        return json({ id, expiresAt: complete.expiresAt, remainingMs: Math.max(0, complete.expiresAt - now()), shareUrl: `${url.origin}/download.html?id=${id}` }, 201);
      }
      if (request.method !== 'GET') throw new ShareError(405, 'Method not allowed.');
      if (!meta.ready) throw new ShareError(404, 'These files are still being prepared.');
      const kind = url.searchParams.get('kind');
      if (!kind) return json({ expiresAt: meta.expiresAt, remainingMs: Math.max(0, meta.expiresAt - now()), photo: `/api/share?id=${id}&kind=photo`, video: `/api/share?id=${id}&kind=video` });
      if (!['photo', 'video'].includes(kind)) throw new ShareError(404, 'File not found.');
      const first = await command(['GET', chunkKey(id, kind, 0)]);
      if (!first) throw new ShareError(410, 'This QR link has expired.');
      let index = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            if (now() >= meta.expiresAt) throw new Error('Expired');
            const value = index === 0 ? first : await command(['GET', chunkKey(id, kind, index)]);
            if (!value) throw new Error('Expired');
            controller.enqueue(Buffer.from(value, 'base64'));
            if (++index === meta[kind].chunks) controller.close();
          } catch (error) { controller.error(error); }
        }
      });
      const extension = kind === 'photo' ? 'png' : 'mp4';
      return new Response(stream, { headers: {
        ...headers, 'Content-Type': kind === 'photo' ? 'image/png' : 'video/mp4', 'Content-Length': String(meta[kind].size),
        ...(url.searchParams.get('download') === '1' ? { 'Content-Disposition': `attachment; filename="css-four-cut-${id}.${extension}"` } : {})
      } });
    } catch (error) {
      if (error instanceof ShareError) return json({ error: error.message }, error.status);
      return json({ error: 'Phone sharing is temporarily unavailable. Please try again.' }, 503);
    }
  };
}
