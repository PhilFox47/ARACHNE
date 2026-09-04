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
    typeof nothing.error === "string" &&
      /no photo and no description|not set|No vision model/i.test(nothing.error),
    nothing.error ?? "",
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

  // ── Both ways to get a photo stay reachable ──
  // `capture` is an attribute of the element, not of the click, so one input
  // cannot offer both — a single input either opens the camera and hides the
  // library, or opens the library and hides the camera. That is the whole
  // reason PhotoSource exists, and the reason a new photo entry point must not
  // hand-roll its own input: it would silently pick one and drop the other.
  console.log("\ncamera and gallery are both reachable");

  const photoSrc = fs.readFileSync(path.join(srcDir, "components/PhotoSource.tsx"), "utf8");
  const inputs = [...photoSrc.matchAll(/<input[\s\S]*?\/>/g)].map((m) => m[0]);
  ok("PhotoSource offers two inputs", inputs.length === 2, `${inputs.length} found`);
  ok("one of them opens the camera", inputs.filter((i) => /capture="environment"/.test(i)).length === 1);
  ok("the other leaves the choice to the browser", inputs.filter((i) => !/capture=/.test(i)).length === 1);

  // `capture` suppresses `multiple`. Writing both would promise a batch the
  // browser will not deliver.
  const cam = inputs.find((i) => /capture=/.test(i)) ?? "";
  ok("the camera input never claims `multiple`", !/multiple/.test(cam));

  // Every FUEL surface goes through the hook rather than its own input.
  for (const rel of ["components/FuelCapture.tsx", "components/FuelEntry.tsx"]) {
    const text = fs.readFileSync(path.join(srcDir, rel), "utf8");
    ok(`${rel} owns no file input of its own`, !/type="file"/.test(text));
    ok(`${rel} goes through PhotoSource`, /usePhotoSource/.test(text));
    // The choice is only worth making if it is remembered — otherwise it is a
    // tap you pay on every single meal.
    ok(`${rel} offers the choice`, /SourceToggle/.test(text) && /useRememberedSource/.test(text));
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

  // ── The morning briefing ──
  // Three things have to hold or the panel at the top of HQ is worse than not
  // being there: it must appear at the right time, it must never be empty
  // because the network was down, and one day must never end up with two of
  // them.
  console.log("\nthe morning briefing");

  const { briefings } = await import("../lib/db/schema");
  const {
    BRIEFING_HOUR,
    briefingDue,
    ensureBriefing,
    gatherFacts,
    localBriefing,
    storedBriefing,
    stripFormatting,
    upgradable,
  } = await import("../lib/briefing");

  const today = todayISO();
  const at = (h: number) => new Date(`${today}T${String(h).padStart(2, "0")}:30:00`);

  // An empty table is the first morning of a run. Withholding the first
  // briefing until 08:00 would show a new user an empty panel and no reason.
  ok("the very first briefing does not wait for 08:00", briefingDue(today, at(6)));

  db.insert(briefings)
    .values({ date: addDays(today, -1), body: "yesterday", source: "local", model: null, createdAt: 1 })
    .run();

  ok(`nothing is due before ${BRIEFING_HOUR}:00`, !briefingDue(today, at(BRIEFING_HOUR - 1)));
  ok(`one is due from ${BRIEFING_HOUR}:00`, briefingDue(today, at(BRIEFING_HOUR)));
  ok("and stays due for the rest of the day", briefingDue(today, at(22)));
  ok("a past date is never due", !briefingDue(addDays(today, -1), at(22)));

  const fresh = Math.floor(Date.now() / 1000);
  const row = (source: "ai" | "local", ageSec: number) =>
    ({ date: today, body: "x", model: null, source, createdAt: fresh - ageSec }) as never;
  ok("the model's own briefing is never rewritten", !upgradable(row("ai", 99999)));
  ok("a fresh local one is left alone", !upgradable(row("local", 300)));
  ok("an older local one may be upgraded", upgradable(row("local", 3600)));

  // The fallback is the whole reason this can be trusted at 08:00 on a train.
  const facts = gatherFacts(today);
  const local = localBriefing(facts);
  const words = local.split(/\s+/).length;
  ok("the fallback says something", local.length > 60, `${words} words`);
  ok("it is not too long to read", words <= 140, `${words} words`);
  ok(
    "it names today's calorie and protein targets",
    local.includes(String(facts.fuel.proteinTargetG)) &&
      local.includes(facts.fuel.kcalTargetToday.toLocaleString("en-GB")),
  );
  ok("it carries no markdown", !/[*#_`]|^\s*[-•]/m.test(local));

  // Two writers, one day.
  //
  // The table is cleared first so this does not depend on the clock: with
  // yesterday's row still present and the suite running before 08:00, nothing
  // is due and both writers correctly do nothing — which is the app behaving
  // and the check failing every morning.
  db.delete(briefings).run();
  await Promise.all([ensureBriefing(today), ensureBriefing(today)]);
  const rowsToday = db.select().from(briefings).all().filter((b) => b.date === today);
  ok("two concurrent writes leave one row", rowsToday.length === 1, `${rowsToday.length} rows`);
  ok("and it is readable", (storedBriefing(today)?.body.length ?? 0) > 60);

  ok(
    "markdown is stripped out of what the model returns",
    stripFormatting("## H\n\n**bold** and *it*\n\n- one\n- two").match(/[*#]|^- /m) === null,
  );

  // The prompt is where the rules live; a rewrite that drops them is silent.
  const briefingSrc = fs.readFileSync(path.join(srcDir, "lib/briefing.ts"), "utf8");
  for (const rule of [
    /never invent/i,
    /no headings, no bullet points/i,
    /PATROL/,
    /REFUEL WEEK/,
    /LOW PROFILE WEEK/,
    /do not give medical advice/i,
    /below the plan's calorie target/i,
  ]) {
    ok(`the prompt still says ${rule.source.slice(0, 34)}`, rule.test(briefingSrc));
  }

  // Every way the model can let you down has to end in a paragraph, not a gap.
  // This is the whole reason the local version exists.
  const { setSetting: setS } = await import("../lib/settings");
  setS("vision_model", "test/model");
  process.env.NANOGPT_API_KEY = "test-key";
  const realFetch = globalThis.fetch;
  const reply = (c: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content: c } }] }), { status: 200 });

  const failures_: [string, () => Promise<Response>][] = [
    ["an empty answer", async () => reply("")],
    ["a refusal", async () => reply("I cannot help with that.")],
    ["a wall of text", async () => reply("x".repeat(3000))],
    ["an HTTP 500", async () => new Response("nope", { status: 500 })],
    ["malformed JSON", async () => new Response("<html>", { status: 200 })],
    ["a dead network", async () => { throw new Error("ECONNREFUSED"); }],
  ];
  for (const [label, impl] of failures_) {
    db.delete(briefings).run();
    globalThis.fetch = impl as never;
    const r = await ensureBriefing(today);
    ok(`${label} still leaves a briefing`, r !== null && r.source === "local" && r.body.length > 60);
  }

  // The request itself: the configured model, and the key nowhere near the body.
  db.delete(briefings).run();
  let sent: { url: string; body: Record<string, unknown> } | null = null;
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    return reply("A perfectly ordinary briefing, comfortably past the minimum length to be stored.");
  }) as never;
  const wrote = await ensureBriefing(today);
  const req = sent as unknown as { url: string; body: Record<string, unknown> };
  ok("the model's answer is stored as such", wrote?.source === "ai" && wrote.model === "test/model");
  ok("it goes to Nano-GPT", req.url.startsWith("https://nano-gpt.com/api/v1"), req.url);
  ok("the model is the configured one, never hardcoded", req.body.model === "test/model");
  ok(
    "the API key is never in the request body",
    !JSON.stringify(req.body).includes("test-key"),
  );
  globalThis.fetch = realFetch;

  // ── The trainer is allowed to be hard on you ──
  // The whole point of the panel: a briefing that congratulates you on a bad
  // week is worse than no briefing. These check that the criticism is specific
  // — the actual food, the actual movement, the actual day — because vague
  // disapproval is the failure mode and it reads as noise.
  console.log("\nthe trainer criticises specifically");

  const { sessionPlans, exerciseLogs, sessions: sessTable, weights: wTable } =
    await import("../lib/db/schema");
  db.delete(briefings).run();
  db.delete(foodEntries).run();

  const dayBackISO = (n: number) => addDays(todayISO(), -n);
  const dkOf = (d: string) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(d).getDay()];
  setS("start_date", dayBackISO(40));

  // A blown day: 900 over, and one obvious culprit.
  const bad = dayBackISO(2);
  for (const [desc, kcal, mt] of [
    ["Large takeaway pizza", 1400, "meal"],
    ["Porridge", 400, "meal"],
    ["Chicken and rice", 600, "meal"],
    ["Crisps", 500, "snack"],
  ] as [string, number, "meal" | "snack"][]) {
    db.insert(foodEntries)
      .values({
        loggedAt: 1, date: bad, description: desc, normKey: desc.toLowerCase(),
        kcal, proteinG: 20, mealType: mt, source: "manual",
      })
      .run();
  }

  // A training day where the rows collapsed and the sets were cut short.
  const trainDay = [3, 4, 5, 6, 7].map(dayBackISO).find((d) => ["mon", "tue", "wed", "thu", "fri"].includes(dkOf(d)))!;
  const sid = db
    .insert(sessTable)
    .values({ date: trainDay, dayKey: dkOf(trainDay), phase: 1, completed: true, rpe: 4 })
    .returning({ id: sessTable.id })
    .get().id;
  db.insert(sessionPlans)
    .values({
      date: trainDay, dayKey: dkOf(trainDay), phase: 1, source: "plan", model: null,
      payload: JSON.stringify([
        { key: "incline inverted row", name: "Incline inverted row", sets: 3, metric: "reps", targetReps: 10, targetSeconds: null, targetWeightKg: null },
      ]),
    })
    .run();
  db.insert(exerciseLogs)
    .values({ sessionId: sid, date: trainDay, exerciseKey: "incline inverted row", exerciseName: "Incline inverted row", setIndex: 0, reps: 6 })
    .run();
  db.insert(wTable).values({ date: dayBackISO(1), weightKg: 98 }).run();

  const badFacts = gatherFacts(todayISO());
  ok("the blown day is spotted", badFacts.fuel.overTargetDays.length > 0);
  ok(
    "and the thing that blew it is named",
    badFacts.fuel.overTargetDays[0]?.worstItems[0]?.description === "Large takeaway pizza",
    badFacts.fuel.overTargetDays[0]?.worstItems[0]?.description,
  );
  ok("the collapsed movement is spotted", badFacts.patrol.shortfalls.length > 0);
  const sf = badFacts.patrol.shortfalls[0];
  ok("with what it should have been", sf?.target === 10 && sf?.best === 6, `${sf?.best} vs ${sf?.target}`);
  ok("and the sets it did not finish", sf?.setsDone === 1 && sf?.setsPlanned === 3);
  ok("and the catalogue's own cues to fix it", (sf?.cues.length ?? 0) > 0, sf?.cues.join(", "));

  const badText = localBriefing(badFacts);
  ok("the briefing names the food", /pizza/i.test(badText), badText.slice(0, 90));
  ok("it stays short enough to read", badText.split(/\s+/).length <= 140, `${badText.split(/\s+/).length} words`);

  // The shortfall has to win the ranking to be spoken, and against four missed
  // patrols it rightly does not. Judged on its own, where it is the headline.
  const onlyShortfall = localBriefing({
    ...badFacts,
    patrol: { ...badFacts.patrol, skipped: [], lastSessionDaysAgo: 0 },
    fuel: { ...badFacts.fuel, overTargetDays: [], avgProtein7: badFacts.fuel.proteinTargetG },
  });
  ok("the briefing names the movement", /inverted row/i.test(onlyShortfall), onlyShortfall.slice(0, 90));
  ok("and gives the catalogue's correction", /blades together|chest to the edge/i.test(onlyShortfall));

  // ── A range is a range ──
  // Reported from the phone: "I should do 8–12 squats and do 10, and the next
  // day the trainer says I was two reps short."
  //
  // It was reading `targetReps` — the number the form prefills — as the
  // requirement. That number is one more than last session, and it drops back
  // to the bottom of the range when the weight goes up, so it is a suggestion
  // that walks up through the range. The requirement is the range's floor.
  //
  // Both directions are checked, because the tempting fix is to stop reporting
  // shortfalls on ranged movements at all, which would hide the real ones.
  console.log("\na set inside its range is a set done right");

  db.delete(sessTable).run();
  db.delete(exerciseLogs).run();
  db.delete(sessionPlans).run();

  const gDay = [1, 2, 3, 4, 5].map(dayBackISO).find((d) => ["mon", "tue", "wed", "thu", "fri"].includes(dkOf(d)))!;
  const earlierDay = addDays(gDay, -7);

  /** One movement, one or two sessions of it, straight through gatherFacts. */
  const logRange = (
    plan: { repRange: string | null; targetReps: number },
    days: { date: string; reps: number; weightKg: number | null; sets: number }[],
  ) => {
    db.delete(sessTable).run();
    db.delete(exerciseLogs).run();
    db.delete(sessionPlans).run();
    for (const d of days) {
      db.insert(sessionPlans)
        .values({
          date: d.date, dayKey: dkOf(d.date), phase: 1, source: "plan", model: null,
          payload: JSON.stringify([
            {
              key: "goblet squat", name: "Goblet squat", sets: 3, metric: "reps",
              repRange: plan.repRange, targetReps: plan.targetReps,
              targetSeconds: null, targetWeightKg: 20,
            },
          ]),
        })
        .run();
      const id = db
        .insert(sessTable)
        .values({ date: d.date, dayKey: dkOf(d.date), phase: 1, completed: true, rpe: 4 })
        .returning({ id: sessTable.id })
        .get().id;
      for (let i = 0; i < d.sets; i++) {
        db.insert(exerciseLogs)
          .values({
            sessionId: id, date: d.date, exerciseKey: "goblet squat", exerciseName: "Goblet squat",
            setIndex: i, reps: d.reps, weightKg: d.weightKg,
          })
          .run();
      }
    }
    return gatherFacts(todayISO()).patrol.shortfalls;
  };

  // The reported case, exactly.
  const inside = logRange({ repRange: "8–12", targetReps: 12 }, [{ date: gDay, reps: 10, weightKg: 20, sets: 3 }]);
  ok(
    "10 reps of an 8–12 set is not a shortfall",
    inside.length === 0,
    inside.length ? `flagged: best ${inside[0].best} against ${inside[0].target}` : "clean",
  );
  ok(
    "and the bottom of the range is still inside it",
    logRange({ repRange: "8–12", targetReps: 12 }, [{ date: gDay, reps: 8, weightKg: 20, sets: 3 }]).length === 0,
  );
  ok(
    "nor is drifting from the top of the range to the middle",
    logRange({ repRange: "8–12", targetReps: 11 }, [
      { date: earlierDay, reps: 12, weightKg: 20, sets: 3 },
      { date: gDay, reps: 10, weightKg: 20, sets: 3 },
    ]).length === 0,
  );
  // Double progression's whole mechanism: the weight goes up, the reps reset to
  // the floor. Calling that a bad session tells them to undo what is working.
  ok(
    "and fewer reps under a heavier weight is progression, not a collapse",
    logRange({ repRange: "8–12", targetReps: 8 }, [
      { date: earlierDay, reps: 12, weightKg: 20, sets: 3 },
      { date: gDay, reps: 8, weightKg: 22.5, sets: 3 },
    ]).length === 0,
  );

  // The other direction — none of the above may cost a real miss.
  const under = logRange({ repRange: "8–12", targetReps: 12 }, [{ date: gDay, reps: 6, weightKg: 20, sets: 3 }]);
  ok("but 6 reps is below the range and is still caught", under.length === 1, `${under.length} flagged`);
  ok("judged against the floor, not the prefill", under[0]?.target === 8, `target ${under[0]?.target}`);
  ok("with the range carried through for the wording", under[0]?.range === "8–12", `${under[0]?.range}`);
  const cutShort = logRange({ repRange: "8–12", targetReps: 12 }, [{ date: gDay, reps: 10, weightKg: 20, sets: 1 }]);
  ok("and one set of three is still an abandoned movement", cutShort.length === 1 && cutShort[0].setsDone === 1);

  // A movement with no range keeps the old, correct behaviour.
  const flat = logRange({ repRange: "10", targetReps: 10 }, [
    { date: earlierDay, reps: 12, weightKg: 20, sets: 3 },
    { date: gDay, reps: 10, weightKg: 20, sets: 3 },
  ]);
  ok("a single-target movement still reports going backwards", flat.length === 1, `${flat.length} flagged`);
  ok("and carries no range", flat[0]?.range === null);

  // What the sentence actually reads, since that is what gets seen.
  const said = localBriefing({
    ...gatherFacts(todayISO()),
    feedback: { recent: [], painful: [], hardCount: 0, answered: 0, hardStreak: [] },
    patrol: {
      ...gatherFacts(todayISO()).patrol,
      skipped: [], lastSessionDaysAgo: 0,
      shortfalls: [{
        date: gDay, name: "Goblet squat", metric: "reps", target: 8, range: "8–12",
        best: 6, previousBest: null, setsDone: 3, setsPlanned: 3,
        watch: "Chest tall.", cues: ["Weight at the chest"],
      }],
    },
  });
  ok("the miss is written against the range", /6 against 8–12/.test(said), said.slice(0, 100));

  // ── The card and the trainer read the same set the same way ──
  // Two goals live on a session card: today's range, and the harder bar that
  // banks a session towards THE WEB. The set markers used to answer only the
  // second, so a set of thirteen against 12–15 wore the same grey dot as a set
  // of six — the screen calling a good set a miss, in the same week the trainer
  // was doing it in words.
  //
  // Both now read `lib/prescription`. This is what keeps that worth something:
  // what the card marks in the evening and what the trainer says in the morning
  // have to be the same verdict.
  console.log("\nthe card and the trainer agree on what a set was");

  const { setStanding, workingRange: wr, rangeLabel } = await import("../lib/prescription");
  const r812 = wr("8–12", 12)!;

  const disagree: string[] = [];
  for (const reps of [6, 7, 8, 10, 12, 14]) {
    const trainerFlags =
      logRange({ repRange: "8–12", targetReps: 12 }, [{ date: gDay, reps, weightKg: 20, sets: 3 }]).length > 0;
    const cardSays = setStanding(reps, r812, false);
    if ((cardSays === "short") !== trainerFlags) {
      disagree.push(`${reps}: card "${cardSays}" vs trainer ${trainerFlags ? "shortfall" : "fine"}`);
    }
  }
  ok("every rep count around the range gets one verdict", disagree.length === 0, disagree.join("; "));

  ok("inside the range is marked as done, not short", setStanding(10, r812, false) === "met");
  ok("the bottom of the range is inside it", setStanding(8, r812, false) === "met");
  ok("below the floor is short", setStanding(7, r812, false) === "short");
  ok("clearing the mastery bar is its own tier, above met", setStanding(15, r812, true) === "mastered");
  ok("nothing logged is neither", setStanding(null, r812, false) === "empty");

  // What the card actually prints as the target.
  ok("the target reads as a range", rangeLabel(wr("8–12", null), "reps") === "8–12 reps", `${rangeLabel(wr("8–12", null), "reps")}`);
  ok("in seconds where the movement is timed", rangeLabel(wr("30–45 s", null), "time") === "30–45 s");
  ok("and a single number is not dressed up as a range", rangeLabel(wr("10", null), "reps") === "10 reps");

  db.delete(sessTable).run();
  db.delete(exerciseLogs).run();
  db.delete(sessionPlans).run();

  // Skipped patrols are named, and named as misses.
  db.delete(sessTable).run();
  const skippedFacts = gatherFacts(todayISO());
  if (skippedFacts.patrol.skipped.length > 0) {
    const skipText = localBriefing(skippedFacts);
    ok(
      "a skipped patrol is called a miss, not a rest day",
      /miss|did not happen|days since/i.test(skipText) && !/rest day|well deserved/i.test(skipText),
      skipText.slice(0, 80),
    );
  }

  // And the other direction: a clean week must not have criticism invented for it.
  db.delete(foodEntries).run();
  db.delete(exerciseLogs).run();
  db.delete(sessionPlans).run();
  for (let i = 1; i <= 7; i++) {
    const d = dayBackISO(i);
    for (const [desc, kcal, pro] of [["Breakfast", 500, 45], ["Lunch", 700, 60], ["Dinner", 900, 60]] as [string, number, number][]) {
      db.insert(foodEntries)
        .values({ loggedAt: 1, date: d, description: desc, normKey: desc.toLowerCase(), kcal, proteinG: pro, mealType: "meal", source: "manual" })
        .run();
    }
    if (["mon", "tue", "wed", "thu", "fri"].includes(dkOf(d))) {
      db.insert(sessTable).values({ date: d, dayKey: dkOf(d), phase: 1, completed: true, rpe: 4 }).run();
    }
  }
  const goodFacts = gatherFacts(todayISO());
  ok("a clean week has nothing over target", goodFacts.fuel.overTargetDays.length === 0);
  ok("and nothing skipped", goodFacts.patrol.skipped.length === 0, goodFacts.patrol.skipped.map((s) => s.dayKey).join(","));
  const goodText = localBriefing(goodFacts);
  ok("so the briefing does not invent a problem", !/missed|over at|went backwards/i.test(goodText), goodText.slice(0, 90));

  // The prompt is where the licence to criticise lives.
  for (const rule of [
    /not a cheerleader/i,
    /No praise without evidence/i,
    /name the item/i,
    /skipped a patrol, say so plainly/i,
    /never about them as a person/i,
    /do not shame/i,
  ]) {
    ok(`the prompt still says ${rule.source.slice(0, 32)}`, rule.test(briefingSrc));
  }

  // ── It remembers what it already said ──
  // The complaint: it covered the same ground every morning as though it had
  // never spoken before. The fix is memory, not silence — a point that keeps
  // being true should still resurface, just not ahead of something unsaid.
  console.log("\nthe trainer does not repeat itself");

  const {
    recentBriefings,
    recentTopics,
    RECALL_DAYS,
    // Aliased: lib/vision exports a buildUserText too, and it is already in scope.
    buildUserText: buildBriefingText,
  } = await import("../lib/briefing");

  db.delete(briefings).run();
  for (let i = 1; i <= 20; i++) {
    db.insert(briefings)
      .values({ date: addDays(today, -i), body: `briefing from ${i} days ago`, source: "local", model: null, createdAt: 1 })
      .run();
  }
  db.insert(briefings).values({ date: today, body: "today's own", source: "local", model: null, createdAt: 1 }).run();

  const recalled = recentBriefings(today);
  ok(`it looks back ${RECALL_DAYS} days`, recalled.length === RECALL_DAYS, `${recalled.length}`);
  ok("newest first", recalled[0].date === addDays(today, -1));
  ok("and never reads the day it is writing", !recalled.some((r) => r.date === today));

  // The model has to actually be handed them.
  const withHistory = buildBriefingText(gatherFacts(today), recalled);
  ok("the previous briefings reach the model", withHistory.includes("briefing from 1 days ago"));
  ok("and they are labelled as already said", /ALREADY TOLD THEM/i.test(withHistory));
  ok("with the instruction not to repeat them", /Do not repeat these points/i.test(withHistory));
  ok(
    "a first-ever briefing carries no such section",
    !/ALREADY TOLD THEM/i.test(buildBriefingText(gatherFacts(today), [])),
  );

  // Topic detection, including the one that bit: the closing line names the
  // protein target every single day, so a bare /protein/ flagged it forever.
  const asRow = (body: string) => ({ date: today, body, source: "local" as const, model: null, createdAt: 1 });
  ok(
    "the closing line's protein target is not a protein observation",
    !recentTopics([asRow("Today is Push & Core — 3 rounds. 2,300 kcal and 160 g of protein.")]).has("protein"),
  );
  ok(
    "but a real protein observation is",
    (recentTopics([asRow("Protein is averaging 118 g against 160 g.")]).get("protein") ?? 0) > 0,
  );

  // What a topic costs is graded by recency and accumulated across mornings.
  // Both halves are load-bearing: without grading the penalty saturates after
  // two days and the order collapses back to raw severity, and without
  // accumulation a topic dropped for one morning comes straight back the next.
  const missed = asRow("2 patrols missed this week.");
  const filler = asRow("Average is up 0.3 kg.");
  const cost = (rows: typeof missed[]) => recentTopics(rows).get("skipped") ?? 0;
  ok("yesterday costs a topic more than the day before", cost([missed, filler]) > cost([filler, missed]));
  ok("being said twice costs more than once", cost([missed, missed]) > cost([missed, filler]));
  ok(
    "but repetition fatigue has a ceiling",
    cost([missed, missed, missed, missed]) < cost([missed]) * 4,
    `${cost([missed, missed, missed, missed])} for four mornings, ${cost([missed])} for one`,
  );
  ok("and a fortnight ago is not repeating yourself", cost([filler, filler, filler, filler, missed]) === 0);
  ok(
    "a named movement is remembered as its own topic",
    recentTopics([asRow("Incline inverted row: 6 against 10.")]).has("shortfall:Incline inverted row"),
  );

  // And the behaviour that matters. Two properties, not one paragraph count:
  // no morning reads like the one before it, and nothing true stays unsaid.
  //
  // Counting distinct paragraphs was the wrong bar. This fixture holds five
  // observations and the paragraph has three slots, one of them pinned to the
  // worst finding — so the two that rotate can only ever draw from four, and
  // an A-B-A-B alternation is arithmetic rather than a fault. What would be a
  // fault is a topic that is true every day and never once reaches the page,
  // which is exactly what pure severity ordering does: it would print the
  // overshoot, the skipped patrol and the shortfall every morning for a year
  // and never mention protein or the weight trend at all.
  db.delete(briefings).run();
  const richFacts = {
    ...gatherFacts(today),
    // No pain in this one on purpose. Pain is the headline whenever it exists
    // and never rotates, which is correct and is checked on its own further
    // down — leaving it in here would make this test measure that instead.
    feedback: { recent: [], painful: [], hardCount: 0 },
    vitals: { ...gatherFacts(today).vitals, avg7: 98.2, avg7LastWeek: 97.9, daysSinceWeighIn: 0 },
    fuel: {
      ...gatherFacts(today).fuel,
      daysLogged7: 6, avgProtein7: 118, proteinDaysMet7: 1,
      overTargetDays: [{ date: addDays(today, -3), kcal: 2900, target: 2300, overBy: 600,
        worstItems: [{ description: "Takeaway curry", kcal: 1100, mealType: "meal" }] }],
    },
    patrol: {
      ...gatherFacts(today).patrol,
      skipped: [{ date: addDays(today, -4), dayKey: "thu", title: "Conditioning", started: false }],
      shortfalls: [{ date: addDays(today, -2), name: "Incline inverted row", metric: "reps",
        target: 10, best: 6, previousBest: 10, setsDone: 3, setsPlanned: 3,
        watch: "Hips stay up.", cues: ["Blades together"] }],
    },
  };
  const mornings: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = addDays(today, -i);
    const body = localBriefing(richFacts, recentBriefings(d));
    db.insert(briefings).values({ date: d, body, source: "local", model: null, createdAt: 1 }).run();
    mornings.push(body);
  }
  ok(
    "no morning repeats the one before it",
    mornings.every((m, i) => i === 0 || m !== mornings[i - 1]),
    `${new Set(mornings).size} distinct of ${mornings.length}`,
  );
  const unsaid = (
    [
      ["the overshoot", /600 kcal over|takeaway curry/i],
      ["the skipped patrol", /did not happen/i],
      ["the shortfall", /incline inverted row/i],
      ["protein", /protein is averaging/i],
      ["the weight trend", /average is up/i],
    ] as [string, RegExp][]
  )
    .filter(([, sign]) => !mornings.some((m) => sign.test(m)))
    .map(([name]) => name);
  ok("and nothing true goes unsaid across four of them", unsaid.length === 0, unsaid.join(", "));
  ok(
    "the worst thing is never silenced by the rotation",
    mornings.every((m) => /curry|missed|did not happen|inverted row/i.test(m)),
  );

  for (const rule of [
    /DO NOT REPEAT YOURSELF/,
    /WHEN REPEATING IS RIGHT/,
    /getting worse rather than staying the same/i,
    /amnesia, not emphasis/i,
  ]) {
    ok(`the prompt still says ${rule.source.slice(0, 34)}`, rule.test(briefingSrc));
  }

  // ── MAINTENANCE ──
  // Two rules carry the whole feature. Nothing stores "done", so a new day
  // resets itself; and nothing can be missed before it existed, so adding a
  // chore never makes last month retroactively a failure.
  console.log("\nMAINTENANCE");

  const { chores: choreTbl, choreLog: choreLogTbl } = await import("../lib/db/schema");
  const {
    malusFor, standingsFor, liveOn, liveForWeek,
    MALUS_CAP, DAILY_MALUS, WEEKLY_MALUS, SEED_CHORES,
  } = await import("../lib/chores");
  const { mondayOf } = await import("../lib/dates");

  db.delete(choreTbl).run();
  db.delete(choreLogTbl).run();

  const long = addDays(today, -30);
  const mk = (name: string, cadence: "daily" | "weekly", createdOn = long, archivedOn: string | null = null) =>
    db.insert(choreTbl).values({ name, cadence, sort: 0, createdOn, archivedOn })
      .returning({ id: choreTbl.id }).get().id;

  const teeth = mk("Teeth", "daily");
  const desk = mk("Desk", "daily");
  const wash = mk("Laundry", "weekly");
  const vac = mk("Vacuum", "weekly");
  const rows = () =>
    db.select({
      id: choreTbl.id, name: choreTbl.name, cadence: choreTbl.cadence,
      sort: choreTbl.sort, createdOn: choreTbl.createdOn, archivedOn: choreTbl.archivedOn,
    }).from(choreTbl).all();
  const logs = () => db.select({ choreId: choreLogTbl.choreId, date: choreLogTbl.date }).from(choreLogTbl).all();
  const tick = (id: number, date: string) =>
    db.insert(choreLogTbl).values({ choreId: id, date }).onConflictDoNothing().run();

  ok("the seed list has both cadences", SEED_CHORES.some((c) => c.cadence === "daily") && SEED_CHORES.some((c) => c.cadence === "weekly"));

  // Nothing done at all: 2 daily + 2 weekly = 20% + 40% = 60%, capped.
  let m = malusFor(today, rows(), logs());
  ok("every daily missed yesterday counts", m.missedDaily.length === 2, m.missedDaily.join(", "));
  ok("every weekly missed last week counts", m.missedWeekly.length === 2, m.missedWeekly.join(", "));
  ok(
    "and the arithmetic is the stated rule",
    Math.abs(m.uncapped - (2 * DAILY_MALUS + 2 * WEEKLY_MALUS)) < 1e-9,
    `${m.uncapped}`,
  );
  ok("capped where it should be", m.fraction === MALUS_CAP && m.capped, `${m.fraction}`);

  // Clearing yesterday and last week lifts it entirely.
  const yest = addDays(today, -1);
  const lastMon = addDays(mondayOf(today), -7);
  tick(teeth, yest); tick(desk, yest);
  tick(wash, addDays(lastMon, 2)); tick(vac, addDays(lastMon, 5));
  m = malusFor(today, rows(), logs());
  ok("a cleared yesterday means no malus today", m.fraction === 0, `${m.fraction}`);
  ok("a weekly done on any day of the week counts", m.missedWeekly.length === 0);

  // One missed daily is exactly one step.
  db.delete(choreLogTbl).where(eq(choreLogTbl.choreId, desk)).run();
  m = malusFor(today, rows(), logs());
  ok("one missed daily is one step", Math.abs(m.fraction - DAILY_MALUS) < 1e-9, `${m.fraction}`);
  ok("and it names which one", m.missedDaily.join() === "Desk", m.missedDaily.join());

  // Nothing can be missed before it existed.
  const plants = mk("Water the plants", "daily", today);
  m = malusFor(today, rows(), logs());
  ok(
    "a chore added today is not missed yesterday",
    !m.missedDaily.includes("Water the plants"),
    m.missedDaily.join(", "),
  );
  ok("but it is due today", standingsFor(today, rows(), logs()).daily.some((s) => s.chore.id === plants));
  ok("liveOn is false before it existed", !liveOn(rows().find((c) => c.id === plants)!, yest));

  // A weekly chore added mid-week shows this week but cannot be missed for it.
  const midweek = mk("Bins", "weekly", today);
  const mwRow = rows().find((c) => c.id === midweek)!;
  ok("a mid-week weekly is still tickable this week", standingsFor(today, rows(), logs()).weekly.some((s) => s.chore.id === midweek));
  ok(
    "but does not count for a week it did not start",
    mondayOf(today) === today || !liveForWeek(mwRow, mondayOf(today)),
  );

  // Archiving stops the count without erasing the history.
  db.update(choreTbl).set({ archivedOn: today }).where(eq(choreTbl.id, desk)).run();
  m = malusFor(today, rows(), logs());
  ok("an archived chore leaves today's list", !standingsFor(today, rows(), logs()).daily.some((s) => s.chore.id === desk));
  ok(
    "but retiring one does not wipe a penalty it already earned",
    m.missedDaily.includes("Desk"),
    m.missedDaily.join(", "),
  );
  db.update(choreTbl).set({ archivedOn: addDays(today, -3) }).where(eq(choreTbl.id, desk)).run();
  ok(
    "and once it has been gone a while it stops counting entirely",
    !malusFor(today, rows(), logs()).missedDaily.includes("Desk"),
  );
  ok("while its history is still there", logs().some((l) => l.choreId === teeth));

  // The malus reaches the ledger, and only the day-attributable half of it.
  const { computeGameState } = await import("../lib/game");
  const baseInput = {
    startDate: addDays(today, -30), today,
    weights: [{ date: yest, weightKg: 98 }],
    sessions: [{ date: yest, dayKey: "mon", completed: true, rpe: 4, note: null }],
    food: [], trials: [{ date: yest, monthIndex: 1, score: 70, pullupsReps: 3 }],
    photos: [], measurements: [], abilities: [], sets: [{ date: yest }],
    water: [], waterTargetMl: 2000,
  };
  const withChores = computeGameState({ ...baseInput, chores: rows(), choreLog: [] } as never);
  const without = computeGameState({ ...baseInput, chores: [], choreLog: [] } as never);
  const rowOf = (s: typeof withChores, k: string) => s.ledger.find((r) => r.key === k)?.xp ?? 0;
  ok("the malus reaches the ledger as its own row", rowOf(withChores, "maintenance") < 0, `${rowOf(withChores, "maintenance")}`);
  ok("no chores means no row", rowOf(without, "maintenance") === 0);
  ok(
    "THE TRIAL is never reduced",
    rowOf(withChores, "trials") === rowOf(without, "trials") && rowOf(withChores, "trials") > 0,
  );
  ok(
    "and the malus never turns the decay into a reward",
    rowOf(withChores, "decay") === rowOf(without, "decay"),
  );

  db.delete(choreTbl).run();
  db.delete(choreLogTbl).run();

  // ── The trainer's blind spots ──
  // Five things it could not see. The first is the one that mattered for
  // safety: it could read that your rows collapsed and could not read that you
  // had told the app your shoulder hurt, so a coach told to push had every
  // reason to push on exactly the day it should have said stop.
  console.log("\nthe trainer can see the rest of the app");

  const { movementFeedback, measurements: measTbl, trials: trialTbl } = await import("../lib/db/schema");
  db.delete(sessTable).run();
  db.delete(exerciseLogs).run();
  db.delete(movementFeedback).run();
  db.delete(measTbl).run();
  db.delete(trialTbl).run();
  setS("start_date", addDays(today, -60));

  const painDay = addDays(today, -2);
  db.insert(movementFeedback).values({ date: painDay, exerciseKey: "incline inverted row", verdict: "pain" }).run();
  db.insert(movementFeedback).values({ date: addDays(today, -5), exerciseKey: "incline inverted row", verdict: "pain" }).run();
  db.insert(movementFeedback).values({ date: addDays(today, -3), exerciseKey: "wall push-up", verdict: "hard" }).run();
  db.insert(measTbl).values({ date: addDays(today, -45), waistCm: 108 }).run();
  db.insert(measTbl).values({ date: addDays(today, -3), waistCm: 104 }).run();
  db.insert(trialTbl).values({ date: addDays(today, -20), monthIndex: 1, score: 210 }).run();
  const noteDay = [1, 2, 3, 4].map((i) => addDays(today, -i)).find((d) => dkOf(d) !== "sat" && dkOf(d) !== "sun")!;
  db.insert(sessTable)
    .values({ date: noteDay, dayKey: dkOf(noteDay), phase: 1, completed: true, rpe: 4, note: "Slept about four hours" })
    .run();

  const seen = gatherFacts(today);

  ok("pain is visible at all", seen.feedback.painful.length > 0, JSON.stringify(seen.feedback.painful));
  ok("with the movement named", seen.feedback.painful[0]?.movement === "Incline inverted row", seen.feedback.painful[0]?.movement);
  ok("and how often it has happened", seen.feedback.painful[0]?.times === 2);
  ok("'hard' is counted separately from pain", seen.feedback.hardCount === 1 && seen.feedback.painful.length === 1);
  ok("and it comes with a denominator", seen.feedback.answered === 3, `${seen.feedback.hardCount} of ${seen.feedback.answered}`);

  // The reason for asking every session rather than once: a run of "hard" on
  // one movement is a load that is not being absorbed, and it is invisible if
  // the question is only ever asked the first time.
  db.delete(movementFeedback).run();
  // Newest first: three hard sessions running, with an easier one behind them.
  const runOfHard = ["hard", "hard", "hard", "controlled"] as const;
  runOfHard.forEach((verdict, i) => {
    db.insert(movementFeedback).values({ date: addDays(today, -(i + 1)), exerciseKey: "box squat", verdict }).run();
  });
  // One hard session on its own is training working, not a problem.
  db.insert(movementFeedback).values({ date: addDays(today, -1), exerciseKey: "wall push-up", verdict: "hard" }).run();

  const streaks = gatherFacts(today).feedback.hardStreak;
  ok("a run of hard sessions on one movement is seen", streaks.length === 1, JSON.stringify(streaks));
  ok("with the movement named and the run counted", streaks[0]?.movement === "Box squat" && streaks[0]?.sessions === 3,
    `${streaks[0]?.movement} ×${streaks[0]?.sessions}`);
  ok("a single hard session is not a streak", !streaks.some((s) => s.movement === "Wall push-up"));

  // And the run has to be the current one. A movement that was hard three
  // times and came back controlled is one you are winning; reporting that as
  // a streak would say the opposite of what happened.
  db.insert(movementFeedback).values({ date: today, exerciseKey: "box squat", verdict: "controlled" }).run();
  ok(
    "a movement that came back controlled has no streak left",
    gatherFacts(today).feedback.hardStreak.length === 0,
    JSON.stringify(gatherFacts(today).feedback.hardStreak),
  );

  const streakSaid = localBriefing(
    { ...gatherFacts(today), feedback: { recent: [], painful: [], hardCount: 4, answered: 6,
      hardStreak: [{ movement: "Box squat", sessions: 3 }] } },
    [],
  );
  ok("the streak is spoken, not just carried", /box squat has come back hard/i.test(streakSaid), streakSaid.slice(0, 110));
  ok("and it says hold the load rather than add to it", /hold the load/i.test(streakSaid));
  ok(
    "the rotation can tell a hard streak from a shortfall on the same movement",
    recentTopics([asRow("Box squat has come back hard 3 times in a row.")]).has("hard:Box squat") &&
      !recentTopics([asRow("Box squat has come back hard 3 times in a row.")]).has("shortfall:Box squat"),
  );

  ok("the session note reaches the trainer", seen.patrol.last7.some((s) => s.note?.includes("four hours")), seen.patrol.last7.map((s) => s.note).join("|"));

  ok("the tape is visible", seen.measurements.latest?.waistCm === 104, `${seen.measurements.latest?.waistCm}`);
  ok("with the change over time", seen.measurements.waistDeltaCm === -4, `${seen.measurements.waistDeltaCm}`);
  ok("THE TRIAL is visible", seen.milestones.trialsRun === 1 && seen.milestones.lastTrial?.score === 210);
  ok("THE WEB is reachable", Array.isArray(seen.web.nearMastery));

  // Pain outranks everything, including a week of missed patrols and a blown day.
  const loud = {
    ...seen,
    patrol: {
      ...seen.patrol,
      skipped: [1, 2, 3].map((i) => ({ date: addDays(today, -i), dayKey: "mon", title: "Push & Core", started: false })),
    },
    fuel: {
      ...seen.fuel,
      overTargetDays: [{ date: addDays(today, -1), kcal: 3400, target: 2300, overBy: 1100,
        worstItems: [{ description: "Takeaway", kcal: 1500, mealType: "meal" }] }],
    },
  };
  const loudText = localBriefing(loud, []);
  ok(
    "pain leads the briefing even against missed patrols and a blown day",
    /painful/i.test(loudText.split(".")[0] + "."),
    loudText.slice(0, 110),
  );
  ok(
    "and it says to back off rather than push",
    /leave it out|drop to the rung|easier version/i.test(loudText),
  );
  ok(
    "it never tells you to push through a painful movement",
    !/push through|work through the pain|harder on/i.test(loudText),
  );

  // The two wordings that would otherwise be nonsense. Everything louder is
  // quieted first — asserting the absence of a bad string in a paragraph that
  // never mentioned the subject would pass for the wrong reason.
  const quiet = {
    ...seen,
    feedback: { recent: [], painful: [], hardCount: 0 },
    fuel: { ...seen.fuel, daysLogged7: 7, avgProtein7: 200, proteinDaysMet7: 7, overTargetDays: [] },
    measurements: { ...seen.measurements, waistDeltaCm: null, daysSinceLast: 1 },
    patrol: { ...seen.patrol, skipped: [], shortfalls: [], lastSessionDaysAgo: 0, doneThisWeek: 2 },
    maintenance: { ...seen.maintenance, malusPct: 0, outstandingThisWeek: [] },
  };

  const over100 = localBriefing(
    { ...quiet, composition: { fatDeltaKg: -2, leanDeltaKg: 0.4, fatSharePct: 125, spanDays: 30 } },
    [],
  );
  ok("the composition line is actually spoken", /lean mass/i.test(over100), over100.slice(0, 120));
  ok("and a fat share over 100% is described, never printed", !/125%/.test(over100));

  const banked = localBriefing(
    {
      ...quiet,
      composition: null,
      web: {
        ...quiet.web,
        nearMastery: [{ movement: "Incline inverted row", cleanSessions: 3, needSessions: 3, cleanWeeks: 1, needWeeks: 2 }],
      },
    },
    [],
  );
  ok("the mastery line is actually spoken", /Incline inverted row/.test(banked), banked.slice(0, 120));
  ok(
    "sessions banked but weeks short says so, not '0 sessions from mastered'",
    /waiting on the calendar/.test(banked) && !/0 clean sessions/.test(banked),
  );

  for (const rule of [
    /PAIN OVERRIDES EVERYTHING/,
    /Do not tell someone to work harder on a movement they have reported pain on/i,
    /patrol\.last7 carries their own note/i,
    /never ignore one that explains a shortfall/i,
    /waistDeltaCm is the honest progress number/i,
    /web\.nearMastery/,
    /feedback\.hardStreak/,
    /Never respond to a hard streak by telling them to push harder/i,
    /Read hardCount against feedback\.answered/i,
    /MOST SETS ARE A RANGE, AND ANYWHERE INSIDE IT IS A PASS/,
    /never compute a gap against the top of a range/i,
    /Only what falls below the bottom is a shortfall/i,
  ]) {
    ok(`the prompt still says ${rule.source.slice(0, 36)}`, rule.test(briefingSrc));
  }

  // ── The body-fat chart's axis ──
  // The chart this replaced stacked fat and lean mass from zero, so a hundred-
  // kilo body gave an axis running to 110 and a year of work was a band a few
  // pixels thick. Zooming in fixes that and introduces the opposite failure: an
  // axis fitted to the data alone turns a fortnight of hydration noise into a
  // cliff. Both directions are checked here, because both are silent — a wrong
  // axis renders perfectly and simply lies about the slope.
  console.log("\nthe body-fat axis is zoomed but not credulous");

  const { buildComposition: comp } = await import("../lib/stats");
  const { bodyfatDomain, BODYFAT_MIN_SPAN_PCT } = await import("../lib/bodyfat");
  const asWeights = (pcts: number[]) =>
    pcts.map((bodyfatPct, i) => ({ date: addDays(today, -(pcts.length - 1 - i)), weightKg: 98, bodyfatPct }));

  // The fault that started this: a real change has to be visible.
  const real = bodyfatDomain(comp(asWeights([30.4, 30.1, 29.6, 29.2, 28.8, 28.5])));
  ok(
    "a 2-point move is most of the panel, not a twentieth of it",
    (30.4 - 28.5) / (real.max - real.min) > 0.15,
    `${real.min}–${real.max}%`,
  );

  // And the opposite fault: noise must not be promoted to a trend.
  const noise = bodyfatDomain(comp(asWeights([30.2, 30.1, 30.4, 30.2, 30.3, 30.1])));
  ok(
    "a third of a point of wobble is not a cliff",
    noise.max - noise.min >= BODYFAT_MIN_SPAN_PCT,
    `${noise.min}–${noise.max}%`,
  );
  ok(
    "and a flat stretch sits in the middle rather than against an edge",
    30.2 > noise.min + (noise.max - noise.min) * 0.3 && 30.2 < noise.max - (noise.max - noise.min) * 0.3,
  );

  // Nothing may be clipped. A raw reading outside the averaged range is exactly
  // the value a reader needs to see, because it is why the average moved.
  const spiky = comp(asWeights([30.0, 30.1, 34.5, 30.0, 29.9, 29.8]));
  const sd = bodyfatDomain(spiky);
  ok(
    "every reading fits inside the window, raw ones included",
    spiky.every((p) => p.rawPct >= sd.min && p.rawPct <= sd.max && p.bodyfatPct >= sd.min && p.bodyfatPct <= sd.max),
    `${sd.min}–${sd.max}% against a 34.5 spike`,
  );

  // Gridlines that are whole numbers, evenly spaced, at every scale — the axis
  // produced 27 / 29 / 31 / 34 before this, one gap wider than the others.
  const scales: [string, number[]][] = [
    ["a flat fortnight", [30.2, 30.1, 30.3, 30.2]],
    ["two months of work", [30.4, 29.8, 29.1, 28.6, 28.0]],
    ["a full year", [31.3, 28.0, 25.2, 22.4, 19.6, 18.4]],
    ["single figures", [8.4, 8.1, 7.9, 7.6]],
  ];
  for (const [label, pcts] of scales) {
    const d = bodyfatDomain(comp(asWeights(pcts)));
    const gaps = d.ticks.slice(1).map((t, i) => t - d.ticks[i]);
    ok(
      `${label}: whole, evenly spaced gridlines`,
      d.ticks.every((t) => Number.isInteger(t)) && new Set(gaps).size === 1 && d.min >= 0,
      `${d.ticks.join(" / ")}`,
    );
  }

  // Body fat is never negative, so the axis must never offer it.
  const low = bodyfatDomain(comp(asWeights([3.2, 3.0, 2.9])));
  ok("the axis never runs below zero", low.min >= 0, `${low.min}–${low.max}%`);

  fs.rmSync(root, { recursive: true, force: true });
  console.log(failures === 0 ? "\nAll checks hold." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
