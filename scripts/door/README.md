# The door

The one part of satyam.lol that is not a static file. It keeps the two things a
visitor can leave on the front door:

- **note from the previous visitor under the door**: one at a time; leaving one replaces the last
- **one word each**: one word a day per visitor, run together as a sentence

`core.mjs` is all of the logic. It runs in two places with the same behaviour:

| where | entry | database |
|---|---|---|
| Cloudflare (recommended) | `worker.mjs` | D1 |
| a machine of your own | `server.mjs` | a SQLite file, via `node:sqlite` |

The front door finds it through `door.endpoint` in `content/home.json`. While
that is empty, nothing about the door appears on the page.

## What it keeps, and what it does not

- Words, and the last 20 notes (so a bad note can be swept away and the one
  before it comes back).
- No names, no cookies, no addresses. A visitor is a salted hash of their IP,
  used only to hold them to the limits, and blanked after two days.

## The rules it enforces

- A word: letters in any script, up to 24, no spaces, digits or dots.
- A note: plain text up to 200 characters, no links or addresses.
- One word per visitor per day; one note per visitor per ten minutes; three
  sweeps per visitor per day; a ceiling on all three across everyone per hour.
- Only pages listed in `ORIGINS` may write.
- `BLOCK` is a comma-separated list of terms nothing may contain. It is a
  setting rather than a file so the list is not published in the repository.

## Deploying to Cloudflare

Needs a Cloudflare account (free) and Node. From this folder:

```bash
npx wrangler login
npx wrangler d1 create satyam-door
```

Paste the `database_id` it prints into `wrangler.toml`, then:

```bash
npx wrangler d1 execute satyam-door --remote --file=schema.sql
npx wrangler secret put SALT
npx wrangler secret put ADMIN_KEY
npx wrangler deploy
```

`SALT` and `ADMIN_KEY` are any long random strings; keep `ADMIN_KEY`, it is how
you remove things. `wrangler deploy` prints the address
(`https://satyam-door.<you>.workers.dev`). Put it in `content/home.json`:

```json
"door": { "endpoint": "https://satyam-door.<you>.workers.dev" }
```

and commit. The door is on the page from the next deploy.

## Running it yourself instead

```bash
DOOR_SALT=... DOOR_ADMIN_KEY=... DOOR_PROXY=1 node scripts/door/server.mjs
```

It listens on port 8413 and writes `scripts/door/door.sqlite`. The live site is
HTTPS and can only call HTTPS, so put it behind a tunnel (Cloudflare Tunnel or
similar) rather than opening a port, and use the tunnel's address as
`door.endpoint`. The page keeps working when this machine is off: it shows the
committed words and says the door is not answering.

## Trying it locally

```bash
npm run door
```

Then open the front door on the local preview with the door's address in the
query string, which only works on localhost:

```
http://localhost:8412/?door=http://localhost:8413
```

## Removing something

```bash
curl -X DELETE -H "Authorization: Bearer $ADMIN_KEY" https://<door>/word/123
curl -X DELETE -H "Authorization: Bearer $ADMIN_KEY" https://<door>/note/45
```

Word ids are in `https://<door>/words`; the showing note's id is in
`https://<door>/door`.

## Keeping a copy

`scripts/sync-door.mjs` copies the words into `content/door.json`. The deploy
workflow runs it so every deploy ships the current words, and
`.github/workflows/door.yml` commits the file once a day. Notes are not copied:
there is only meant to be one.

## Tests

`node scripts/test-door.mjs` runs the real logic against SQLite in memory. It is
part of `npm test`.
