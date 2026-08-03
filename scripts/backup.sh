#!/usr/bin/env bash
# Timestamped backup of the ARACHNE database and image volume.
#
#   ./scripts/backup.sh [output-dir]
#
# Default output: ./backups
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="${OUT_DIR}/arachne-${STAMP}.tar.gz"
CONTAINER="${ARACHNE_CONTAINER:-arachne}"
KEEP="${ARACHNE_KEEP:-30}"

mkdir -p "$OUT_DIR"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Backing up from container '${CONTAINER}'"

  # SQLite in WAL mode has committed data sitting outside the main .db file, so
  # copying it while the app runs can produce a torn backup. .backup takes a
  # consistent snapshot of a live database.
  docker exec "$CONTAINER" sh -c \
    'node -e "const D=require(\"better-sqlite3\");const d=new D(process.env.DATABASE_PATH);d.exec(\"VACUUM INTO \x27/tmp/arachne-backup.db\x27\");d.close()"' \
    || { echo "Snapshot failed — is the app running?"; exit 1; }

  docker cp "${CONTAINER}:/tmp/arachne-backup.db" "${STAGE}/arachne.db"
  docker exec "$CONTAINER" rm -f /tmp/arachne-backup.db
  docker cp "${CONTAINER}:/data/uploads" "${STAGE}/uploads" 2>/dev/null || mkdir -p "${STAGE}/uploads"
else
  echo "Container '${CONTAINER}' not running — backing up local paths"
  DB_PATH="${DATABASE_PATH:-./data/db/arachne.db}"
  UP_DIR="${UPLOAD_DIR:-./data/uploads}"
  [ -f "$DB_PATH" ] || { echo "No database at ${DB_PATH}"; exit 1; }
  cp "$DB_PATH" "${STAGE}/arachne.db"
  [ -d "$UP_DIR" ] && cp -r "$UP_DIR" "${STAGE}/uploads" || mkdir -p "${STAGE}/uploads"
fi

tar -czf "$ARCHIVE" -C "$STAGE" arachne.db uploads
echo "Wrote ${ARCHIVE} ($(du -h "$ARCHIVE" | cut -f1))"

# Prune old archives, keeping the most recent $KEEP.
if [ "$KEEP" -gt 0 ]; then
  ls -1t "${OUT_DIR}"/arachne-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    rm -f "$old"
    echo "Pruned $(basename "$old")"
  done
fi
