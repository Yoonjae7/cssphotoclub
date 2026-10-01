import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { saveStrip, validStripPng } from './photo-storage.js';
import { createShare, getShare, readShareAsset, saveShareVideo, validShareId, videoExtension } from './share-storage.js';
import { STATIC_FILES } from './build-static.mjs';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const mediaRoot = root => path.join(root, 'share-media');

function phoneOrigin(req) {
  if (process.env.BOOTH_PUBLIC_URL) {
    const url = new URL(process.env.BOOTH_PUBLIC_URL);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('BOOTH_PUBLIC_URL must be HTTP or HTTPS');
    return url.origin;
  }
  const port = req.socket.localPort;
  const candidates = Object.values(networkInterfaces()).flat().filter(address => address?.family === 'IPv4' && !address.internal);
  const address = candidates.find(item => item.address.startsWith('192.168.')) ||
    candidates.find(item => item.address.startsWith('10.')) || candidates[0];
  if (!address) return null;
  // Never use an untrusted Host header to build the QR destination.
  return `http://${address.address}:${port}`;
}

async function readBody(req, limit) {
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) { const error = new Error('Upload too large'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${req.headers.host}`;
}

function sharePage(id, hasVideo) {
  const video = hasVideo ? `<a class="download" href="/api/shares/${id}/video?download=1">Download video (${hasVideo.toUpperCase()})</a>` : '<p>The video is still being prepared. Refresh this page in a moment.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your CSS Photo Club photos</title><style>body{font:16px system-ui,sans-serif;background:#eeebf8;color:#363449;margin:0;padding:24px}main{max-width:480px;margin:7vh auto;background:#fff;padding:28px;box-shadow:6px 6px 0 #b9b0d6}h1{font-size:30px;margin:0 0 10px}p{line-height:1.5}.preview{display:block;max-height:55vh;max-width:100%;margin:20px auto}.download{display:block;text-align:center;background:#b9cfbf;color:#242139;padding:15px;margin:12px 0;font-weight:700;text-decoration:none;border:1px solid #363449}</style></head><body><main><h1>Your photo club keepsake ✳</h1><p>Save your strip and video to your phone.</p><img class="preview" src="/api/shares/${id}/photo" alt="Your four-photo strip"><a class="download" href="/api/shares/${id}/photo?download=1">Download photo (PNG)</a>${video}<p>On iPhone, you can also touch and hold the photo to save it.</p></main></body></html>`;
}

export function createBoothServer(root = projectRoot) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const shareMatch = /^\/api\/shares\/([^/]+)(?:\/(photo|video))?$/.exec(url.pathname);
      const pageMatch = /^\/share\/([^/]+)$/.exec(url.pathname);
      if (url.pathname === '/api/shares' && req.method === 'POST') {
        if (!sameOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        if ((req.headers['content-type'] || '').split(';')[0] !== 'image/png') { res.writeHead(415).end('Expected PNG'); return; }
        const buffer = await readBody(req, 20 * 1024 * 1024);
        if (!validStripPng(buffer)) { res.writeHead(400).end('Invalid photo strip PNG'); return; }
        const origin = phoneOrigin(req);
        if (!origin) { res.writeHead(503).end('No network address available for phone sharing'); return; }
        const id = await createShare(buffer, mediaRoot(root));
        res.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ id, shareUrl: `${origin}/share/${id}` })); return;
      }
      if (shareMatch && req.method === 'POST' && shareMatch[2] === 'video') {
        if (!sameOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        if (!validShareId(shareMatch[1])) { res.writeHead(404).end('Not found'); return; }
        const type = (req.headers['content-type'] || '').split(';')[0];
        if (!['video/webm', 'video/mp4'].includes(type)) { res.writeHead(415).end('Expected WebM or MP4 video'); return; }
        const buffer = await readBody(req, 50 * 1024 * 1024);
        if (!videoExtension(type, buffer)) { res.writeHead(400).end('Invalid video'); return; }
        try { await saveShareVideo(shareMatch[1], type, buffer, mediaRoot(root)); }
        catch (error) { res.writeHead(error.code === 'EEXIST' ? 409 : error.message === 'Share not found' ? 404 : 500).end('Could not save video'); return; }
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ video: true })); return;
      }
      if (url.pathname === '/api/strips' && req.method === 'POST') {
        if (!sameOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        if ((req.headers['content-type'] || '').split(';')[0] !== 'image/png') { res.writeHead(415).end('Expected PNG'); return; }
        const buffer = await readBody(req, 20 * 1024 * 1024);
        if (!validStripPng(buffer)) { res.writeHead(400).end('Invalid photo strip PNG'); return; }
        const filename = await saveStrip(buffer, path.join(root, 'photo-strips'));
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ filename, url: `/photo-strips/${filename}` })); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end('Method not allowed'); return; }
      if (pageMatch) {
        const share = await getShare(pageMatch[1], mediaRoot(root));
        if (!share) { res.writeHead(404).end('Share not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).end(req.method === 'HEAD' ? undefined : sharePage(share.id, share.video)); return;
      }
      if (shareMatch && shareMatch[2]) {
        const asset = await readShareAsset(shareMatch[1], shareMatch[2], mediaRoot(root));
        if (!asset) { res.writeHead(404).end('Not found'); return; }
        const headers = { 'Content-Type': types[path.extname(asset.filename)], 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
        if (url.searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="css-photo-club-${asset.filename}"`;
        res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : asset.buffer); return;
      }
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const localArchive = /^\/photo-strips\/[^/]+\.png$/.test(name) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (!STATIC_FILES.includes(name.slice(1)) && !localArchive) { res.writeHead(403).end(); return; }
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
      if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) {
      res.writeHead(error.status || (error.code === 'ENOENT' ? 404 : 500)).end(error.status === 413 ? 'Upload too large' : error.code === 'ENOENT' ? 'Not found' : 'Local booth error');
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createBoothServer();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`CSS Photo Club is ready at http://localhost:${server.address().port}`));
}
