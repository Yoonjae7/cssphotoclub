import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, networkInterfaces } from 'node:os';
import { validStripPng } from './photo-storage.js';
import { activeShares, archivePicture, archiveVideo, createShare, getShare, readShareAsset, removeShare, saveShareVideo, validShareId, videoExtension } from './share-storage.js';
import { STATIC_FILES } from './build-static.mjs';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const mediaRoot = root => path.join(root, 'share-media');
const archiveRoot = root => process.env.BOOTH_ARCHIVE_DIR || (root === projectRoot
  ? path.join(homedir(), 'Downloads', 'cssbooth')
  : path.join(root, 'cssbooth'));
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return loopback(req.socket.remoteAddress);
  return origin === `http://${req.headers.host}` || Boolean(process.env.BOOTH_SITE_ORIGIN && origin === new URL(process.env.BOOTH_SITE_ORIGIN).origin);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !process.env.BOOTH_SITE_ORIGIN || origin !== new URL(process.env.BOOTH_SITE_ORIGIN).origin) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Vary': 'Origin' };
}

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

function sharePage(id, hasVideo, expiresAt) {
  const video = hasVideo ? `<a class="download" href="/api/shares/${id}/video?download=1">Download video (${hasVideo.toUpperCase()})</a>` : '<p>The video is still being prepared. Refresh this page in a moment.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your CSS Photo Club photos</title><style>body{font:16px system-ui,sans-serif;background:#eeebf8;color:#363449;margin:0;padding:24px}main{max-width:480px;margin:7vh auto;background:#fff;padding:28px;box-shadow:6px 6px 0 #b9b0d6}h1{font-size:30px;margin:0 0 10px}p{line-height:1.5}.preview{display:block;max-height:55vh;max-width:100%;margin:20px auto}.download{display:block;text-align:center;background:#b9cfbf;color:#242139;padding:15px;margin:12px 0;font-weight:700;text-decoration:none;border:1px solid #363449}</style></head><body><main><h1>Your photo club keepsake ✳</h1><p id="expiry">This QR expires in five minutes.</p><img class="preview" src="/api/shares/${id}/photo" alt="Your four-photo strip"><a class="download" href="/api/shares/${id}/photo?download=1">Download photo (PNG)</a>${video}<p>On iPhone, you can also touch and hold the photo to save it.</p></main><script>const expiry=${expiresAt};const update=()=>{const left=Math.max(0,Math.ceil((expiry-Date.now())/1000));document.getElementById('expiry').textContent=left?'Link expires in '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'):'This QR has expired.';if(!left){document.querySelectorAll('.download,.preview').forEach(element=>element.remove());clearInterval(tick);}};const tick=setInterval(update,1000);update();</script></body></html>`;
}

export function createBoothServer(root = projectRoot) {
  const timers = new Map();
  const schedule = share => {
    const timer = setTimeout(() => { timers.delete(share.id); removeShare(share.id, mediaRoot(root)).catch(error => console.error('Could not expire share', error)); }, Math.max(1, share.expiresAt - Date.now()));
    timer.unref(); timers.set(share.id, timer);
  };
  const ready = activeShares(mediaRoot(root)).then(shares => shares.forEach(schedule));
  const server = http.createServer(async (req, res) => {
    try {
      await ready;
      const url = new URL(req.url, 'http://localhost');
      const shareMatch = /^\/api\/shares\/([^/]+)(?:\/(photo|video))?$/.exec(url.pathname);
      const pageMatch = /^\/share\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'OPTIONS' && (['/api/shares', '/api/strips', '/api/health'].includes(url.pathname) || shareMatch?.[2] === 'video')) {
        if (!allowedOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        res.writeHead(204, corsHeaders(req)).end(); return;
      }
      if (url.pathname === '/api/health' && req.method === 'GET') {
        if (!allowedOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) }).end(JSON.stringify({ ready: true })); return;
      }
      if (url.pathname === '/api/shares' && req.method === 'POST') {
        if (!allowedOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        if ((req.headers['content-type'] || '').split(';')[0] !== 'image/png') { res.writeHead(415).end('Expected PNG'); return; }
        const buffer = await readBody(req, 20 * 1024 * 1024);
        if (!validStripPng(buffer)) { res.writeHead(400).end('Invalid photo strip PNG'); return; }
        const origin = phoneOrigin(req);
        if (!origin) { res.writeHead(503).end('No network address available for phone sharing'); return; }
        await archivePicture(buffer, archiveRoot(root));
        const share = await createShare(buffer, mediaRoot(root)); schedule(share);
        res.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) }).end(JSON.stringify({ id: share.id, expiresAt: share.expiresAt, shareUrl: `${origin}/share/${share.id}` })); return;
      }
      if (shareMatch && req.method === 'POST' && shareMatch[2] === 'video') {
        if (!allowedOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        if (!validShareId(shareMatch[1])) { res.writeHead(404).end('Not found'); return; }
        const type = (req.headers['content-type'] || '').split(';')[0];
        if (!['video/webm', 'video/mp4'].includes(type)) { res.writeHead(415).end('Expected WebM or MP4 video'); return; }
        const buffer = await readBody(req, 50 * 1024 * 1024);
        if (!videoExtension(type, buffer)) { res.writeHead(400).end('Invalid video'); return; }
        try {
          if (!await getShare(shareMatch[1], mediaRoot(root))) { res.writeHead(404).end('Share not found or expired'); return; }
          await archiveVideo(type, buffer, archiveRoot(root));
          await saveShareVideo(shareMatch[1], type, buffer, mediaRoot(root));
        }
        catch (error) { res.writeHead(error.code === 'EEXIST' ? 409 : error.message === 'Share not found' ? 404 : 500).end('Could not save video'); return; }
        res.writeHead(201, { 'Content-Type': 'application/json', ...corsHeaders(req) }).end(JSON.stringify({ video: true })); return;
      }
      if (url.pathname === '/api/strips' && req.method === 'POST') {
        if (!allowedOrigin(req)) { res.writeHead(403).end('Invalid origin'); return; }
        if ((req.headers['content-type'] || '').split(';')[0] !== 'image/png') { res.writeHead(415).end('Expected PNG'); return; }
        const buffer = await readBody(req, 20 * 1024 * 1024);
        if (!validStripPng(buffer)) { res.writeHead(400).end('Invalid photo strip PNG'); return; }
        await archivePicture(buffer, archiveRoot(root));
        res.writeHead(201, { 'Content-Type': 'application/json', ...corsHeaders(req) }).end(JSON.stringify({ saved: true })); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end('Method not allowed'); return; }
      if (pageMatch) {
        const share = await getShare(pageMatch[1], mediaRoot(root));
        if (!share) { res.writeHead(404).end('Share not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).end(req.method === 'HEAD' ? undefined : sharePage(share.id, share.video, share.expiresAt)); return;
      }
      if (shareMatch && shareMatch[2]) {
        const asset = await readShareAsset(shareMatch[1], shareMatch[2], mediaRoot(root));
        if (!asset) { res.writeHead(404).end('Not found'); return; }
        const headers = { 'Content-Type': types[path.extname(asset.filename)], 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
        if (url.searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="css-photo-club-${asset.filename}"`;
        res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : asset.buffer); return;
      }
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (!STATIC_FILES.includes(name.slice(1))) { res.writeHead(403).end(); return; }
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
      if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) {
      res.writeHead(error.status || (error.code === 'ENOENT' ? 404 : 500)).end(error.status === 413 ? 'Upload too large' : error.code === 'ENOENT' ? 'Not found' : 'Local booth error');
    }
  });
  server.on('close', () => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createBoothServer();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`CSS Photo Club is ready at http://localhost:${server.address().port}`));
}
