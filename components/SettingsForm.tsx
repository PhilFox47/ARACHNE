"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/app/actions";
import { MAX_TOTAL_DAYS, MIN_TOTAL_DAYS } from "@/lib/plan";
import { WebLoader } from "./WebLoader";
import { TensionLine } from "./TensionLine";

interface ModelOption {
  id: string;
  name: string;
  inputPerM: number | null;
  outputPerM: number | null;
  per1kMeals: number | null;
}

export function SettingsForm({
  initial,
  envModel,
  hasKey,
}: {
  initial: {
    visionModel: string | null;
    photoCorrectionPct: number;
    waterTargetMl: number;
    heightCm: number;
    startWeightKg: number;
    targetWeightKg: number;
    totalDays: number;
    startDate: string;
  };
  envModel: string | null;
  hasKey: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const save = (key: string, value: string | number, label: string) => {
    start(async () => {
      const res = await updateSetting(key, value);
      setToast(res.ok ? `${label} saved.` : (res.error ?? "Failed."));
      if (navigator.vibrate) navigator.vibrate(8);
      router.refresh();
      setTimeout(() => setToast(null), 2200);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <ModelPicker
        current={initial.visionModel}
        envModel={envModel}
        hasKey={hasKey}
        onSave={(id) => save("vision_model", id, "Model")}
        pending={pending}
      />

      <NumberSetting
        label="Water target"
        hint="The plan document asks for 3 litres; this is the target you set. FUEL logs it in 250, 350 or 750 ml taps, or any amount you type."
        suffix="ml"
        value={initial.waterTargetMl}
        step={250}
        min={500}
        max={6000}
        onSave={(v) => save("water_target_ml", v, "Water target")}
        pending={pending}
      />

      <NumberSetting
        label="Photo correction"
        hint="Applied to every AI calorie estimate. The plan document recommends +20%, citing an NIDDK analysis in which photo apps underestimated by 250–345 kcal per meal. Your brief said start at 0."
        suffix="%"
        value={initial.photoCorrectionPct}
        step={1}
        min={-50}
        max={100}
        onSave={(v) => save("photo_correction_pct", v, "Correction")}
        pending={pending}
      />

      <details className="panel p-4">
        <summary className="label-xs cursor-pointer select-none">Profile &amp; corridor</summary>
        <div className="mt-4 flex flex-col gap-4">
          <NumberSetting
            label="Height"
            hint="Used by the US Navy body-fat estimate. Stored body-fat readings are not recalculated when this changes."
            suffix="cm"
            value={initial.heightCm}
            step={1}
            min={100}
            max={230}
            onSave={(v) => save("height_cm", v, "Height")}
            pending={pending}
            bare
          />
          <NumberSetting
            label="Start weight"
            suffix="kg"
            value={initial.startWeightKg}
            step={0.1}
            min={30}
            max={300}
            onSave={(v) => save("start_weight_kg", v, "Start weight")}
            pending={pending}
            bare
          />
          <NumberSetting
            label="Target weight"
            suffix="kg"
            value={initial.targetWeightKg}
            step={0.1}
            min={30}
            max={300}
            onSave={(v) => save("target_weight_kg", v, "Target weight")}
            pending={pending}
            bare
          />
          <NumberSetting
            label="Timeframe"
            hint="The document's own run is 365 days. Change it and the four phases, the corridor and the checkpoints all stretch to fit — the calorie ladder scales by body weight only, so check it still looks sane afterwards."
            suffix="days"
            value={initial.totalDays}
            step={7}
            min={MIN_TOTAL_DAYS}
            max={MAX_TOTAL_DAYS}
            onSave={(v) => save("total_days", v, "Timeframe")}
            pending={pending}
            bare
          />
          <div className="flex flex-col gap-2">
            <p className="label-xs">Day 0</p>
            <p className="text-sm text-ink tabular">{initial.startDate}</p>
            <p className="text-xs text-muted-dim">
              Every phase boundary, checkpoint and corridor anchor is measured from this date, which is why
              it isn&apos;t editable here — moving it would silently rewrite every judgement already made
              against it. Resetting progress starts onboarding again and lets you re-pin it.
            </p>
          </div>
        </div>
      </details>

      <div className="panel flex flex-col gap-2 p-4">
        <p className="label-xs">Port</p>
        <p className="text-sm text-muted">
          Set <code className="text-cobalt-lift">ARACHNE_PORT</code> in <code className="text-cobalt-lift">.env</code>{" "}
          and run <code className="text-cobalt-lift">docker compose up -d</code>. Only the host side changes, so
          nothing inside the container needs rebuilding.
        </p>
      </div>

      <TensionLine />

      <button
        type="button"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        }}
        className="tap display border border-edge px-4 py-3 text-sm tracking-widest text-muted active:border-crimson active:text-crimson"
      >
        Sign out
      </button>

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

function ModelPicker({
  current,
  envModel,
  hasKey,
  onSave,
  pending,
}: {
  current: string | null;
  envModel: string | null;
  hasKey: boolean;
  onSave: (id: string) => void;
  pending: boolean;
}) {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(current ?? "");
  const [query, setQuery] = useState("");

  const active = current ?? envModel;
  const q = query.trim().toLowerCase();
  const shown = models === null ? null : q === "" ? models : models.filter((m) => m.id.toLowerCase().includes(q));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/models");
      const body = await res.json();
      if (body.ok) setModels(body.models as ModelOption[]);
      else setError(body.error ?? "Could not reach Nano-GPT.");
    } catch {
      setError("Could not reach Nano-GPT.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasKey) void load();
  }, [hasKey]);

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs">Vision model</p>
        {active ? <p className="label-xs text-cobalt-lift">Active</p> : <p className="label-xs text-crimson">Unset</p>}
      </div>

      <p className="display truncate text-lg text-ink" title={active ?? undefined}>
        {active ?? "None selected"}
      </p>
      {current === null && envModel ? (
        <p className="text-xs text-muted-dim">From NANOGPT_VISION_MODEL. Picking one here overrides it.</p>
      ) : null}

      {!hasKey ? (
        <p className="text-sm text-muted">
          <code className="text-cobalt-lift">NANOGPT_API_KEY</code> isn&apos;t set, so the model list can&apos;t be
          fetched. Set it in <code className="text-cobalt-lift">.env</code> and restart.
        </p>
      ) : loading ? (
        <div className="py-4">
          <WebLoader label="Reading model list" />
        </div>
      ) : shown ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — try “gemma”"
            aria-label="Search models"
            className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
          />
          <p className="text-xs text-muted-dim">
            {shown.length} of {models!.length} vision-capable models, cheapest first. Cost is estimated per
            1,000 meal photos.
          </p>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">Nothing matches “{query}”.</p>
          ) : null}
          <ul className="flex max-h-80 flex-col divide-y divide-edge overflow-y-auto border border-edge">
            {shown.map((m) => {
              const selected = m.id === active;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSave(m.id)}
                    className={`tap flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${
                      selected ? "bg-panel-2" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className={`truncate text-sm ${selected ? "text-crimson" : "text-ink"}`}>{m.id}</span>
                      {m.inputPerM !== null ? (
                        <span className="text-[0.65rem] text-muted-dim tabular">
                          ${m.inputPerM.toFixed(2)}/M in
                          {m.outputPerM !== null ? ` · $${m.outputPerM.toFixed(2)}/M out` : ""}
                        </span>
                      ) : (
                        <span className="text-[0.65rem] text-muted-dim">price unlisted</span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      {m.per1kMeals !== null ? (
                        <span className="numeral text-base text-cobalt-lift tabular">
                          ${m.per1kMeals.toFixed(2)}
                        </span>
                      ) : (
                        <span className="label-xs">—</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {error ? <p className="text-sm text-crimson">{error}</p> : null}
          <p className="text-xs text-muted">
            The list is unavailable, so set the ID by hand. Anything Nano-GPT accepts will work.
          </p>
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="gemini-2.5-flash-lite"
              className="tap min-w-0 flex-1 border border-edge bg-panel-2 px-3 text-sm text-ink outline-none focus:border-cobalt"
            />
            <button
              type="button"
              disabled={pending || manual.trim().length === 0}
              onClick={() => onSave(manual.trim())}
              className="tap display border border-crimson bg-crimson px-4 text-xs tracking-widest text-ink disabled:opacity-40"
            >
              Set
            </button>
          </div>
          <button type="button" onClick={load} className="label-xs self-start underline">
            Retry the list
          </button>
        </div>
      )}
    </div>
  );
}

function NumberSetting({
  label,
  hint,
  suffix,
  value,
  step,
  min,
  max,
  onSave,
  pending,
  bare,
}: {
  label: string;
  hint?: string;
  suffix: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onSave: (v: number) => void;
  pending: boolean;
  bare?: boolean;
}) {
  const [v, setV] = useState(String(value));
  const dirty = Number(v) !== value && v !== "";

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs">{label}</p>
        {dirty ? <p className="label-xs text-crimson">Unsaved</p> : null}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-1 items-baseline gap-1.5 border border-edge bg-panel-2 px-3">
          <input
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            max={max}
            value={v}
            onChange={(e) => setV(e.target.value)}
            aria-label={label}
            className="numeral tap w-full min-w-0 bg-transparent text-xl text-ink outline-none"
          />
          <span className="label-xs shrink-0">{suffix}</span>
        </div>
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => onSave(Number(v))}
          className="tap display border border-crimson bg-crimson px-4 text-xs tracking-widest text-ink disabled:opacity-30"
        >
          Save
        </button>
      </div>
      {hint ? <p className="text-xs leading-relaxed text-muted-dim">{hint}</p> : null}
    </>
  );

  if (bare) return <div className="flex flex-col gap-2">{body}</div>;
  return <div className="panel flex flex-col gap-2 p-4">{body}</div>;
}
