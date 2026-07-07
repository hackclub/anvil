# Build & deploy image for Coolify (Dockerfile build pack).
#
# Required env vars in Coolify: DATABASE_URL (plus the rest of .env.example),
# and ORIGIN=https://<your-domain> — adapter-node needs it for form actions
# and CSRF checks behind Coolify's proxy.
#
# Migrations run on container start, right before the server boots — the
# database is only reachable at runtime, not while the image builds.

FROM oven/bun:1.3-slim AS build
WORKDIR /app

COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production

# Runtime deps only; drizzle-kit lives in `dependencies` so `db:migrate`
# works here without the rest of the dev tooling.
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/build ./build
COPY drizzle ./drizzle
COPY drizzle.config.ts ./drizzle.config.ts

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
	CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# `exec` so the server receives SIGTERM directly (graceful redeploys).
CMD ["sh", "-c", "bun run db:migrate && exec bun build/index.js"]
