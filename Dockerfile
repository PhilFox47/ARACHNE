# No `# syntax=` directive, deliberately.
#
# That line names a *tag*, so BuildKit has to ask Docker Hub which digest it
# currently points at on every single build — which needs an OAuth token from
# auth.docker.io before anything in this file is even parsed. On a connection
# where that call is slow or blocked, the build fails at step 3 with a TLS
# handshake timeout and none of the work below is ever reached.
#
# Docker's built-in frontend handles everything used here — cache mounts, ARG in
# FROM, COPY --from, COPY --chown — so the external one buys nothing and costs a
# mandatory network round-trip. Docker Engine 23 or newer is required, which any
# current Docker Desktop is.

# Debian slim rather than Alpine, and the reason is better-sqlite3.
#
# It ships prebuilt binaries for linux-x64 glibc and none for musl, so on Alpine
# `npm ci` hands the whole SQLite amalgamation to g++ and compiles it — minutes,
# single-threaded, on every cache miss. On glibc the same install downloads a
# 2 MB .node file: a measured 12 seconds cold against several minutes.
#
# The cost is roughly 40 MB of image. That is the right trade for a self-hosted
# app that gets rebuilt far more often than it gets pulled.
ARG NODE_IMAGE=node:22-slim

# ── deps ─────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

# Only a fallback. prebuild-install should find a binary for this platform and
# never touch these — but if it ever 404s, node-gyp needs a compiler, and a
# build that fails to produce a runnable image beats one that cannot recover.
# Discarded with this stage, so none of it reaches the final image.
#
# Debian's images delete downloaded .debs after every install; the cache mount
# below is pointless until that is turned off.
RUN rm -f /etc/apt/apt.conf.d/docker-clean \
 && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++

# Build better-sqlite3 locally instead of downloading a prebuilt binary.
#
# This is the fix for a build that hangs at `npm ci` with no output at all.
# better-sqlite3's install script is `prebuild-install || node-gyp rebuild`, and
# prebuild-install fetches its binary from **github.com** — not from the npm
# registry — using simple-get with no timeout configured anywhere. If GitHub is
# slow or unreachable from inside the Docker network, that call never returns
# and never errors. The registry being fast tells you nothing, because it is a
# different host.
#
# `build_from_source` makes prebuild-install skip the download entirely
# ("--build-from-source specified, not attempting download") and go straight to
# node-gyp, which does have timeouts and retries and so fails loudly rather than
# hanging. It costs about two minutes of compiling, once, and the layer is then
# cached until a dependency actually changes.
ENV npm_config_build_from_source=true

# node-gyp builds single-threaded unless told otherwise.
ENV npm_config_jobs=max

# Use the node headers the image already carries, if it carries them.
#
# Building from source moves the download off github.com but node-gyp still
# fetches headers from nodejs.org — a third host that has to be reachable. The
# official node images ship those headers at /usr/local/include/node, so when
# they are present this makes the native build entirely offline.
#
# Conditional on purpose. Setting nodedir unconditionally would hard-fail on any
# base image that omits them, and falling back to the download is the correct
# behaviour there rather than a broken build.
RUN if [ -f /usr/local/include/node/node.h ]; then \
      mkdir -p "$(dirname "$(npm config get globalconfig)")"; \
      echo "nodedir=/usr/local" >> "$(npm config get globalconfig)"; \
      echo "using the image's own node headers — no nodejs.org fetch"; \
    else \
      echo "no bundled headers; node-gyp will fetch them from nodejs.org"; \
    fi

# Only the lockfile is copied, and package.json is generated from it.
#
# This layer used to be `COPY package.json package-lock.json*`, which meant the
# version bump that goes with every release invalidated it — and `npm ci` then
# reinstalled everything over three characters in a string the installer never
# reads. The lockfile is the only thing that decides what gets installed, and
# its root entry carries name, version, dependencies and devDependencies, which
# is everything `npm ci` needs.
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

# Fail a stalled download in a minute instead of five, and retry it.
#
# npm's default fetch-timeout is 300000 ms with 2 retries, so a transfer that
# stalls mid-tarball sits silently for five minutes, retries, and can burn a
# quarter of an hour before it admits anything is wrong. On a path that stalls
# intermittently — a degraded CDN route, a wrong MTU — that is the difference
# between a build that hangs and one that gets there on the second attempt.
#
# Sixty seconds is far longer than any of these tarballs needs on a working
# connection, so this costs nothing when the network is healthy.
ENV npm_config_fetch_timeout=60000 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=20000

# The npm cache survives across builds, so tarballs are not re-downloaded even
# when a dependency does change — which matters most on exactly the connection
# this is written for, since a partial run still banks whatever it got.
# --no-audit is not only speed: the audit is a network round-trip after the
# install has finished, and it is another place a build appears to hang.
# --foreground-scripts makes the install scripts print — without it a native
# build is a silent void, indistinguishable from a hang while you watch it.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    --mount=type=cache,target=/root/.cache/node-gyp,sharing=locked \
    npm ci --no-audit --no-fund --foreground-scripts

# Drop the optional packages built for a platform this image is not.
#
# next, sharp, lightningcss and tailwind's oxide each ship one native binary per
# platform as optional dependencies, and npm normally skips the ones whose `os`,
# `cpu` or `libc` do not match. It cannot here: package-lock.json predates npm
# recording `libc`, so on glibc it installs the musl builds too — 165 MB of
# binaries that can never execute. Regenerating the lockfile does not add the
# field, and `npm ci --libc=glibc` is ignored for the same reason; both were
# tried. So they are removed afterwards, which at least keeps them out of the
# layer the build stage copies.
#
# Derived from the running platform rather than a hardcoded list, so this stays
# correct if NODE_IMAGE is ever pointed at a different base.
RUN node -e "\
  const fs = require('fs'), path = require('path'); \
  const libc = process.report?.getReport()?.header?.glibcVersionRuntime ? 'glibc' : 'musl'; \
  let gone = 0; \
  const walk = (dir) => { \
    for (const name of fs.readdirSync(dir)) { \
      const p = path.join(dir, name); \
      if (name.startsWith('@')) { walk(p); continue; } \
      let pkg; \
      try { pkg = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')); } catch { continue; } \
      if ((pkg.os && !pkg.os.includes(process.platform)) \
       || (pkg.cpu && !pkg.cpu.includes(process.arch)) \
       || (pkg.libc && !pkg.libc.includes(libc))) { \
        fs.rmSync(p, { recursive: true, force: true }); \
        gone++; \
      } \
    } \
  }; \
  walk('node_modules'); \
  console.log('pruned ' + gone + ' packages built for another platform (libc=' + libc + ')'); \
"

# ── build ────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
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
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/db/arachne.db \
    UPLOAD_DIR=/data/uploads

RUN groupadd -g 1001 arachne \
 && useradd -u 1001 -g arachne -M -s /usr/sbin/nologin arachne

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

# Zombie reaping and SIGTERM forwarding — so SQLite closes cleanly on restart —
# come from Docker's own init (`init: true` in compose) rather than a tini
# package, which is one less thing to install and one less path to get wrong.
CMD ["node", "server.js"]
