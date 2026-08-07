"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFavourite,
  addPhoto,
  deleteEntry,
  removeFavourite,
  removePhoto,
  setIngredients,
  updateEntry,
} from "@/app/fuel/actions";
import {
  MAX_INGREDIENTS,
  MAX_PHOTOS,
  PHOTO_KIND_LABEL,
  PHOTO_KIND_SHORT,
  readIngredients,
  type Ingredient,
  type PhotoKind,
} from "@/lib/meal";
import { FavouriteToggle } from "./Favourites";

interface Entry {
  id: number;
  loggedAt: number;
  description: string;
  portion: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  sugarG: number | null;
  fiberG: number | null;
  saltG: number | null;
  ingredients: string | null;
  ingredientsSource: "ai" | "user" | null;
  mealType: "meal" | "snack";
  photoPath: string | null;
  aiConfidence: "low" | "medium" | "high" | null;
  edited: boolean;
  userNote: string | null;
  normKey: string;
}

interface Photo {
  id: number;
  path: string;
  kind: PhotoKind;
}

/** Client-side compression to a 1200px max edge before anything is uploaded. */
async function compress(file: File, maxEdge = 1200, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

/** The EU declaration, in the order German packaging prints it. */
const NUTRIENTS = [
  { key: "kcal", label: "Energy", unit: "kcal", step: 10 },
  { key: "fatG", label: "Fat", unit: "g", step: 0.5 },
  { key: "saturatedFatG", label: "of which saturates", unit: "g", step: 0.5 },
  { key: "carbsG", label: "Carbohydrate", unit: "g", step: 0.5 },
  { key: "sugarG", label: "of which sugars", unit: "g", step: 0.5 },
  { key: "fiberG", label: "Fibre", unit: "g", step: 0.5 },
  { key: "proteinG", label: "Protein", unit: "g", step: 0.5 },
  { key: "saltG", label: "Salt", unit: "g", step: 0.1 },
] as const;

type NutrientKey = (typeof NUTRIENTS)[number]["key"];

const time = (unix: number) =>
  new Date(unix * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const str = (v: number | null) => (v === null ? "" : String(v));

/**
 * Editable, but never required to be edited. Tapping opens the detail; the
 * estimate stands on its own if you leave it alone.
 *
 * Every field of the declaration is editable, not just calories — a correction
 * that can only fix energy leaves the protein target reading off a number you
 * already know is wrong.
 */
export function FuelEntryRow({
  entry,
  photos = [],
  isFavourite,
}: {
  entry: Entry;
  photos?: Photo[];
  isFavourite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const [starred, setStarred] = useState(isFavourite);
  const addRef = useRef<HTMLInputElement>(null);
  const addKind = useRef<PhotoKind>("label");

  // An entry from before multi-photo entries has a cover and no rows.
  const shots: Photo[] =
    photos.length > 0
      ? photos
      : entry.photoPath
        ? [{ id: -1, path: entry.photoPath, kind: "dish" }]
        : [];

  const busy = pending || reading;

  const [desc, setDesc] = useState(entry.description);
  const [portion, setPortion] = useState(entry.portion ?? "");
  const [vals, setVals] = useState<Record<NutrientKey, string>>(() =>
    Object.fromEntries(NUTRIENTS.map((n) => [n.key, str(entry[n.key])])) as Record<NutrientKey, string>,
  );

  const original = Object.fromEntries(NUTRIENTS.map((n) => [n.key, str(entry[n.key])])) as Record<
    NutrientKey,
    string
  >;

  /**
   * Re-seed the form when the server's copy of this entry changes underneath it.
   *
   * The row keeps the fields in state so you can type into them, and state is
   * seeded once at mount — so when an analysis lands while the row is open, the
   * inputs went on showing "Analysing…" and blank macros even though the header
   * above them had already updated. The row then read as having unsaved edits,
   * and saving would have written the placeholder back over the model's answer.
   *
   * Compared during render rather than in an effect, so the corrected values are
   * in the first paint instead of one frame later. Only the fields this form
   * owns are in the signature: toggling favourite or meal type must not reset
   * something you are halfway through typing.
   */
  const serverState = JSON.stringify([
    entry.description,
    entry.portion,
    entry.ingredients,
    ...NUTRIENTS.map((n) => entry[n.key]),
  ]);
  const [items, setItems] = useState<Ingredient[]>(() => readIngredients(entry.ingredients));
  const [seeded, setSeeded] = useState(serverState);
  if (seeded !== serverState) {
    setSeeded(serverState);
    setDesc(entry.description);
    setPortion(entry.portion ?? "");
    setVals(original);
    setItems(readIngredients(entry.ingredients));
  }

  const dirty =
    desc !== entry.description ||
    portion !== (entry.portion ?? "") ||
    NUTRIENTS.some((n) => vals[n.key] !== original[n.key]);

  const num = (v: string): number | null => {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
  };

  const save = () => {
    start(async () => {
      await updateEntry(entry.id, {
        description: desc.trim() || entry.description,
        portion: portion.trim() || null,
        // Manual values are ground truth — the photo correction factor is not
        // applied on top of a number you typed yourself.
        ...(Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(vals[n.key])])) as Record<
          NutrientKey,
          number | null
        >),
      });
      router.refresh();
    });
  };

  const isSnack = entry.mealType === "snack";

  const storedItems = readIngredients(entry.ingredients);
  const itemsDirty = JSON.stringify(items) !== JSON.stringify(storedItems);

  const setItem = (i: number, patch: Partial<Ingredient>) =>
    setItems((p) => p.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  /**
   * Re-runs the estimate from the corrected name, portion and ingredients.
   *
   * Any pending edits are saved first, because the whole point is that the model
   * works from your correction — running it against the stored row while the
   * corrected text is still only in the form would re-derive from the version
   * you just disagreed with.
   */
  const reanalyse = () =>
    start(async () => {
      if (dirty) {
        await updateEntry(entry.id, {
          description: desc.trim() || entry.description,
          portion: portion.trim() || null,
        });
      }
      if (itemsDirty) await setIngredients(entry.id, items);

      setReading(true);
      try {
        await fetch("/api/analyze-meal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entryId: entry.id, reanalyse: true }),
        });
      } catch {
        // The row keeps whatever it had. A failed re-analysis costs nothing.
      }
      setReading(false);
      router.refresh();
    });

  const attach = (file: File, kind: PhotoKind) =>
    start(async () => {
      try {
        await addPhoto(entry.id, await compress(file), kind);
      } catch {
        return;
      }
      router.refresh();
    });

  return (
    <div className={`panel ${isSnack ? "border-l-2 border-l-crimson" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-2.5 text-left"
      >
        {entry.photoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photo/${entry.photoPath}`}
            alt=""
            loading="lazy"
            className="h-14 w-14 shrink-0 border border-edge object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-edge bg-panel-2">
            <span className="label-xs">{isSnack ? "SNK" : "MEAL"}</span>
          </span>
        )}

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {starred ? <span className="shrink-0 text-xs text-crimson">★</span> : null}
            <span className="truncate text-sm text-ink">{entry.description}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="label-xs">{time(entry.loggedAt)}</span>
            {entry.portion ? <span className="label-xs truncate">{entry.portion}</span> : null}
            {entry.aiConfidence === "low" ? <span className="label-xs text-crimson">low conf.</span> : null}
            {entry.edited ? <span className="label-xs text-cobalt-lift">edited</span> : null}
          </span>
        </span>

        <span className="shrink-0 text-right">
          {entry.kcal === null ? (
            <span className="label-xs text-crimson">no numbers</span>
          ) : (
            <span className="numeral text-xl text-ink tabular">{Math.round(entry.kcal)}</span>
          )}
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-edge p-3">
          {entry.userNote ? (
            <p className="border-l-2 border-l-cobalt pl-2.5 text-xs leading-relaxed text-muted">
              You said: {entry.userNote}
            </p>
          ) : null}

          {/* ── Photos ──
              A packet's back is where the numbers actually are. Adding it after
              the fact and re-reading is usually a bigger correction than any
              amount of typing into the fields below. */}
          <div className="flex flex-col gap-2">
            <input
              ref={addRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) attach(f, addKind.current);
              }}
            />
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
              {shots.map((p) => (
                <span key={p.id} className="relative flex shrink-0 flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photo/${p.path}`}
                    alt=""
                    loading="lazy"
                    className="h-20 w-20 border border-edge object-cover"
                  />
                  <span className="label-xs">{PHOTO_KIND_SHORT[p.kind]}</span>
                  {p.id > 0 && shots.length > 1 ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        start(async () => {
                          await removePhoto(p.id);
                          router.refresh();
                        })
                      }
                      aria-label={`Remove ${PHOTO_KIND_LABEL[p.kind]}`}
                      className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center border border-edge bg-base text-xs text-crimson"
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </div>

            {shots.length < MAX_PHOTOS ? (
              <div className="flex flex-wrap gap-2">
                {(["label", "recipe", "dish"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      addKind.current = k;
                      addRef.current?.click();
                    }}
                    className="tap border border-edge px-2.5 py-1 text-xs text-muted disabled:opacity-40"
                  >
                    + {PHOTO_KIND_LABEL[k].toLowerCase()}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className="label-xs" htmlFor={`desc-${entry.id}`}>
              Description
            </label>
            <input
              id={`desc-${entry.id}`}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none focus:border-cobalt"
            />
            <label className="label-xs" htmlFor={`portion-${entry.id}`}>
              Portion
            </label>
            <input
              id={`portion-${entry.id}`}
              value={portion}
              onChange={(e) => setPortion(e.target.value)}
              placeholder="e.g. 500 ml can, approx. 250 g"
              className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
            />
          </div>

          {/* ── The declaration, all of it editable ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="label-xs">Nutrition</p>
              {dirty ? <p className="label-xs text-crimson">Unsaved</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {NUTRIENTS.map((n) => (
                <label key={n.key} className="flex flex-col gap-1">
                  <span className="label-xs leading-tight">{n.label}</span>
                  <span className="flex items-baseline gap-1 border border-edge bg-panel-2 px-2">
                    <input
                      value={vals[n.key]}
                      onChange={(e) => setVals((p) => ({ ...p, [n.key]: e.target.value }))}
                      inputMode="decimal"
                      step={n.step}
                      placeholder="—"
                      aria-label={`${n.label} in ${n.unit}`}
                      className="numeral tap w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-muted-dim"
                    />
                    <span className="label-xs shrink-0">{n.unit}</span>
                  </span>
                </label>
              ))}
            </div>

            <p className="text-xs leading-relaxed text-muted-dim">
              Leave a field empty to clear it. Anything you type here is taken as-is — the photo correction
              factor is only applied to the model&apos;s own estimates.
            </p>
          </div>

          {/* ── Suspected ingredients ──
              Meals only. A snack is one named thing; breaking a coffee into
              water and beans tells you nothing. A plate is several things, and
              which ones is what you can actually correct from memory. */}
          {!isSnack ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="label-xs">Suspected ingredients</p>
                {entry.ingredientsSource === "user" ? (
                  <p className="label-xs text-cobalt-lift">yours</p>
                ) : itemsDirty ? (
                  <p className="label-xs text-crimson">Unsaved</p>
                ) : null}
              </div>

              {items.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-dim">
                  Nothing listed yet. Add what you know went in, then re-analyse — the numbers get
                  worked out from the list rather than from the picture alone.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {items.map((it, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <input
                        value={it.name}
                        onChange={(e) => setItem(i, { name: e.target.value })}
                        aria-label={`Ingredient ${i + 1}`}
                        className="tap min-w-0 flex-[3] border border-edge bg-panel-2 px-2 text-sm text-ink outline-none focus:border-cobalt"
                      />
                      <input
                        value={it.amount ?? ""}
                        onChange={(e) => setItem(i, { amount: e.target.value || null })}
                        placeholder="amount"
                        aria-label={`Amount of ${it.name || `ingredient ${i + 1}`}`}
                        className="tap min-w-0 flex-[2] border border-edge bg-panel-2 px-2 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
                      />
                      <button
                        type="button"
                        onClick={() => setItems((p) => p.filter((_, n) => n !== i))}
                        aria-label={`Remove ${it.name || `ingredient ${i + 1}`}`}
                        className="tap shrink-0 px-1 text-sm text-crimson"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2">
                {items.length < MAX_INGREDIENTS ? (
                  <button
                    type="button"
                    onClick={() => setItems((p) => [...p, { name: "", amount: null }])}
                    className="tap border border-edge px-3 py-1.5 text-xs text-muted"
                  >
                    + Add ingredient
                  </button>
                ) : null}
                {itemsDirty ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        await setIngredients(entry.id, items);
                        router.refresh();
                      })
                    }
                    className="tap border border-cobalt px-3 py-1.5 text-xs text-cobalt-lift disabled:opacity-40"
                  >
                    Save list
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              className="tap display flex-1 border border-crimson bg-crimson px-4 py-2.5 text-xs tracking-widest text-ink disabled:border-edge disabled:bg-transparent disabled:text-muted-dim"
            >
              {pending ? "Saving" : dirty ? "Save changes" : "No changes"}
            </button>
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setDesc(entry.description);
                  setPortion(entry.portion ?? "");
                  setVals(original);
                }}
                className="tap display border border-edge px-4 text-xs tracking-widest text-muted"
              >
                Revert
              </button>
            ) : null}
          </div>

          {/* ── Re-analyse ──
              Deliberately not given the current numbers. The reason to press
              this is that they were wrong, and a model handed its own previous
              answer adjusts it rather than working the problem again. It gets
              the name, the portion, the ingredients and the photos; the figures
              come back derived from those. */}
          {/* An entry with no photo is estimated from its description, so it
              gets this button too. Without that, a meal typed on an evening the
              model was unreachable would sit at "no numbers" forever with no
              way to ask again — which is most of the way to not logging it. */}
          {shots.length > 0 || entry.description.trim().length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-edge pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={reanalyse}
                className="tap display border border-cobalt px-4 py-2.5 text-xs tracking-widest text-cobalt-lift disabled:opacity-40"
              >
                {reading
                  ? "Reading"
                  : entry.kcal === null
                    ? shots.length > 0
                      ? `Analyse ${shots.length > 1 ? `${shots.length} photos` : "this photo"}`
                      : "Estimate from the description"
                    : "Re-analyse"}
              </button>
              <p className="text-xs leading-relaxed text-muted-dim">
                {entry.kcal === null
                  ? shots.length > 0
                    ? "Reads every photo attached above."
                    : "No photo on this one, so it works from the name, the portion and the ingredients. Say more in the name and it gets better."
                  : dirty || itemsDirty
                    ? "Saves your changes first, then works the numbers out again from the name, portion and ingredients — never from the current figures."
                    : "Works the numbers out again from the name, portion and ingredients — never from the current figures, so a bad estimate can't anchor the next one."}
              </p>
            </div>
          ) : null}

          {/* Starred from the entry, because that's the moment you know it's
              worth keeping — and the name and numbers are already in front of
              you to correct first. */}
          <div className="flex items-center justify-between gap-3 border-t border-edge pt-3">
            <FavouriteToggle
              isFavourite={starred}
              pending={busy}
              onToggle={() => {
                const next = !starred;
                setStarred(next);
                if (navigator.vibrate) navigator.vibrate(next ? [10, 30, 14] : 6);
                start(async () => {
                  const res = next
                    ? await addFavourite(entry.id, desc.trim() || entry.description)
                    : await removeFavourite(entry.normKey);
                  if (!res.ok) setStarred(!next);
                  router.refresh();
                });
              }}
            />
            {starred ? (
              <span className="label-xs text-muted-dim">Rename it under Favourites</span>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  await updateEntry(entry.id, { mealType: isSnack ? "meal" : "snack" });
                  router.refresh();
                })
              }
              disabled={busy}
              className="label-xs underline"
            >
              Mark as {isSnack ? "meal" : "snack"}
            </button>
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  await deleteEntry(entry.id);
                  router.refresh();
                })
              }
              disabled={busy}
              className="label-xs text-crimson underline"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
