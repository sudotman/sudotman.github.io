#!/usr/bin/env node

/**
 * The door on a machine of your own: the same core.mjs behind node:http, with
 * node:sqlite as the database. No dependencies; needs Node 22.5 or later.
 *
 * This is what runs for local development, and what would run on a home server
 * behind a tunnel. It must be reached over HTTPS from the live site (a page on
 * https cannot call http), which the tunnel provides.
 *
 *   node scripts/door/server.mjs
 *
 *   DOOR_PORT      port to listen on                      (8413)
 *   DOOR_DB        path of the sqlite file                (scripts/door/door.sqlite)
 *   DOOR_ORIGINS   pages allowed to write, comma-separated
 *                  (https://satyam.lol,http://localhost:8412,http://localhost:4173)
 *   DOOR_ADMIN_KEY bearer key for removing a word or a note
 *   DOOR_SALT      mixed into the visitor hash; set it and keep it
 *   DOOR_BLOCK     comma-separated terms nothing may contain
 *   DOOR_PROXY=1   trust CF-Connecting-IP / X-Forwarded-For, when behind a tunnel
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createDoor, SCHEMA } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DOOR_PORT || 8413);
const FILE = process.env.DOOR_DB || path.join(HERE, 'door.sqlite');
const PROXIED = process.env.DOOR_PROXY === '1';

export function sqlite(file) {
  const database = new DatabaseSync(file);
  database.exec(SCHEMA);
  return {
    all: async (sql, ...params) => database.prepare(sql).all(...params),
    run: async (sql, ...params) => ({ lastId: Number(database.prepare(sql).run(...params).lastInsertRowid) }),
    close: () => database.close()
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const door = createDoor({
    db: sqlite(FILE),
    origins: String(process.env.DOOR_ORIGINS || 'https://satyam.lol,http://localhost:8412,http://localhost:4173').split(','),
    adminKey: process.env.DOOR_ADMIN_KEY || '',
    salt: process.env.DOOR_SALT || '',
    block: process.env.DOOR_BLOCK || ''
  });

  http.createServer(async (incoming, outgoing) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 8192) break;
      chunks.push(chunk);
    }
    const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD';
    const request = new Request(`http://${incoming.headers.host || 'localhost'}${incoming.url}`, {
      method: incoming.method,
      headers: Object.entries(incoming.headers).flatMap(([name, value]) => [].concat(value).map((item) => [name, item])),
      body: hasBody ? Buffer.concat(chunks) : undefined
    });
    const forwarded = PROXIED && (incoming.headers['cf-connecting-ip'] || String(incoming.headers['x-forwarded-for'] || '').split(',')[0].trim());
    const response = await door.handle(request, { ip: forwarded || incoming.socket.remoteAddress || '' });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  }).listen(PORT, () => {
    console.log(`The door is at http://localhost:${PORT} (${FILE})`);
  });
}
