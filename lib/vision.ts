/**
 * Meal photo → nutrition estimate, via Nano-GPT's OpenAI-compatible endpoint.
 *
 * Two rules govern everything here:
 *   1. The API key never leaves the server.
 *   2. This never blocks an entry. Every failure path returns nulls, not an
 *      error — an entry without numbers beats no entry.
 */

import { activeVisionModel } from "./settings";
import { apiKey, baseUrl } from "./nanogpt";
import { parseIngredients, type Ingredient, type PhotoKind } from "./meal";

export type { Ingredient, PhotoKind } from "./meal";
export {
  MAX_INGREDIENTS,
  MAX_PHOTOS,
  PHOTO_KINDS,
  PHOTO_KIND_LABEL,
  readIngredients,
  serialiseIngredients,
} from "./meal";

export interface VisionResult {
  description: string | null;
  portion: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  sugarG: number | null;
  fiberG: number | null;
  saltG: number | null;
  /** Empty for snacks, and for anything the model would not commit to. */
  ingredients: Ingredient[];
  mealType: "meal" | "snack" | null;
  confidence: "low" | "medium" | "high" | null;
  /** Populated when the call failed. The entry still saves. */
  error: string | null;
}

const EMPTY: VisionResult = {
  description: null,
  portion: null,
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  saturatedFatG: null,
  sugarG: null,
  fiberG: null,
  saltG: null,
  ingredients: [],
  mealType: null,
  confidence: null,
  error: null,
};

/** How each kind is introduced in the prompt. */
const KIND_BRIEF: Record<PhotoKind, string> = {
  dish: "the food itself",
  label: "a nutrition label (Nährwerttabelle) — read the numbers off it and note what quantity they refer to",
  recipe: "a recipe or menu — note how many servings it makes",
  other: "related to this meal",
};

export interface PhotoInput {
  dataUrl: string;
  kind: PhotoKind;
}

/**
 * The locale context is load-bearing, not decoration. Portion inference is
 * where photo estimates go wrong, and a model defaulting to US packaging reads
 * a 500 ml German can as a 12 fl oz one — a 40% error before it has even
 * thought about the contents.
 */
/**
 * Everything that is true whether or not there is a photograph: the German
 * grocery context, the portion rules, the fields, and the JSON shape.
 *
 * Split out so the text-only prompt is the same brief with a different opening
 * rather than a second prompt that drifts. The portion rules in particular are
 * not about photographs at all — "a Nährwerttabelle is per 100 g" is just as
 * wrong to ignore when you typed the label out as when you photographed it.
 */
const PROMPT_CONTEXT = `CONTEXT: The user lives in Germany. Assume German and wider EU groceries,
packaging, brands and portion conventions:
- Metric everywhere. Drinks come in 330 ml / 500 ml cans and 0.5 l / 1 l bottles,
  never fluid ounces.
- Typical pack sizes: Magerquark 250 g or 500 g, yoghurt 150 g or 500 g,
  Skyr 450 g, butter 250 g, a Scheibe of bread roughly 45 g, a Brötchen roughly
  60 g, a Semmel roughly 60 g.
- Common items: Magerquark, Skyr, Quark, Aufschnitt, Wurst, Käsebrot, Brötchen,
  Vollkornbrot, Müsli, Spätzle, Currywurst, Döner, Schnitzel, Bratkartoffeln.
- Restaurant and Lieferdienst portions follow German norms, which are typically
  smaller than American ones.

PORTIONS ARE THE WHOLE JOB. This is where these estimates go wrong, and every
rule below exists because copying a printed number directly is almost always
the wrong answer:

- A Nährwerttabelle states values PER 100 g or PER 100 ml unless it says
  otherwise. Those are NOT the values for the portion. Read the pack size from
  the packaging, work out how much of it was actually eaten, and scale. A
  yoghurt pot whose label reads 62 kcal per 100 g and whose pack says 500 g is
  310 kcal if the whole pot was eaten, not 62.
- Some labels also print a "pro Portion" column. If the stated Portion matches
  what was eaten, use that column directly. If it does not, scale from the
  per-100 g column instead — do not assume the manufacturer's serving is yours.
- A recipe states totals for the WHOLE dish and usually says how many servings
  it makes. Divide by the servings, then adjust for how much of one serving was
  actually eaten. Never report a whole tray of lasagne as one portion.
State in "portion" what you actually scaled to, e.g. "whole 500 g pot",
"1 of 4 servings", "approx. two thirds of a 30 cm pizza". This is the number
everything else is derived from, so it must be explicit.

Estimate the EU mandatory nutrition declaration for the WHOLE portion eaten,
not per 100 g. These are the exact fields on German packaging, so estimate them
the way a Nährwerttabelle states them.

Account for what goes unmentioned: cooking oil, butter, cream, sugar in sauces,
dressing. These are the usual reason an estimate comes in low.

Return ONLY a JSON object. No markdown, no code fences, no commentary.

{
  "description": "short English description of the food",
  "portion": "what you scaled to, e.g. 'whole 500 g pot' or '1 of 4 servings'",
  "kcal": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "saturated_fat_g": number,
  "sugar_g": number,
  "fiber_g": number,
  "salt_g": number,
  "ingredients": [{ "name": "string", "amount": "string or null" }],
  "meal_type": "meal" | "snack",
  "confidence": "low" | "medium" | "high"
}

INGREDIENTS: list what you believe went into it, biggest contributor first, at
most 12. Amounts in ordinary words for the portion eaten — "2 eggs", "approx.
150 g", "a splash" — not grams to a decimal place you do not have. Include the
things that go unmentioned and a person forgets: the oil it was fried in, the
butter on the bread, the dressing. Return an empty array for a snack or a single
packaged item, where a breakdown says nothing the description does not.

Every numeric field is grams except kcal. Use null for anything you genuinely
cannot estimate — a null is better than a fabricated number. Set confidence to
"low" when the portion is ambiguous or you cannot tell what is in it.`;

