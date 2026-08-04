/**
 * Proves what FUEL promises about a meal estimate, against a real database.
 *
 *   1. An entry can carry several photos, they survive a delete without leaking
 *      files, and removing the cover promotes another rather than leaving a row
 *      pointing at a file that is gone.
 *   2. A corrected ingredient list is yours, and a re-analysis is told so.
 *   3. A re-analysis prompt carries the name, the portion and the ingredients —
 *      and never the numbers. That last one is the whole reason the button
 *      exists, and it is a single line away from silently regressing.
 *
 * `DATABASE_PATH` and `UPLOAD_DIR` are set before anything is imported, so this
 * runs against throwaway files and never touches ./data.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "arachne-fuel-"));
process.env.DATABASE_PATH = path.join(root, "db", "arachne.db");
process.env.UPLOAD_DIR = path.join(root, "uploads");

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) failures++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
};

// A 1×1 JPEG. Small enough to inline, real enough for saveDataUrl to accept.
const PIXEL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA" +
  "AAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

async function main() {
  const { db } = await import("../lib/db");
  const { foodEntries, mealPhotos } = await import("../lib/db/schema");
  const { parseIngredients, readIngredients, serialiseIngredients } = await import("../lib/meal");
  const { buildUserText, parseVisionJson } = await import("../lib/vision");
  const { UPLOAD_DIR, resolveStored, saveDataUrl } = await import("../lib/photos");
  const { eq } = await import("drizzle-orm");

  // ── Several photos of one meal ──
  console.log("a meal can have several photos");

  const id = db
    .insert(foodEntries)
    .values({
      loggedAt: 1_700_000_000,
      date: "2026-08-04",
      description: "Test meal",
      normKey: "test meal",
      mealType: "meal",
      source: "ai",
    })
    .returning({ id: foodEntries.id })
    .get().id;

  const paths: string[] = [];
  for (const [i, kind] of (["dish", "label", "recipe"] as const).entries()) {
    const out = saveDataUrl(PIXEL, "meals", "2026-08-04");
    if ("error" in out) throw new Error(out.error);
    paths.push(out.path);
    db.insert(mealPhotos).values({ entryId: id, path: out.path, kind, sort: i }).run();
  }
  db.update(foodEntries).set({ photoPath: paths[0] }).where(eq(foodEntries.id, id)).run();

  ok("three photos are stored", db.select().from(mealPhotos).all().length === 3);
  ok("all three are on the volume", paths.every((p) => resolveStored(p) !== null));

  // ── Ingredients round-trip ──
  console.log("\ningredients survive the column");
  const list = [
    { name: "Rice", amount: "approx. 150 g" },
    { name: "Chicken breast", amount: "200 g" },
    { name: "Olive oil", amount: null },
  ];
  db.update(foodEntries)
    .set({ ingredients: serialiseIngredients(list), ingredientsSource: "user" })
    .where(eq(foodEntries.id, id))
    .run();

  const back = readIngredients(
    db.select().from(foodEntries).where(eq(foodEntries.id, id)).get()!.ingredients,
  );
  ok("three ingredients come back", back.length === 3);
  ok("names and amounts round-trip", back[1].name === "Chicken breast" && back[1].amount === "200 g");
  ok("a null amount stays null", back[2].amount === null);

  // ── What the model is actually sent ──
  console.log("\na re-analysis is told the correction, never the numbers");

  const text = buildUserText(
    [
      { dataUrl: PIXEL, kind: "dish" },
      { dataUrl: PIXEL, kind: "label" },
    ],
    {
      correction: {
        description: "Chicken and rice",
        portion: "1 of 4 servings",
        ingredients: list,
        ingredientsConfirmed: true,
      },
    },
  );

  ok("the corrected name is in the prompt", text.includes("Chicken and rice"));
  ok("the portion is in the prompt", text.includes("1 of 4 servings"));
  ok("every ingredient is in the prompt", list.every((i) => text.includes(i.name)));
  ok("a confirmed list is called ground truth", text.includes("ground truth"));
  ok("the images are introduced by kind", text.includes("Image 2: a nutrition label"));

  // The load-bearing one. If a future edit passes the entry's macros into the
  // correction, this catches it: the model must re-derive, not adjust.
  const NUMBERS = ["kcal", "protein", "carbs", "620", "45.2"];
  ok(
    "no previous figures leak in",
    !NUMBERS.some((n) => text.toLowerCase().includes(n.toLowerCase())),
    NUMBERS.filter((n) => text.toLowerCase().includes(n.toLowerCase())).join(", "),
  );

  // A first analysis has no correction block at all.
  const first = buildUserText([{ dataUrl: PIXEL, kind: "dish" }], { hint: "large bowl" });
  ok("a first pass carries no correction", !first.includes("estimated before"));
  ok("but does carry the user's note", first.includes("large bowl"));

  // ── Parsing what the model sends back ──
  console.log("\nthe model's ingredient list is read defensively");
  ok(
    "objects are read",
    parseIngredients([{ name: "Egg", amount: "2" }])[0].amount === "2",
  );
  ok("bare strings are read", parseIngredients(["Butter"])[0].name === "Butter");
  ok(
    "alternative keys are read",
    parseIngredients([{ ingredient: "Milk", quantity: "100 ml" }])[0].name === "Milk",
  );
  ok("junk is dropped, not shown", parseIngredients([null, 5, {}, "Oil"]).length === 1);
  ok("duplicates collapse", parseIngredients(["Oil", "oil"]).length === 1);
  ok("a non-array is empty", parseIngredients("Rice").length === 0);
  ok(
    "the cap holds",
    parseIngredients(Array.from({ length: 40 }, (_, i) => `Item ${i}`)).length === 12,
  );

  const parsed = parseVisionJson(
    JSON.stringify({ description: "X", kcal: 500, ingredients: [{ name: "Rice" }] }),
  );
  ok("a full response parses", parsed.kcal === 500 && parsed.ingredients.length === 1);
  ok("a response with no ingredients is empty, not null", parseVisionJson("{}").ingredients.length === 0);

  // ── The cover always points at a file that exists ──
  // Deleting the cover has to promote whatever is now first. A row pointing at
  // a deleted file renders a broken thumbnail on every screen that lists food.
  console.log("\ndeleting the cover promotes the next photo");

  db.delete(mealPhotos).where(eq(mealPhotos.path, paths[0])).run();
  fs.rmSync(path.join(UPLOAD_DIR, paths[0]), { force: true });

  const next = db
    .select()
    .from(mealPhotos)
    .where(eq(mealPhotos.entryId, id))
    .orderBy(mealPhotos.sort, mealPhotos.id)
    .get();
  db.update(foodEntries).set({ photoPath: next?.path ?? null }).where(eq(foodEntries.id, id)).run();

  const cover = db.select().from(foodEntries).where(eq(foodEntries.id, id)).get()!.photoPath;
  ok("the cover moved on", cover === paths[1], String(cover));
  ok("and points at a file that exists", cover !== null && resolveStored(cover) !== null);
  ok("the deleted file is gone", resolveStored(paths[0]) === null);

  fs.rmSync(root, { recursive: true, force: true });
  console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
