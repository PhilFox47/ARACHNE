"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { progressSummary, resetProgress } from "@/app/settings/actions";

type Summary = Awaited<ReturnType<typeof progressSummary>>;

/**
 * Three gates before anything is deleted: open the panel, read what will go,
 * type RESET. Destructive and irreversible, so it should take deliberate effort
 * — but it's still reachable in under ten seconds when you actually mean it.
 */
export function ResetPanel({ today, tomorrow }: { today: string; tomorrow: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [startDate, setStartDate] = useState(tomorrow);
  const [deleteImages, setDeleteImages] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openPanel = () => {
    setOpen(true);
    setResult(null);
    start(async () => setSummary(await progressSummary()));
  };

  const armed = confirmText === "RESET";
  const total = summary
    ? summary.weights + summary.sessions + summary.sets + summary.food + summary.trials + summary.photos
    : 0;

  const run = () => {
    start(async () => {
      const res = await resetProgress(confirmText, { startDate, deleteImages });
      if (!res.ok) {
        setResult(res.error);
        return;
      }
      setResult(
        `Cleared ${total} records${res.imagesRemoved ? ` and ${res.imagesRemoved} images` : ""}. Day 0 is now ${res.startDate}.`,
      );
      setConfirmText("");
      setOpen(false);
      setSummary(null);
      if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="panel flex flex-col gap-3 p-4">
        <p className="label-xs">Reset progress</p>
        <p className="text-sm text-muted">
          Clears every reading, session, set, meal, trial and photo, and re-pins day 0. Your settings —
          model, equipment, height, targets — are kept.
        </p>
        {result ? <p className="text-sm text-cobalt-lift">{result}</p> : null}
        <button
          type="button"
          onClick={openPanel}
          className="tap display self-start border border-crimson-dim px-4 py-2.5 text-xs tracking-widest text-crimson"
        >
          Reset progress
        </button>
      </div>
    );
  }

  return (
    <div className="panel-hot flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <p className="label-xs text-crimson">Confirm reset</p>
        <button type="button" onClick={() => setOpen(false)} className="label-xs underline">
          Cancel
        </button>
      </div>

      {summary ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink">This deletes, permanently:</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Row label="Weight readings" n={summary.weights} />
            <Row label="Sessions" n={summary.sessions} />
            <Row label="Logged sets" n={summary.sets} />
            <Row label="Fuel entries" n={summary.food} />
            <Row label="Trials" n={summary.trials} />
            <Row label="Photos" n={summary.photos} />
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">Counting…</p>
      )}

      <div className="flex flex-col gap-2">
        <p className="label-xs">Day 0 becomes</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: today, l: "Today" },
            { v: tomorrow, l: "Tomorrow" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setStartDate(o.v)}
              className={`tap flex flex-col items-center justify-center border py-2 ${
                startDate === o.v ? "border-crimson bg-crimson/15 text-crimson" : "border-edge text-muted"
              }`}
            >
              <span className="display text-sm">{o.l}</span>
              <span className="text-[0.6rem] tabular">{o.v}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDeleteImages((v) => !v)}
        role="switch"
        aria-checked={deleteImages}
        className="flex items-center gap-3 text-left"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center border text-xs ${
            deleteImages ? "border-crimson bg-crimson text-ink" : "border-edge text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="text-sm text-ink">Also delete meal and suit-check images from disk</span>
      </button>

      <div className="flex flex-col gap-2">
        <p className="label-xs">Type RESET to confirm</p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Type RESET to confirm"
          className="tap border border-edge bg-panel-2 px-3 text-center text-lg tracking-[0.3em] text-ink outline-none focus:border-crimson"
        />
      </div>

      <button
        type="button"
        onClick={run}
        disabled={!armed || pending}
        className="tap display w-full border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink disabled:border-edge disabled:bg-transparent disabled:text-muted-dim"
      >
        {pending ? "Clearing" : armed ? "Delete everything" : "Type RESET above"}
      </button>

      {result ? <p className="text-sm text-crimson">{result}</p> : null}
    </div>
  );
}

function Row({ label, n }: { label: string; n: number }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <span className={`numeral text-sm tabular ${n > 0 ? "text-ink" : "text-muted-dim"}`}>{n}</span>
    </li>
  );
}
