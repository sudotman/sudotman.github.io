/**
 * The door on Cloudflare: a Worker in front of a D1 database.
 *
 * All of the logic is core.mjs. This only hands it D1 as the database and the
 * visitor's address from the header Cloudflare sets. See README.md for the
 * deploy; the bindings and variables are named in wrangler.toml.
 */

import { createDoor } from './core.mjs';

const d1 = (database) => ({
  all: async (sql, ...params) => (await database.prepare(sql).bind(...params).all()).results || [],
  run: async (sql, ...params) => {
    const result = await database.prepare(sql).bind(...params).run();
    return { lastId: result.meta?.last_row_id };
  }
});

export default {
  async fetch(request, env) {
    const door = createDoor({
      db: d1(env.DB),
      origins: String(env.ORIGINS || 'https://satyam.lol').split(','),
      adminKey: env.ADMIN_KEY || '',
      salt: env.SALT || '',
      block: env.BLOCK || ''
    });
    return door.handle(request, { ip: request.headers.get('CF-Connecting-IP') || '' });
  }
};
