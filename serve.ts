// A minimal static file server for local play-testing:
//   node serve.ts [--port 8080]
// serves game/ at http://localhost:8080 with the MIME types a canvas
// game needs. Development convenience only — the entry itself is the
// static files, hostable anywhere.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const portFlag = process.argv.indexOf('--port');
const port = portFlag === -1 ? 8080 : Number(process.argv[portFlag + 1]) || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  const filePath = join(gameRoot, relative === '' ? 'index.html' : relative);
  if (!filePath.startsWith(gameRoot + sep) && filePath !== gameRoot) {
    response.writeHead(403).end('forbidden');
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Lastlight Aegis at http://localhost:${port} (serving game/)`);
});
