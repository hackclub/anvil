---
name: verify
description: How to run anvil locally and drive it in a browser to verify changes (dev DB, dev server, auth session minting).
---

# Verifying anvil changes at runtime

## Database

`bun run db:up` wants port 5432, which is often taken by other projects'
Postgres containers on this machine. Instead, run the dev DB on a spare port
against the volume that actually holds the seeded dev data
(`ascysws-alpha_anvil-pgdata` — NOT `anvil_anvil-pgdata`, which is empty):

```bash
docker run -d --rm --name anvil-db-verify \
  -e POSTGRES_USER=anvil -e POSTGRES_PASSWORD=anvil -e POSTGRES_DB=anvil \
  -p 5434:5432 -v ascysws-alpha_anvil-pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

The seeded data has ~48 shop items with thumbnails; the image files live in
`.data/uploads/` and are served same-origin at `/uploads/...`.

## Dev server

```bash
DATABASE_URL=postgres://anvil:anvil@localhost:5434/anvil bun run dev --port 5199
```

Wait for `curl -s http://localhost:5199/api/shop` to return items.

## Auth (reaching /shop, /dashboard, etc.)

Login goes through Hack Club Auth OAuth — not drivable headlessly. Sessions
are DB-backed: the `anvil_session` cookie holds a token whose sha256 is stored
in `sessions.token_hash` (see `src/lib/server/auth/session.ts`). Mint one:

```bash
# sha256 of the literal token "verify-shop-token-123"
PGPASSWORD=anvil psql -h localhost -p 5434 -U anvil -d anvil -c \
  "insert into sessions (token_hash, expires_at, user_id) values
   ('49cd6f0a0220a721ba4a1e3d5808220cff8fd6bc2c16e1312a2077c75656b259',
    now() + interval '1 day',
    (select id from users where deleted_at is null and not is_banned order by id limit 1))
   on conflict (token_hash) do update set expires_at = now() + interval '1 day'"
```

Then in the browser: `document.cookie = 'anvil_session=verify-shop-token-123; path=/'`
and navigate to the authed page. Delete the row when done.

## Gotchas

- HMR sometimes leaves component state stale after edits to `onMount` bodies —
  hard-reload (`ignoreCache: true`) before trusting what you observe.
- Screenshots: the Chrome DevTools MCP can only write inside workspace roots —
  use `.data/` (gitignored), not the scratchpad.
- Clean up after: kill the dev server, `docker rm -f anvil-db-verify`, delete
  the minted session row and any screenshots left in `.data/`.
