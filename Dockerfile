# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
# better-sqlite3 compiles from source on Alpine — musl has no prebuilt binary.
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

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
RUN npm run build

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
