"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/app/onboarding/actions";
import {
  MAX_TOTAL_DAYS,
  MEASUREMENT_FIELDS,
  MIN_TOTAL_DAYS,
  PROFILE,
  courseRate,
  navyBodyFat,
  normaliseCourse,
  phasesFor,
  WATER_TARGET_ML_DEFAULT,
  WATER_TARGET_ML_DOCUMENT,
} from "@/lib/plan";
import type { EquipmentItem } from "@/lib/equipment";
import { EquipmentPicker } from "./EquipmentPicker";
import { Mark } from "./Mark";
import { TensionLine } from "./TensionLine";

type Tape = "waistCm" | "neckCm" | "chestCm" | "thighCm" | "upperArmCm";

const TIMEFRAMES = [
  { days: 182, label: "6 months" },
  { days: 273, label: "9 months" },
  { days: 365, label: "12 months" },
  { days: 547, label: "18 months" },
];

const STEPS = ["Brief", "Start", "Measure", "Goal", "Kit"] as const;

const num = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * First run, and every run after a reset.
 *
 * Five screens, one decision each. The alternative — a single long form — asks
 * you to hold "what is my goal weight" and "where do I put the tape measure" in
 * your head at the same time, on a phone, before you have any reason to trust
 * the app.
 *
 * Nothing is written until the last screen, so backing out costs nothing.
 */
