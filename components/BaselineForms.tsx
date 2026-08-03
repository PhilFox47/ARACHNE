"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBaselineMeasurements, saveBaselineTest } from "@/app/baseline/actions";
import { MEASUREMENT_FIELDS } from "@/lib/plan";

type Vals = Record<string, string>;

const TEST_FIELDS = [
  { key: "pushupsReps", label: "Push-ups", unit: "max reps", how: "Clean form, chest to a fist's width off the floor." },
  { key: "plankSec", label: "Plank", unit: "max seconds", how: "It ends when the hips drop." },
  { key: "deadhangSec", label: "Dead hang", unit: "max seconds", how: "Doorframe, bar or a branch." },
  { key: "squatHoldSec", label: "Deep squat hold", unit: "max seconds", how: "Heels stay on the floor." },
  { key: "sitReachCm", label: "Sit-and-reach", unit: "cm past toes", how: "Seated, legs straight. Negative if you don't reach them." },
  { key: "walkTest12MinM", label: "12-minute walk", unit: "metres", how: "As far as you can walk or run in 12 minutes." },
] as const;

export function BaselineForms({
  initialTest,
  initialMeas,
  heightCm,
}: {
  initialTest: Record<string, number | null> | null;
  initialMeas: Record<string, number | null> | null;
  heightCm: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [meas, setMeas] = useState<Vals>(() =>
    Object.fromEntries(
      MEASUREMENT_FIELDS.map((f) => [f.key, initialMeas?.[f.key] != null ? String(initialMeas[f.key]) : ""]),
    ),
  );
  const [test, setTest] = useState<Vals>(() =>
    Object.fromEntries(TEST_FIELDS.map((f) => [f.key, initialTest?.[f.key] != null ? String(initialTest[f.key]) : ""])),
  );

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const flash = (m: string) => {
    setToast(m);
    if (navigator.vibrate) navigator.vibrate(10);
    router.refresh();
    setTimeout(() => setToast(null), 2600);
  };

  const saveMeas = () =>
    start(async () => {
      const res = await saveBaselineMeasurements({
        weightKg: num(meas.weightKg),
        waistCm: num(meas.waistCm),
        neckCm: num(meas.neckCm),
        chestCm: num(meas.chestCm),
        thighCm: num(meas.thighCm),
        upperArmCm: num(meas.upperArmCm),
      });
      flash(
        res.bodyfatPct !== null
          ? `Saved. Body fat estimate: ${res.bodyfatPct}%.`
          : "Saved. Waist and neck are both needed for the body-fat estimate.",
      );
    });

  const saveTest = () =>
    start(async () => {
      await saveBaselineTest({
        pushupsReps: num(test.pushupsReps),
        plankSec: num(test.plankSec),
        deadhangSec: num(test.deadhangSec),
        squatHoldSec: num(test.squatHoldSec),
        sitReachCm: num(test.sitReachCm),
        walkTest12MinM: num(test.walkTest12MinM),
      });
      flash("Baseline test saved.");
    });

  return (
    <div className="flex flex-col gap-5">
      {/* ── Day 1 ── */}
      <section className="panel flex flex-col gap-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Day 1 · Measurements</p>
          {initialMeas ? <p className="label-xs text-cobalt-lift">Recorded</p> : null}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Morning, fasted, after the toilet. Waist at navel height, relaxed, breathed out. Upper arm flexed.
          Body fat is estimated from waist and neck at {heightCm} cm.
        </p>

        <div className="flex flex-col gap-3">
          {MEASUREMENT_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              unit={f.unit}
              note={"note" in f ? f.note : undefined}
              value={meas[f.key]}
              onChange={(v) => setMeas((p) => ({ ...p, [f.key]: v }))}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={saveMeas}
          disabled={pending}
          className="tap display border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink disabled:opacity-40"
        >
          Save measurements
        </button>
      </section>

      {/* ── Day 2 ── */}
      <section className="panel flex flex-col gap-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Day 2 · Fitness baseline</p>
          {initialTest ? <p className="label-xs text-cobalt-lift">Recorded</p> : null}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Six tests, straight from the plan. This is the only session in the whole year where going to your
          limit is the point — everything else in these two weeks stops well short.
        </p>

        <div className="flex flex-col gap-3">
          {TEST_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              unit={f.unit}
              note={f.how}
              value={test[f.key]}
              onChange={(v) => setTest((p) => ({ ...p, [f.key]: v }))}
              allowNegative={f.key === "sitReachCm"}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={saveTest}
          disabled={pending}
          className="tap display border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink disabled:opacity-40"
        >
          Save baseline test
        </button>
      </section>

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-sm border border-cobalt bg-panel px-4 py-3 text-center text-sm text-ink"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  unit,
  note,
  value,
  onChange,
  allowNegative,
}: {
  label: string;
  unit: string;
  note?: string;
  value: string;
  onChange: (v: string) => void;
  allowNegative?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{label}</span>
        <span className="label-xs shrink-0">{unit}</span>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={allowNegative ? "text" : "decimal"}
        placeholder="—"
        aria-label={`${label} in ${unit}`}
        className="numeral tap border border-edge bg-panel-2 px-3 text-xl text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
      />
      {note ? <span className="text-xs leading-relaxed text-muted-dim">{note}</span> : null}
    </div>
  );
}
