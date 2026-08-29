#!/usr/bin/env node

/**
 * Local preview server.
 *
 * The blog ships as directories with an index.html, and the editor loads ES
 * modules — neither works over file://. This serves the repository the way
 * GitHub Pages does: directory URLs resolve to index.html, and a missing path
 * falls through to 404.html.
 *
 *   node scripts/serve.mjs [port]
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8'
}));

async function resolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.join(ROOT, path.normalize(decoded));
  // path.normalize alone does not stop `..` from escaping; the prefix does.
  if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) return null;

  const candidates = decoded.endsWith('/')
    ? [path.join(target, 'index.html')]
    : [target, path.join(target, 'index.html'), `${target}.html`];

  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) return candidate;
  }
  return null;
}

const server = http.createServer(async (request, response) => {
  const file = await resolve(request.url || '/');

  if (!file) {
    const fallback = await resolve('/404.html');
    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    if (fallback) return createReadStream(fallback).pipe(response);
    return response.end('404');
  }

  response.writeHead(200, {
    'content-type': TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
    'cache-control': 'no-cache'
  });
  createReadStream(file).pipe(response);
});

server.listen(PORT, () => {
  console.log(`satyam.lol preview  →  http://localhost:${PORT}/`);
  console.log(`                        http://localhost:${PORT}/blog/`);
  console.log(`                        http://localhost:${PORT}/write/`);
});
