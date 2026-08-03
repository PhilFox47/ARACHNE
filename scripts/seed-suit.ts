/**
 * Development only: fills SUIT CHECK with placeholder frames across three weeks
 * so the comparison wipe has something to show. Silhouette narrows week on week.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import sharpDefault from "sharp";
import { db } from "../lib/db";
import { photos } from "../lib/db/schema";
import { getSettings } from "../lib/settings";
import { addDays, todayISO, weekIndex } from "../lib/dates";
import { UPLOAD_DIR } from "../lib/photos";

const sharp = sharpDefault ?? createRequire(import.meta.url)("sharp");

async function main() {
  const s = getSettings();
  const wk = weekIndex(s.startDate, todayISO());

  for (const row of db.select().from(photos).all()) {
    const abs = path.join(UPLOAD_DIR, row.path);
    if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
  }
  db.delete(photos).run();

  const angles = ["front", "side", "back", "side_flexed"] as const;
  let n = 0;

  for (const [offset, hue, rx] of [
    [8, 10, 150],
    [4, 200, 128],
    [0, 150, 104],
  ] as const) {
    const w = Math.max(0, wk - offset);
    const date = addDays(s.startDate, w * 7);
    for (const a of angles) {
      const svg = Buffer.from(
        `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800'>
           <rect width='100%' height='100%' fill='hsl(${hue} 28% 16%)'/>
           <ellipse cx='300' cy='340' rx='${rx}' ry='230' fill='hsl(${hue} 42% 36%)'/>
           <text x='300' y='740' font-size='46' fill='#EDEBE8' text-anchor='middle'
                 font-family='sans-serif'>WK ${w + 1}</text>
         </svg>`,
      );
      const rel = path.posix.join("suit", date, `seed-${w}-${a}.png`);
      const abs = path.join(UPLOAD_DIR, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      await sharp(svg).png().toFile(abs);
      db.insert(photos).values({ date, weekIndex: w, angle: a, path: rel }).run();
      n++;
    }
  }

  console.log(`Seeded ${n} suit photos across 3 weeks. Current week: ${wk}.`);
}

void main();
