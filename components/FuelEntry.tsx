"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEntry, updateEntry } from "@/app/fuel/actions";

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
  mealType: "meal" | "snack";
  photoPath: string | null;
  aiConfidence: "low" | "medium" | "high" | null;
  edited: boolean;
  userNote: string | null;
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
export function FuelEntryRow({ entry }: { entry: Entry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [desc, setDesc] = useState(entry.description);
  const [portion, setPortion] = useState(entry.portion ?? "");
  const [vals, setVals] = useState<Record<NutrientKey, string>>(() =>
    Object.fromEntries(NUTRIENTS.map((n) => [n.key, str(entry[n.key])])) as Record<NutrientKey, string>,
  );

  const original = Object.fromEntries(NUTRIENTS.map((n) => [n.key, str(entry[n.key])])) as Record<
    NutrientKey,
    string
  >;
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
          <span className="truncate text-sm text-ink">{entry.description}</span>
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

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
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

          {entry.photoPath && entry.kcal === null ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await fetch("/api/analyze-meal", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ entryId: entry.id, hint: desc.trim() || undefined }),
                  });
                  router.refresh();
                })
              }
              className="tap display border border-cobalt px-4 py-2.5 text-xs tracking-widest text-cobalt-lift disabled:opacity-40"
            >
              {pending ? "Reading" : "Analyse this photo"}
            </button>
          ) : null}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  await updateEntry(entry.id, { mealType: isSnack ? "meal" : "snack" });
                  router.refresh();
                })
              }
              disabled={pending}
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
              disabled={pending}
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
