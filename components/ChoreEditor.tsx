"use client";

import { useState, useTransition } from "react";
import { addChore, archiveChore, renameChore, reorderChore } from "@/app/maintenance/actions";
import type { Cadence, ChoreRow } from "@/lib/chores";

/**
 * Add, rename, reorder and retire — folded away behind one line.
 *
 * The editing is the rare interaction and the ticking is the daily one, so it
 * opens closed. Retiring says "retire" rather than "delete" because that is
 * what it does: the chore stops counting from tomorrow and everything it earned
 * stays where it is.
 */
export function ChoreEditor({ daily, weekly }: { daily: ChoreRow[]; weekly: ChoreRow[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const submit = () => {
    if (name.trim().length === 0) return;
    start(async () => {
      const res = await addChore(name, cadence);
      if (res.ok) {
        setName("");
        setError(null);
      } else setError(res.error);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap panel flex items-center justify-between px-3.5 py-3 text-left"
      >
        <span className="label-xs">Edit the list</span>
        <span className="text-muted">+</span>
      </button>
    );
  }

  return (
    <section className="panel flex flex-col gap-4 p-3.5">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">Edit the list</p>
        <button type="button" onClick={() => setOpen(false)} className="tap label-xs underline">
          Done
        </button>
      </div>

      {/* ── Add ── */}
      <div className="flex flex-col gap-2">
        <div className="flex border border-edge">
          {(["daily", "weekly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              aria-pressed={cadence === c}
              className={`flex-1 px-3 py-2 text-xs ${
                cadence === c ? "bg-cobalt/20 text-cobalt-lift" : "text-muted-dim"
              }`}
            >
              {c === "daily" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. Water the plants"
            maxLength={80}
            className="min-w-0 flex-1 border border-edge bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-cobalt"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || name.trim().length === 0}
            className="tap border border-edge px-4 text-xs text-ink disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {error ? <p className="text-xs text-crimson">{error}</p> : null}
      </div>

      <Group title="Daily" rows={daily} />
      <Group title="Weekly" rows={weekly} />
    </section>
  );
}

function Group({ title, rows }: { title: string; rows: ChoreRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="label-xs">{title}</p>
      {rows.map((c, i) => (
        <Row key={c.id} chore={c} first={i === 0} last={i === rows.length - 1} />
      ))}
    </div>
  );
}

function Row({ chore, first, last }: { chore: ChoreRow; first: boolean; last: boolean }) {
  const [name, setName] = useState(chore.name);
  const [confirming, setConfirming] = useState(false);
  const [, start] = useTransition();

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== chore.name) start(() => void renameChore(chore.id, name));
        }}
        maxLength={80}
        className="min-w-0 flex-1 border border-transparent bg-transparent px-1 py-1.5 text-sm text-ink outline-none focus:border-edge"
      />
      <button
        type="button"
        aria-label="Move up"
        disabled={first}
        onClick={() => start(() => void reorderChore(chore.id, -1))}
        className="tap w-7 text-muted disabled:opacity-25"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label="Move down"
        disabled={last}
        onClick={() => start(() => void reorderChore(chore.id, 1))}
        className="tap w-7 text-muted disabled:opacity-25"
      >
        ↓
      </button>
      {confirming ? (
        <button
          type="button"
          onClick={() => start(() => void archiveChore(chore.id))}
          className="tap px-2 text-xs text-crimson"
        >
          Sure?
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Retire ${chore.name}`}
          onClick={() => setConfirming(true)}
          className="tap w-7 text-muted-dim"
        >
          ×
        </button>
      )}
    </div>
  );
}
