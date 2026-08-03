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
  mealType: null,
  confidence: null,
  error: null,
};

/**
 * The locale context is load-bearing, not decoration. Portion inference is
 * where photo estimates go wrong, and a model defaulting to US packaging reads
 * a 500 ml German can as a 12 fl oz one — a 40% error before it has even
 * thought about the contents.
 */
export const SYSTEM_PROMPT = `You estimate nutrition from meal photographs.

CONTEXT: The user lives in Germany. Assume German and wider EU groceries,
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
- Read any German packaging text visible in the photo and use it directly.

Estimate the EU mandatory nutrition declaration for the WHOLE portion shown,
not per 100 g. These are the exact fields on German packaging, so estimate them
the way a Nährwerttabelle states them.

Account for what a photo hides: cooking oil, butter, cream, sugar in sauces,
dressing. These are the usual reason a photo estimate comes in low.

Return ONLY a JSON object. No markdown, no code fences, no commentary.

{
  "description": "short English description of the food",
  "portion": "estimated portion, e.g. '500 ml can' or 'approx. 250 g'",
  "kcal": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "saturated_fat_g": number,
  "sugar_g": number,
  "fiber_g": number,
  "salt_g": number,
  "meal_type": "meal" | "snack",
  "confidence": "low" | "medium" | "high"
}

Every numeric field is grams except kcal. Use null for anything you genuinely
cannot estimate — a null is better than a fabricated number. Set confidence to
"low" when the portion is ambiguous or the food is largely hidden.`;

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

/**
 * Calls the model. Resolves to a VisionResult in every case, including
 * timeouts and 5xx — the caller must never have to catch.
 */
export async function analyseMeal(
  dataUrl: string,
  hint?: string,
  timeoutMs = 25_000,
): Promise<VisionResult & { model: string | null }> {
  const key = apiKey();
  const model = activeVisionModel();

  if (!key) return { ...EMPTY, error: "NANOGPT_API_KEY is not set.", model };
  if (!model) return { ...EMPTY, error: "No vision model selected. Pick one in Settings.", model };

  // The note outranks the image wherever they disagree. A photo cannot show
  // diameter, how much was eaten, or what it was cooked in — if the user has
  // told you, that is ground truth, not a hint to weigh against your own guess.
  const userText = hint?.trim()
    ? `Estimate this meal.\n\nThe user has told you the following about it:\n"${hint.trim()}"\n\n` +
      `Treat that as ground truth. Where it states a size, quantity, portion eaten, ` +
      `preparation or ingredient, use it exactly and do NOT substitute your own visual ` +
      `estimate. Scale every number to the portion actually eaten, not the portion shown.`
    : "Estimate this meal.";

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
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
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