export function Onboarding({
  today,
  tomorrow,
  equipment,
  hasHistory,
}: {
  today: string;
  tomorrow: string;
  equipment: EquipmentItem[];
  /** True when a previous run left readings behind — a restart, not a first run. */
  hasHistory: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(today);
  const [heightCm, setHeightCm] = useState(String(PROFILE.heightCm));
  const [weightKg, setWeightKg] = useState("");
  const [bodyfatPct, setBodyfatPct] = useState("");
  const [tape, setTape] = useState<Record<Tape, string>>({
    waistCm: "",
    neckCm: "",
    chestCm: "",
    thighCm: "",
    upperArmCm: "",
  });
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [totalDays, setTotalDays] = useState<number>(PROFILE.totalDays);
  const [waterTargetMl, setWaterTargetMl] = useState(WATER_TARGET_ML_DEFAULT);

  const w = num(weightKg);
  const t = num(targetWeightKg);
  const h = num(heightCm);

  const navy = useMemo(() => {
    const waist = num(tape.waistCm);
    const neck = num(tape.neckCm);
    if (waist === null || neck === null || h === null) return null;
    return navyBodyFat(waist, neck, h);
  }, [tape.waistCm, tape.neckCm, h]);

  const preview = useMemo(() => {
    if (w === null || t === null || t >= w) return null;
    const c = normaliseCourse({ startWeightKg: w, targetWeightKg: t, totalDays });
    return { course: c, phases: phasesFor(c), rate: courseRate(c) };
  }, [w, t, totalDays]);

  const canAdvance = (() => {
    if (step === 1) return h !== null && h >= 120 && h <= 230;
    if (step === 2) return w !== null && w >= 35 && w <= 300;
    if (step === 3) return preview !== null;
    return true;
  })();

  const finish = () => {
    setError(null);
    start(async () => {
      const res = await completeOnboarding({
        startDate,
        heightCm: h ?? PROFILE.heightCm,
        weightKg: w ?? 0,
        bodyfatPct: num(bodyfatPct),
        targetWeightKg: t ?? 0,
        totalDays,
        waistCm: num(tape.waistCm),
        neckCm: num(tape.neckCm),
        chestCm: num(tape.chestCm),
        thighCm: num(tape.thighCm),
        upperArmCm: num(tape.upperArmCm),
        waterTargetMl,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (navigator.vibrate) navigator.vibrate([18, 45, 28, 45, 60]);
      router.replace("/baseline");
      router.refresh();
    });
  };

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 pb-12 pt-3">
      <header className="pad-safe-t flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="display text-lg tracking-[0.14em] text-ink">ARACHNE</span>
        </div>
        <span className="label-xs tabular">
          {step + 1} / {STEPS.length}
        </span>
      </header>

      {/* ── Progress ── */}
      <div className="flex gap-1" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`h-1 flex-1 ${i <= step ? "bg-crimson" : "bg-panel-2"}`}
          />
        ))}
      </div>

      {step === 0 ? (
        <section className="swing panel halftone flex flex-col gap-4 p-5">
          <p className="label-xs text-crimson">{hasHistory ? "Starting over" : "Setup"}</p>
          <h1 className="display text-3xl leading-tight text-ink">
            {hasHistory ? "Clean slate." : "Twelve months, one silhouette."}
          </h1>
          <TensionLine />
          <p className="text-sm leading-relaxed text-muted">
            The plan is five patrols a week, a calorie corridor that opens after a fortnight, and a
            checkpoint every quarter. None of that means anything until it knows where you start.
          </p>
          <ul className="flex flex-col gap-2">
            {[
              "Your height and the day the clock starts.",
              "Today's weight, the scale's body-fat reading if it has one, and the tape.",
              "Where you're going and how long you're giving it.",
              "What kit you own, so the patrols only prescribe work you can do.",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-crimson" />
                <span className="text-sm leading-relaxed text-muted">{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-dim">
            Two minutes. Everything here is editable afterwards in SETTINGS.
          </p>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="swing flex flex-col gap-4">
          <Heading title="When it starts" sub="Day 0 is pinned here and never drifts." />

          <div className="panel flex flex-col gap-3 p-4">
            <p className="label-xs">Day 0</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: today, l: "Today" },
                { v: tomorrow, l: "Tomorrow" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setStartDate(o.v)}
                  className={`tap flex flex-col items-center justify-center border py-2.5 ${
                    startDate === o.v
                      ? "border-crimson bg-crimson/15 text-crimson"
                      : "border-edge text-muted"
                  }`}
                >
                  <span className="display text-sm">{o.l}</span>
                  <span className="text-[0.6rem] tabular">{o.v}</span>
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-dim">
              Whichever day you pick becomes patrol 1 of the baseline sweep if it&apos;s a weekday, or the
              following Monday if it isn&apos;t. The plan shifts around your start; you don&apos;t have to
              wait for a Monday.
            </p>
          </div>

          <Field
            label="Height"
            unit="cm"
            value={heightCm}
            onChange={setHeightCm}
            hint="Used for the US Navy body-fat estimate. Nothing else depends on it."
          />
        </section>
      ) : null}

      {step === 2 ? (
        <section className="swing flex flex-col gap-4">
          <Heading
            title="Where you are today"
            sub="Measure once, honestly. Every judgement the app makes later is relative to this."
          />

          <Field label="Weight" unit="kg" value={weightKg} onChange={setWeightKg} autoFocus />
          <Field
            label="Body fat"
            unit="%"
            value={bodyfatPct}
            onChange={setBodyfatPct}
            hint="From the scale, if yours reports it. Optional — leave it blank otherwise."
          />

          <div className="panel flex flex-col gap-3 p-4">
            <p className="label-xs">Tape measure</p>
            <p className="text-xs leading-relaxed text-muted-dim">
              The document&apos;s day-1 list. All optional, but waist and neck together give you a second
              body-fat estimate that hydration can&apos;t move.
            </p>
            {MEASUREMENT_FIELDS.filter((f) => f.key !== "weightKg").map((f) => (
              <label key={f.key} className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm text-ink">{f.label}</span>
                  {"note" in f && f.note ? (
                    <span className="text-xs text-muted-dim">{f.note}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-baseline gap-1 border border-edge bg-panel-2 px-3">
                  <input
                    value={tape[f.key as Tape]}
                    onChange={(e) => setTape((p) => ({ ...p, [f.key]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={`${f.label} in ${f.unit}`}
                    className="numeral tap w-16 min-w-0 bg-transparent text-right text-lg text-ink outline-none placeholder:text-muted-dim"
                  />
                  <span className="label-xs">{f.unit}</span>
                </span>
              </label>
            ))}
            {navy !== null ? (
              <p className="label-xs text-cobalt-lift" aria-live="polite">
                Navy estimate: {navy}%
                {num(bodyfatPct) !== null ? ` · scale says ${num(bodyfatPct)}%` : ""}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="swing flex flex-col gap-4">
          <Heading
            title="Where you're going"
            sub="The plan document runs 100 to 80 kg over twelve months. Yours doesn't have to."
          />

          <Field
            label="Goal weight"
            unit="kg"
            value={targetWeightKg}
            onChange={setTargetWeightKg}
            autoFocus
          />

          <div className="panel flex flex-col gap-3 p-4">
            <p className="label-xs">Timeframe</p>
            <div className="grid grid-cols-4 gap-2">
              {TIMEFRAMES.map((f) => (
                <button
                  key={f.days}
                  type="button"
                  onClick={() => setTotalDays(f.days)}
                  className={`tap flex flex-col items-center justify-center border py-2 ${
                    totalDays === f.days
                      ? "border-crimson bg-crimson/15 text-crimson"
                      : "border-edge text-muted"
                  }`}
                >
                  <span className="display text-xs">{f.label.split(" ")[0]}</span>
                  <span className="text-[0.55rem] uppercase tracking-widest">mo</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3">
              <span className="label-xs flex-1">Or exactly</span>
              <span className="flex shrink-0 items-baseline gap-1 border border-edge bg-panel-2 px-3">
                <input
                  value={String(totalDays)}
                  onChange={(e) => setTotalDays(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
                  inputMode="numeric"
                  aria-label="Total days"
                  className="numeral tap w-16 min-w-0 bg-transparent text-right text-lg text-ink outline-none"
                />
                <span className="label-xs">days</span>
              </span>
            </label>
            <p className="text-xs text-muted-dim">
              Between {MIN_TOTAL_DAYS} and {MAX_TOTAL_DAYS} days.
            </p>
          </div>

          {preview ? (
            <div className={`flex flex-col gap-3 p-4 ${preview.rate.tooFast ? "panel-hot" : "panel"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="label-xs">What that asks for</p>
                <p className={`label-xs tabular ${preview.rate.tooFast ? "text-crimson" : "text-cobalt-lift"}`}>
                  {preview.rate.kgPerWeek.toFixed(2)} kg / week
                </p>
              </div>

              <ul className="flex flex-col divide-y divide-edge border border-edge">
                {preview.phases.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                    <span className="text-sm text-ink">
                      <span className="label-xs mr-2">P{p.id}</span>
                      {p.codename}
                    </span>
                    <span className="text-xs text-muted tabular">
                      d{p.startDay}–{p.endDay} · {p.kcal} kcal · {p.weightToKg} kg
                    </span>
                  </li>
                ))}
              </ul>

              {preview.rate.tooFast ? (
                <p className="text-sm leading-relaxed text-ink">
                  That&apos;s faster than about 1% of body weight a week, which is the point where the
                  weight stops being mostly fat. You can go ahead — but the plan&apos;s own advice is more
                  time, not a deeper cut.
                </p>
              ) : null}

              {preview.course.startWeightKg !== PROFILE.startWeightKg ? (
                <p className="text-xs leading-relaxed text-muted-dim">
                  The document states its calorie ladder for a {PROFILE.startWeightKg} kg man and gives no
                  formula for anyone else, so these targets are that ladder scaled by body weight and
                  nothing more. Treat them as a starting point and adjust from what the scale actually does.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="px-1 text-xs text-muted-dim">
              Enter a goal below your current weight to see the phases it produces.
            </p>
          )}

          <div className="panel flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="label-xs">Water target</p>
              <p className="numeral text-lg text-ink tabular">
                {(waterTargetMl / 1000).toFixed(1)} L
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[2000, 2500, WATER_TARGET_ML_DOCUMENT].map((ml) => (
                <button
                  key={ml}
                  type="button"
                  onClick={() => setWaterTargetMl(ml)}
                  className={`tap display border py-2 text-xs tracking-widest ${
                    waterTargetMl === ml
                      ? "border-cobalt bg-cobalt/15 text-cobalt-lift"
                      : "border-edge text-muted"
                  }`}
                >
                  {(ml / 1000).toFixed(1)} L
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-dim">
              The document asks for {(WATER_TARGET_ML_DOCUMENT / 1000).toFixed(0)} litres.
            </p>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="swing flex flex-col gap-4">
          <Heading
            title="What you've got"
            sub="Missing kit produces a named substitute, never a movement you can't perform. Owning better kit upgrades the movement instead."
          />
          <EquipmentPicker initial={equipment} />
          <p className="px-1 text-xs leading-relaxed text-muted-dim">
            Saved as you tap. Skip it if you&apos;d rather sort it later — the defaults assume dumbbells and
            a headset, and SETTINGS can change any of it.
          </p>
        </section>
      ) : null}

      {error ? <p className="px-1 text-sm text-crimson">{error}</p> : null}

      {/* ── Navigation ── */}
      <div className="mt-auto flex gap-2 pb-4 pt-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep((s) => s - 1);
            }}
            className="tap display border border-edge px-5 text-xs tracking-widest text-muted"
          >
            Back
          </button>
        ) : null}

        <button
          type="button"
          disabled={!canAdvance || pending}
          onClick={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
          className="tap display flex-1 border border-crimson bg-crimson px-4 py-3.5 text-sm tracking-widest text-ink disabled:border-edge disabled:bg-transparent disabled:text-muted-dim"
        >
          {pending
            ? "Setting up"
            : step === STEPS.length - 1
              ? "Begin"
              : step === 0
                ? "Start"
                : "Next"}
        </button>
      </div>
    </main>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="display text-2xl text-ink">{title}</h1>
      <p className="text-sm leading-relaxed text-muted">{sub}</p>
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  hint,
  autoFocus,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = `f-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <label htmlFor={id} className="label-xs">
        {label}
      </label>
      <div className="flex items-baseline gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          className="numeral w-full min-w-0 bg-transparent text-4xl text-ink outline-none placeholder:text-muted-dim"
        />
        <span className="label-xs shrink-0">{unit}</span>
      </div>
      {hint ? <p className="text-xs leading-relaxed text-muted-dim">{hint}</p> : null}
    </div>
  );
}
