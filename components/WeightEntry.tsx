"use client";

import { useState, useTransition } from "react";
import { logWeight } from "@/app/actions";

/**
 * VITALS entry. Two taps from open to saved: the field is pre-filled with your
 * last reading, so the usual interaction is one nudge and LOG.
 *
 * Deliberately no confirmation dialog and no success screen — the number
 * updating in place is the confirmation.
 *
 * Body fat sits underneath as a second, smaller field. It's optional and stays
 * out of the way until a scale has actually reported one, because a permanently
 * empty box is a permanent reminder that you haven't filled it in.
 */
export function WeightEntry({
  initial,
  bodyfatToday,
  tracksBodyfat,
  loggedToday,
  today,
}: {
  initial: number | null;
  /**
   * Today's reading only. Weight prefills from yesterday because you nudge it
   * to today's figure; a body-fat percentage is read off a display, and
   * prefilling yesterday's would quietly invite you to log it twice.
   */
  bodyfatToday?: number | null;
  /** Whether the scale has ever reported one — decides if the field is shown. */
  tracksBodyfat?: boolean;
  loggedToday: boolean;
  today: string;
}) {
  const [value, setValue] = useState(initial !== null ? initial.toFixed(1) : "");
  const [bf, setBf] = useState(
    bodyfatToday !== null && bodyfatToday !== undefined ? bodyfatToday.toFixed(1) : "",
  );
  const [showBf, setShowBf] = useState(tracksBodyfat === true);
  const [saved, setSaved] = useState(loggedToday);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState(false);
  const [pending, start] = useTransition();

  const nudge = (delta: number) => {
    const base = Number(value);
    const next = (Number.isFinite(base) && value !== "" ? base : (initial ?? 80)) + delta;
    setValue(next.toFixed(1));
    setSaved(false);
    if (navigator.vibrate) navigator.vibrate(6);
  };

  const submit = () => {
    const kg = Number(value);
    if (!Number.isFinite(kg) || value === "") {
      setError("Enter a weight first.");
      return;
    }

    // An empty field means "no reading today", not "wipe the last one" — the
    // action leaves the stored value alone when it gets null.
    let fat: number | null = null;
    if (showBf && bf.trim() !== "") {
      const parsed = Number(bf.replace(",", "."));
      if (!Number.isFinite(parsed)) {
        setError("Body fat should be a percentage, e.g. 27.4.");
        return;
      }
      fat = parsed;
    }

    setError(null);
    start(async () => {
      const res = await logWeight(kg, today, fat);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setSnap(true);
      setTimeout(() => setSnap(false), 320);
      if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
    });
  };

  const lean = (() => {
    const kg = Number(value);
    const pct = Number(bf.replace(",", "."));
    if (!showBf || !Number.isFinite(kg) || !Number.isFinite(pct) || bf.trim() === "") return null;
    if (pct < 3 || pct > 65) return null;
    return { fat: (kg * pct) / 100, lean: kg - (kg * pct) / 100 };
  })();

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">Today&apos;s reading</p>
        {saved ? (
          <p className="label-xs text-cobalt-lift">Logged</p>
        ) : (
          <p className="label-xs text-crimson">Not logged</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-0.1)}
          aria-label="Decrease by 0.1 kg"
          className="tap panel flex items-center justify-center px-4 text-2xl text-muted active:border-crimson active:text-crimson"
        >
          &minus;
        </button>

        <div className="flex flex-1 items-baseline justify-center gap-1">
          <input
            inputMode="decimal"
            type="number"
            step="0.1"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="—"
            aria-label="Weight in kilograms"
            className="numeral w-full min-w-0 bg-transparent text-center text-5xl text-ink outline-none placeholder:text-muted-dim"
            style={snap ? { animation: "snap-scale 320ms cubic-bezier(.34,1.4,.5,1)" } : undefined}
          />
          <span className="label-xs shrink-0">kg</span>
        </div>

        <button
          type="button"
          onClick={() => nudge(0.1)}
          aria-label="Increase by 0.1 kg"
          className="tap panel flex items-center justify-center px-4 text-2xl text-muted active:border-crimson active:text-crimson"
        >
          +
        </button>
      </div>

      {/* ── Body fat, from the scale ── */}
      {showBf ? (
        <div className="flex flex-col gap-2 border-t border-edge pt-3">
          <div className="flex items-center gap-3">
            <label htmlFor="bodyfat" className="label-xs flex-1">
              Body fat
              <span className="ml-1.5 text-muted-dim">from the scale</span>
            </label>
            <span className="flex items-baseline gap-1 border border-edge bg-panel-2 px-3">
              <input
                id="bodyfat"
                inputMode="decimal"
                type="number"
                step="0.1"
                value={bf}
                onChange={(e) => {
                  setBf(e.target.value);
                  setSaved(false);
                }}
                placeholder="—"
                className="numeral tap w-20 min-w-0 bg-transparent text-right text-2xl text-ink outline-none placeholder:text-muted-dim"
              />
              <span className="label-xs shrink-0">%</span>
            </span>
          </div>

          {lean ? (
            <p className="label-xs tabular" aria-live="polite">
              {lean.fat.toFixed(1)} kg fat · {lean.lean.toFixed(1)} kg lean
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-dim">
              Bioimpedance moves several points on hydration alone, so VITALS charts it as a weekly average.
              It will not agree with the tape-measure estimate, and that&apos;s expected.
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowBf(true)}
          className="label-xs self-start underline"
        >
          + Add body fat
        </button>
      )}

      {error ? <p className="text-xs text-crimson">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="tap display w-full border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink transition-opacity active:opacity-70 disabled:opacity-50"
      >
        {pending ? "Logging" : saved ? "Update" : "Log"}
      </button>
    </div>
  );
}