export const SYSTEM_PROMPT = `You estimate nutrition from meal photographs.

SEVERAL IMAGES may be attached. They are all of the SAME single meal — a
different angle, the packaging, the label, the recipe. Never add them together
as if they were separate foods. Each is labelled with what it shows; use them
together to arrive at one estimate.

Read any German packaging text visible in the photo and use it directly.
Read the Nährwerttabelle off the label rather than guessing at the dish.
A menu photo tells you what the dish is, not how much of it arrived: use it for
the ingredients and use the plate for the size. When the packaging and the
plate disagree about how much is there, the plate wins — a half-eaten pack is a
half portion.

${PROMPT_CONTEXT}`;

/**
 * The same brief with no photograph in it.
 *
 * Written rather than reusing the photo prompt with the images left off,
 * because half of that prompt is instructions about reading a plate. A model
 * told to weigh the packaging against what is visible, and then given nothing
 * visible, hedges — and a hedged estimate is the one that comes back as a
 * confident 400 kcal for anything.
 *
 * The honest framing is the opposite: there is no photograph, the words are all
 * there is, and where they do not state a size you are to assume the ordinary
 * German portion and say so in "portion" and in a low confidence.
 */
export const TEXT_SYSTEM_PROMPT = `You estimate nutrition from a written description of a meal.

THERE IS NO PHOTOGRAPH. The description is everything you have, and it was
typed from memory — most likely some time after the meal. Do not ask for an
image and do not refuse: an estimate from words is the whole task.

Take the description literally where it is specific. Where it is not:
- If no quantity is given, assume one ordinary German portion of that food and
  say which portion you assumed in "portion".
- If a preparation is not stated, assume the usual one — bread has butter on it,
  vegetables are cooked in some oil, a coffee with milk has a dash.
- Do not inflate for uncertainty and do not round to a comfortable number.
  Estimate what that description most likely was.

Set "confidence" honestly, and it will usually be "low" or "medium" here. A
description with no size in it cannot produce a high-confidence figure, and
saying so is more useful than pretending otherwise.

${PROMPT_CONTEXT}`;

/** Models wrap JSON in fences despite instructions. Strip defensively. */
export function stripFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  // Fall back to the outermost brace pair if the model added prose around it.
  if (!s.startsWith("{")) {
    const open = s.indexOf("{");
    const close = s.lastIndexOf("}");
    if (open !== -1 && close > open) s = s.slice(open, close + 1);
  }
  return s.trim();
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number.parseFloat(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10) / 10;
};

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s.slice(0, 200) : null;
};

/**
 * Field-by-field coercion rather than trusting the shape. A model that returns
 * "about 450" for kcal should yield 450, and one that returns an object should
 * yield null — never an exception.
 */
export function parseVisionJson(raw: string): VisionResult {
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(stripFences(raw));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ...EMPTY, error: "Model returned a non-object." };
    }
    obj = parsed as Record<string, unknown>;
  } catch {
    return { ...EMPTY, error: "Model returned unparseable JSON." };
  }

  const mt = str(obj.meal_type)?.toLowerCase();
  const cf = str(obj.confidence)?.toLowerCase();

  return {
    description: str(obj.description),
    portion: str(obj.portion),
    ingredients: parseIngredients(obj.ingredients),
    kcal: num(obj.kcal),
    proteinG: num(obj.protein_g),
    carbsG: num(obj.carbs_g),
    fatG: num(obj.fat_g),
    saturatedFatG: num(obj.saturated_fat_g),
    sugarG: num(obj.sugar_g),
    fiberG: num(obj.fiber_g),
    saltG: num(obj.salt_g),
    mealType: mt === "meal" || mt === "snack" ? mt : null,
    confidence: cf === "low" || cf === "medium" || cf === "high" ? cf : null,
    error: null,
  };
}

