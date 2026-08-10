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
 *   4. Nothing on the review screen counts an entry that no longer exists. Every
 *      figure is derived from the rows, so deleting one has to move all of them
 *      — including the order of the favourites row, which used to be driven by
 *      a stored counter that only ever went up.
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
  const { SYSTEM_PROMPT, analyseMeal, buildUserText, parseVisionJson } = await import("../lib/vision");
  const { UPLOAD_DIR, resolveStored, saveDataUrl } = await import("../lib/photos");
  const { eq, sql } = await import("drizzle-orm");

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
        hadNumbers: true,
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

  // The same button reads "Analyse this photo" before there are numbers and
  // "Re-analyse" after, and sends the same request either way. Telling a model
  // its estimate was wrong when it has never made one is a small lie.
  const never = buildUserText([{ dataUrl: PIXEL, kind: "dish" }], {
    correction: {
      description: "Chicken and rice",
      portion: null,
      ingredients: [],
      ingredientsConfirmed: false,
      hadNumbers: false,
    },
  });
  ok("an entry that never had numbers is not told it was wrong", !never.includes("estimated before"));
  ok("but its corrected name still reaches the model", never.includes("Chicken and rice"));
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

  // ── A meal with no photo is estimated from the words ──
  // The text field always existed and always produced a row with no numbers.
  // The model can estimate from a description; it was simply never asked. What
  // matters is that it is asked *differently* — half the photo prompt is
  // instructions about reading a plate, and a model told to weigh packaging
  // against what is visible, then given nothing visible, hedges.
  console.log("\na meal with no photo is estimated from the words");

  const { TEXT_SYSTEM_PROMPT } = await import("../lib/vision");

  const textOnly = buildUserText([], { hint: "two slices of Vollkornbrot with butter and cheese" });
  ok("the user turn says there is no photograph", /no photograph/i.test(textOnly));
  ok("and carries what was eaten", /Vollkornbrot/.test(textOnly));
  ok(
    "and asks for the ordinary portion where none is given",
    /ordinary portion/i.test(textOnly),
    textOnly.slice(0, 60),
  );

  ok(
    "the text prompt does not ask the model to read a plate",
    !/plate wins|visible in the photo|menu photo/i.test(TEXT_SYSTEM_PROMPT),
  );
  ok(
    "the photo prompt still does",
    /plate wins/i.test(SYSTEM_PROMPT) && /visible in the photo/i.test(SYSTEM_PROMPT),
  );
  ok(
    "both keep the German grocery context",
    /Magerquark/.test(TEXT_SYSTEM_PROMPT) && /Magerquark/.test(SYSTEM_PROMPT),
  );
  ok(
    "both keep the portion rules — a Nährwerttabelle is per 100 g either way",
    /per 100 g/i.test(TEXT_SYSTEM_PROMPT) && /per 100 g/i.test(SYSTEM_PROMPT),
  );
  ok("and both ask for the same JSON", /"saturated_fat_g"/.test(TEXT_SYSTEM_PROMPT));
  ok(
    "the text prompt tells it not to refuse for want of an image",
    /do not refuse/i.test(TEXT_SYSTEM_PROMPT),
  );

  // No image and no words is the one case with nothing in it.
  const nothing = await analyseMeal([], {});
  ok(
    "nothing at all is refused rather than guessed",
    nothing.error !== undefined && /no photo and no description|not set|No vision model/i.test(nothing.error),
    nothing.error,
  );

  // A photo entry's re-analysis must not gain the text-only framing.
  const withShot = buildUserText([{ dataUrl: "data:image/jpeg;base64,x", kind: "dish" }], {
    hint: "half of it",
  });
  ok("a photo entry is still told to use the images", !/no photograph/i.test(withShot));

  // ── The grouping key follows the description ──
  // The fault this exists for: the analysis route renamed a photographed meal
  // from "Analysing…" to its real name and left `norm_key` alone, so every
  // photo entry ever logged shared one key. The FUEL page lists rows and looked
  // right; the review groups them and reported every snack as four of whichever
  // one it labelled the group with.
  console.log("\nthe grouping key follows the description");

  const { normKeyOf } = await import("../lib/meal");
  const srcDir = path.join(process.cwd());

  ok('"Coffee with oat milk" keys as itself', normKeyOf("Coffee with oat milk") === "coffee with oat milk");
  ok("punctuation and case are stripped", normKeyOf("  Café,  LATTE! ") === "café latte");
  ok("two foods are two keys", normKeyOf("Banana") !== normKeyOf("Handful of almonds"));

  // Any statement that writes `description` must write `normKey` beside it.
  // Grepping is crude and it is exactly the check that would have caught this:
  // the route had one and not the other, and nothing anywhere said so.
  const writers = ["app/fuel/actions.ts", "app/api/analyze-meal/route.ts"];
  for (const rel of writers) {
    const text = fs.readFileSync(path.join(srcDir, rel), "utf8");
    const sets = [...text.matchAll(/\.set\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
    const bad = sets.filter((body) => /(^|\s)description:/.test(body) && !/normKey:/.test(body));
    ok(`${rel} never sets a description without its key`, bad.length === 0, `${bad.length} such update(s)`);

    // And nobody redefines the normalisation locally.
    ok(
      `${rel} uses the shared normaliser`,
      !/replace\(\/\[\^\\p\{L\}/.test(text),
      "found a local copy of the norm regex",
    );
  }

  // ── Nothing counts an entry that is gone ──
  console.log("\nthe review counts rows, not history");

  const { favourites } = await import("../lib/db/schema");
  const { buildFuelStats } = await import("../lib/fuelStats");
  const { setSetting } = await import("../lib/settings");
  const { todayISO, addDays } = await import("../lib/dates");

  setSetting("start_date", addDays(todayISO(), -40));
  db.delete(foodEntries).run();

  const norm = (t: string) =>
    t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

  const snack = (desc: string, dayBack: number) =>
    db
      .insert(foodEntries)
      .values({
        loggedAt: Math.floor(Date.now() / 1000) - dayBack * 86400,
        date: addDays(todayISO(), -dayBack),
        description: desc,
        normKey: norm(desc),
        kcal: 25,
        mealType: "snack",
        source: "manual",
      })
      .returning({ id: foodEntries.id })
      .get().id;

  const coffees: number[] = [];
  for (let i = 0; i < 14; i++) coffees.push(snack("Morning coffee", i));
  for (let i = 0; i < 3; i++) snack("Handful of nuts", i);

  // Both starred. The coffee's stored counter is inflated the way an evening of
  // testing inflates it; the nuts have never been quick-logged.
  db.insert(favourites)
    .values({ normKey: norm("Morning coffee"), label: "Morning coffee", kcal: 25, mealType: "snack", uses: 40 })
    .run();
  db.insert(favourites)
    .values({ normKey: norm("Handful of nuts"), label: "Handful of nuts", kcal: 90, mealType: "snack", uses: 0 })
    .run();

  const counted = (desc: string) =>
    buildFuelStats(30).topSnacks.find((t) => t.description === desc)?.count ?? 0;

  // `listFavourites` is a server action behind an auth guard, so the ordering it
  // performs is reproduced here against the same tables.
  const favouriteOrder = () => {
    const counts = new Map(
      db
        .select({ normKey: foodEntries.normKey, n: sql<number>`COUNT(*)` })
        .from(foodEntries)
        .groupBy(foodEntries.normKey)
        .all()
        .map((r) => [r.normKey, r.n] as const),
    );
    return db
      .select()
      .from(favourites)
      .all()
      .map((f) => ({ ...f, live: counts.get(f.normKey) ?? 0 }))
      .sort((a, b) => b.live - a.live || b.createdAt - a.createdAt)
      .map((f) => f.label);
  };

  ok("fourteen coffees are counted as fourteen", counted("Morning coffee") === 14);
  ok("and the coffee leads the favourites", favouriteOrder()[0] === "Morning coffee");

  for (const id of coffees.slice(2)) db.delete(foodEntries).where(eq(foodEntries.id, id)).run();

  ok(
    "deleting twelve leaves two",
    counted("Morning coffee") === 2,
    `counted ${counted("Morning coffee")}`,
  );
  ok(
    "the nuts now lead the favourites",
    favouriteOrder()[0] === "Handful of nuts",
    favouriteOrder().join(" → "),
  );
  ok(
    "even though the stored counter still says forty",
    db.select().from(favourites).all().find((f) => f.label === "Morning coffee")?.uses === 40,
  );

  fs.rmSync(root, { recursive: true, force: true });
  console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
