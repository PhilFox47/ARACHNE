#!/usr/bin/env node
/**
 * Rasterises public/icons/icon.svg into the PNG sizes iOS and Android need.
 * sharp already ships inside next, so there's no extra dependency to install.
 *
 *   node scripts/gen-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const DIR = path.join(process.cwd(), "public", "icons");
const SRC = path.join(DIR, "icon.svg");
const BASE = "#0A0D16";

if (!fs.existsSync(SRC)) {
  console.error(`Missing ${SRC}`);
  process.exit(1);
}

const svg = fs.readFileSync(SRC);

const jobs = [
  { file: "icon-192.png", size: 192, pad: 0 },
  { file: "icon-512.png", size: 512, pad: 0 },
  { file: "apple-touch-icon.png", size: 180, pad: 0 },
  // Maskable icons get cropped to a circle by the launcher — the mark has to
  // sit inside the 80% safe zone or the outer ring loses its corners.
  { file: "icon-512-maskable.png", size: 512, pad: 0.1 },
];

for (const { file, size, pad } of jobs) {
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round((size - inner) / 2);

  const rendered = await sharp(svg, { density: 400 })
    .resize(inner, inner, { fit: "contain", background: BASE })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BASE },
  })
    .composite([{ input: rendered, top: offset, left: offset }])
    .png()
    .toFile(path.join(DIR, file));

  console.log(`${file}  ${size}×${size}${pad ? "  (maskable)" : ""}`);
}
