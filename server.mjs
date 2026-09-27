import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveStrip, validStripPng } from './photo-storage.js';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.webm': 'video/webm', '.mp4': 'video/mp4' };
export function createBoothServer(root = projectRoot) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/strips' && req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}`) { res.writeHead(403).end('Invalid origin'); return; }
        if ((req.headers['content-type'] || '').split(';')[0] !== 'image/png') { res.writeHead(415).end('Expected PNG'); return; }
        const chunks = []; let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 20 * 1024 * 1024) { res.writeHead(413).end('Photo strip is too large'); return; }
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        if (!validStripPng(buffer)) { res.writeHead(400).end('Invalid photo strip PNG'); return; }
        const filename = await saveStrip(buffer, path.join(root, 'photo-strips'));
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ filename, url: `/photo-strips/${filename}` })); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end('Method not allowed'); return; }
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (name.split('/').some(part => part.startsWith('.') || part === 'node_modules' || part === 'vendor')) { res.writeHead(403).end(); return; }
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
      if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Local booth error');
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createBoothServer();
  server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`CSS Photo Club is ready at http://localhost:${server.address().port}`));
}
