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
}

const time = (unix: number) =>
  new Date(unix * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Editable, but never required to be edited. Tapping opens the detail; the
 * estimate stands on its own if you leave it alone.
 */
export function FuelEntryRow({ entry }: { entry: Entry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kcal, setKcal] = useState(entry.kcal === null ? "" : String(entry.kcal));
  const [desc, setDesc] = useState(entry.description);

  const save = () => {
    start(async () => {
      await updateEntry(entry.id, {
        description: desc.trim() || entry.description,
        kcal: kcal.trim() === "" ? null : Number(kcal),
      });
      setOpen(false);
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
        <div className="flex flex-col gap-3 border-t border-edge p-3">
          <div className="grid grid-cols-4 gap-x-3 gap-y-2">
            <Detail label="Protein" value={entry.proteinG} unit="g" />
            <Detail label="Carbs" value={entry.carbsG} unit="g" />
            <Detail label="Fat" value={entry.fatG} unit="g" />
            <Detail label="Sat. fat" value={entry.saturatedFatG} unit="g" />
            <Detail label="Sugar" value={entry.sugarG} unit="g" />
            <Detail label="Fibre" value={entry.fiberG} unit="g" />
            <Detail label="Salt" value={entry.saltG} unit="g" />
          </div>

          <div className="flex flex-col gap-2">
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              aria-label="Description"
              className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none focus:border-cobalt"
            />
            <div className="flex gap-2">
              <input
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                inputMode="numeric"
                placeholder="kcal"
                aria-label="Calories"
                className="numeral tap min-w-0 flex-1 border border-edge bg-panel-2 px-3 text-lg text-ink outline-none focus:border-cobalt"
              />
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="tap display border border-crimson bg-crimson px-4 text-xs tracking-widest text-ink disabled:opacity-40"
              >
                Save
              </button>
            </div>
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

function Detail({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="numeral text-base text-ink tabular">
        {value === null ? "—" : `${Math.round(value * 10) / 10}${unit}`}
      </span>
      <span className="label-xs leading-tight">{label}</span>
    </span>
  );
}