export interface AnalyseOptions {
  /** What the user typed before the model ran. Outranks the images. */
  hint?: string;
  /**
   * A correction to work from, on a re-analysis.
   *
   * Deliberately carries no numbers. The point of re-running is that the last
   * estimate was wrong, and handing a model its own previous answer anchors it
   * — it adjusts rather than re-deriving, and a 900 kcal mistake comes back as
   * 850. Name, portion and ingredients are what you corrected; the numbers are
   * what you want recomputed from them.
   */
  correction?: {
    description: string | null;
    portion: string | null;
    ingredients: Ingredient[];
    ingredientsConfirmed: boolean;
    /**
     * There was a previous estimate to be wrong.
     *
     * The same button reads "Analyse this photo" on an entry that has never had
     * numbers and "Re-analyse" on one that has, and both send the same request.
     * Telling a model its estimate was wrong when it has never made one is a
     * small lie that costs nothing to avoid.
     */
    hadNumbers: boolean;
  };
}

/** The user-turn text. Split out because it is the part worth reading. */
export function buildUserText(photos: PhotoInput[], opts: AnalyseOptions): string {
  const parts: string[] = [];

  parts.push(
    photos.length === 0
      ? "Estimate this meal from the description below. There is no photograph."
      : photos.length > 1
        ? `Estimate this meal. ${photos.length} images are attached, all of the same meal:\n` +
            photos.map((p, i) => `  Image ${i + 1}: ${KIND_BRIEF[p.kind]}`).join("\n")
        : "Estimate this meal.",
  );

  if (opts.hint?.trim()) {
    parts.push(
      photos.length === 0
        ? `What was eaten:\n"${opts.hint.trim()}"\n\n` +
            `That is the whole of the evidence. Take every size, quantity and preparation ` +
            `it states exactly; assume the ordinary portion for anything it leaves out, and ` +
            `state that assumption in "portion".`
        : `The user has told you the following about it:\n"${opts.hint.trim()}"\n\n` +
            `Treat that as ground truth. Where it states a size, quantity, portion eaten, ` +
            `preparation or ingredient, use it exactly and do NOT substitute your own visual ` +
            `estimate. Scale every number to the portion actually eaten, not the portion shown.`,
    );
  }

  const c = opts.correction;
  if (c) {
    const lines: string[] = c.hadNumbers
      ? [
          "This meal has been estimated before and the estimate was wrong.",
          "",
          "You are being given the corrected description of the food and NOT the previous",
          "numbers. Work the energy and macros out again from scratch, from what is below",
          `and from ${photos.length > 0 ? "the images" : "the description"}. Do not try to stay near any figure you might expect.`,
          "",
        ]
      : ["What is known about this meal:", ""];
    if (c.description) lines.push(`Food: ${c.description}`);
    if (c.portion) lines.push(`Portion actually eaten: ${c.portion}`);
    if (c.ingredients.length > 0) {
      lines.push(
        c.ingredientsConfirmed
          ? "Ingredients, confirmed by the user — treat these as ground truth and estimate for exactly this list:"
          : "Ingredients believed to be in it:",
      );
      for (const i of c.ingredients) {
        lines.push(`  - ${i.name}${i.amount ? ` (${i.amount})` : ""}`);
      }
    }
    if (photos.length > 0) {
      lines.push(
        "",
        "Where the images and the text above disagree, the text wins — it is the user's own correction.",
      );
    }
    if (c.ingredientsConfirmed) {
      lines.push(
        "Return the same ingredient list back, unchanged in name, correcting only the amounts if the images clearly contradict them.",
      );
    }
    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n");
}

/**
 * Calls the model. Resolves to a VisionResult in every case, including
 * timeouts and 5xx — the caller must never have to catch.
 */
export async function analyseMeal(
  photos: PhotoInput[],
  opts: AnalyseOptions = {},
  timeoutMs = 40_000,
): Promise<VisionResult & { model: string | null }> {
  const key = apiKey();
  const model = activeVisionModel();

  if (!key) return { ...EMPTY, error: "NANOGPT_API_KEY is not set.", model };
  if (!model) return { ...EMPTY, error: "No vision model selected. Pick one in Settings.", model };
  // A meal with no photo is estimated from its description instead — that is a
  // supported path, not a degraded one. What cannot be estimated is nothing at
  // all: no image and no words is a request with no content in it.
  const described =
    (opts.hint ?? "").trim().length > 0 || (opts.correction?.description ?? "").trim().length > 0;
  if (photos.length === 0 && !described) {
    return { ...EMPTY, error: "Nothing to read — no photo and no description.", model };
  }

  const userText = buildUserText(photos, opts);

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: "system", content: photos.length > 0 ? SYSTEM_PROMPT : TEXT_SYSTEM_PROMPT },
          {
            role: "user",
            // A plain string when there is nothing to attach. Some models handle
            // a one-element content array containing only text differently from
            // a bare string, and there is no reason to find out which.
            content:
              photos.length > 0
                ? [
                    { type: "text", text: userText },
                    ...photos.map((p) => ({
                      type: "image_url" as const,
                      image_url: { url: p.dataUrl },
                    })),
                  ]
                : userText,
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return { ...EMPTY, error: `Model returned ${res.status}. ${detail}`.trim(), model };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      return { ...EMPTY, error: "Model returned an empty response.", model };
    }

    return { ...parseVisionJson(content), model };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "TimeoutError"
        ? "Model timed out."
        : err instanceof Error
          ? err.message
          : "Unknown error.";
    return { ...EMPTY, error: msg, model };
  }
}
