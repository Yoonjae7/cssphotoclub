// Optional development preview. Production sharing runs in api/share.js on Vercel.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { STATIC_FILES } from './build-static.mjs';
import { createShareHandler } from './hosted-sharing.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
export function createBoothServer(root = projectRoot, share = createShareHandler()) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/share') {
        const request = new Request(url, {
          method: req.method, headers: req.headers,
          ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {})
        });
        const response = await share(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (!response.body || req.method === 'HEAD') { res.end(); return; }
        const body = Readable.fromWeb(response.body);
        body.on('error', error => res.destroy(error));
        res.on('close', () => body.destroy()); body.pipe(res); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (!STATIC_FILES.includes(name.slice(1))) { res.writeHead(403).end(); return; }
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(path.resolve(root) + path.sep) || !(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) { if (!res.headersSent) res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Could not load this page.'); else res.destroy(); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createBoothServer();
  server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Development preview: http://localhost:${server.address().port}`));
}
