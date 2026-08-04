# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
# better-sqlite3 compiles from source on Alpine — musl has no prebuilt binary.
# That compile is the expensive part of this stage, so the whole design below is
# about not doing it when nothing has actually changed.
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app

# node-gyp builds single-threaded unless told otherwise. On any modern machine
# this is the difference between one core compiling SQLite and all of them.
ENV npm_config_jobs=max

# Only the lockfile is copied, and package.json is generated from it.
#
# This layer used to be `COPY package.json package-lock.json*`, which meant the
# version bump that goes with every release invalidated it — and `npm ci` then
# recompiled better-sqlite3 from source over three characters in a string the
# installer never reads. The lockfile is the only thing that decides what gets
# installed, and its root entry carries name, version, dependencies and
# devDependencies, which is everything `npm ci` needs.
#
# Generating package.json from the lockfile keys this layer on the dependencies
# alone: change one and it rebuilds, as it must. Bump the version, edit a
# script, ship a release, and it stays cached. The real package.json arrives
# with `COPY . .` in the next stage, so the build itself sees the file as
# written.
COPY package-lock.json ./
RUN node -e "\
  const lock = require('./package-lock.json'); \
  const root = lock.packages['']; \
  require('fs').writeFileSync('package.json', JSON.stringify({ \
    name: root.name ?? lock.name, \
    version: root.version ?? lock.version, \
    private: true, \
    dependencies: root.dependencies ?? {}, \
    devDependencies: root.devDependencies ?? {}, \
  }, null, 2)); \
"

# The npm cache survives across builds, so the tarballs are not re-downloaded
# even when a dependency does change. --no-audit is not just speed: the audit
# endpoint is a network round-trip after the install has finished, and it is
# where a build appears to hang when npm's registry is slow.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# ── build ────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build imports lib/db, which opens SQLite. Point it somewhere writable so a
# build never touches the real volume.
ENV DATABASE_PATH=/tmp/build.db
# Next's own cache makes an incremental rebuild several times faster. It is a
# cache in the strict sense — deleting it changes nothing but the wait.
RUN --mount=type=cache,target=/app/.next/cache,sharing=locked \
    npm run build

# ── runtime ──────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat tini
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/db/arachne.db \
    UPLOAD_DIR=/data/uploads

RUN addgroup -g 1001 -S arachne && adduser -u 1001 -S arachne -G arachne

COPY --from=build /app/public ./public
COPY --from=build --chown=arachne:arachne /app/.next/standalone ./
COPY --from=build --chown=arachne:arachne /app/.next/static ./.next/static
# standalone traces the JS but not the compiled .node binary.
COPY --from=build --chown=arachne:arachne /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=build --chown=arachne:arachne /app/node_modules/bindings ./node_modules/bindings
COPY --from=build --chown=arachne:arachne /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

RUN mkdir -p /data/db /data/uploads && chown -R arachne:arachne /data

USER arachne
EXPOSE 3000
VOLUME ["/data/db", "/data/uploads"]

# tini reaps zombies and forwards SIGTERM, so SQLite closes cleanly on restart.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
