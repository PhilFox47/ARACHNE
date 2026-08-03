import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/uploads";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Writes a data URL to the image volume and returns a storage-relative path.
 *
 * The returned path is always `<kind>/<date>/<random>.<ext>` — built entirely
 * from server-side values, never from anything the client sent, so there is no
 * route by which a crafted filename can escape the volume.
 */
export function saveDataUrl(
  dataUrl: string,
  kind: "meals" | "suit",
  date: string,
): { path: string; bytes: number } | { error: string } {
  const m = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { error: "Not a supported image data URL." };

  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength === 0) return { error: "Empty image." };
  if (buf.byteLength > MAX_BYTES) return { error: "Image too large." };

  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "unsorted";
  const rel = path.posix.join(kind, safeDate, `${crypto.randomUUID()}.${ext}`);
  const abs = path.join(UPLOAD_DIR, rel);

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);

  return { path: rel, bytes: buf.byteLength };
}

/** Resolves a stored path, refusing anything that escapes the volume. */
export function resolveStored(rel: string): string | null {
  const root = path.resolve(UPLOAD_DIR);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

export function readStored(rel: string): { buf: Buffer; type: string } | null {
  const abs = resolveStored(rel);
  if (!abs) return null;
  const ext = path.extname(abs).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { buf: fs.readFileSync(abs), type };
}

export function deleteStored(rel: string): void {
  const abs = resolveStored(rel);
  if (abs) fs.rmSync(abs, { force: true });
}
