"use client";

import { useState, useTransition } from "react";
import { toggleChore } from "@/app/maintenance/actions";
import type { ChoreStanding } from "@/lib/chores";

/**
 * A tickable list of chores.
 *
 * Optimistic, because the whole interaction is one tap and a round trip to
 * confirm what you already know you did is the difference between a checklist
 * you use and one you cannot be bothered with. The server is still the truth —
 * a failed write puts the tick back.
 */
export function ChoreList({
  items,
  date,
  onChanged,
}: {
  items: ChoreStanding[];
  date: string;
  onChanged?: () => void;
}) {
  const [local, setLocal] = useState<Record<number, boolean>>({});
  const [, start] = useTransition();

  if (items.length === 0) return null;

  const isDone = (s: ChoreStanding) => local[s.chore.id] ?? s.done;

  const tap = (s: ChoreStanding) => {
    const next = !isDone(s);
    setLocal((m) => ({ ...m, [s.chore.id]: next }));
    start(async () => {
      const res = await toggleChore(s.chore.id, date, next);
      if (!res.ok) setLocal((m) => ({ ...m, [s.chore.id]: !next }));
      onChanged?.();
    });
  };

  return (
    <ul className="flex flex-col">
      {items.map((s) => {
        const done = isDone(s);
        return (
          <li key={s.chore.id} className="border-b border-edge last:border-b-0">
            <button
              type="button"
              onClick={() => tap(s)}
              aria-pressed={done}
              className="tap flex w-full items-center gap-3 py-3 text-left active:opacity-60"
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                  done ? "border-cobalt bg-cobalt/20" : "border-edge"
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-cobalt-lift">
                    <path d="M3 8.5l3.2 3.2L13 4.8" />
                  </svg>
                ) : null}
              </span>
              <span className={`flex-1 text-sm ${done ? "text-muted-dim line-through" : "text-ink"}`}>
                {s.chore.name}
              </span>
              {s.doneOn && s.doneOn !== date ? (
                <span className="label-xs shrink-0">{s.doneOn.slice(8)}/{s.doneOn.slice(5, 7)}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
