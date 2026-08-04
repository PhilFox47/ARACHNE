/**
 * The vocabulary a meal entry is described in — photo kinds and ingredients.
 *
 * Separate from `lib/vision.ts` because both the server and the browser need
 * these, and `lib/vision.ts` reaches for the API key and the database the
 * moment it is imported. A client component that wanted the word "label" was
 * pulling `node:crypto` into the browser bundle; this file has no imports at
 * all and never will.
 */

/** What a photo is of. Told to the model, because it changes how it is read. */
export type PhotoKind = "dish" | "label" | "recipe" | "other";

export const PHOTO_KINDS: PhotoKind[] = ["dish", "label", "recipe", "other"];

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  dish: "The food",
  label: "Nutrition label",
  recipe: "Recipe or menu",
  other: "Something else",
};

/** For the caption under an 80px thumbnail, where the full label truncates. */
export const PHOTO_KIND_SHORT: Record<PhotoKind, string> = {
  dish: "Food",
  label: "Label",
  recipe: "Recipe",
  other: "Other",
};

/** One suspected component of a meal. Amounts are words, not grams. */
export interface Ingredient {
  name: string;
  amount: string | null;
}

/**
 * Long enough for a cooked meal, short enough that correcting the list stays a
 * one-minute job rather than data entry.
 */
export const MAX_INGREDIENTS = 12;

/**
 * More than this and the extra angle stops telling the model anything it did
 * not already have, while every image costs latency on a phone connection.
 */
export const MAX_PHOTOS = 5;

/**
 * Accepts what models actually return here, which is not always the shape asked
 * for: a bare array of strings, `{name, amount}`, or `{ingredient, quantity}`.
 * Anything unrecognisable is dropped rather than shown as an empty row.
 */
export function parseIngredients(v: unknown): Ingredient[] {
  if (!Array.isArray(v)) return [];
  const out: Ingredient[] = [];
  const seen = new Set<string>();

  const text = (x: unknown): string | null => {
    if (typeof x !== "string") return null;
    const s = x.trim();
    return s.length > 0 ? s : null;
  };

  for (const item of v) {
    let name: string | null = null;
    let amount: string | null = null;

    if (typeof item === "string") {
      name = text(item);
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      name = text(o.name) ?? text(o.ingredient) ?? text(o.item);
      amount = text(o.amount) ?? text(o.quantity) ?? text(o.qty);
    }

    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: name.slice(0, 80), amount: amount?.slice(0, 40) ?? null });
    if (out.length >= MAX_INGREDIENTS) break;
  }
  return out;
}

/** JSON for the column, or null when there is nothing worth storing. */
export function serialiseIngredients(list: Ingredient[]): string | null {
  return list.length > 0 ? JSON.stringify(list) : null;
}

export function readIngredients(json: string | null): Ingredient[] {
  if (!json) return [];
  try {
    return parseIngredients(JSON.parse(json));
  } catch {
    return [];
  }
}
