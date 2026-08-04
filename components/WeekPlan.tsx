"use client";

import { useState } from "react";
import Link from "next/link";
import type { Exercise, Session } from "@/lib/plan";
import { TensionLine } from "./TensionLine";

export interface DayPlan {
  dayKey: string;
  dayName: string;
  date: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  /** Falls in week 0 but before day 0 — the run hadn't begun yet. */
  beforeStart?: boolean;
  session: Session | null;
  completed: boolean;
  setsLogged: number;
}

/**
 * The whole week at once. Today opens by default; everything else is one tap
 * away, so Friday's session is visible on Monday without leaving the screen.
 */
export function WeekPlan({ days, rounds }: { days: DayPlan[]; rounds: number }) {
  // Collapsed by default. The point of this screen is the whole week at a
  // glance — auto-expanding today would push Thursday and Friday off-screen,
  // which is the exact problem the week view exists to solve.
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-2">
      {days.map((d) => {
        const isOpen = open === d.dayKey;
        const rest = d.session === null;
        // Nothing was skipped on a day before day 0, so it must not read like a
        // missed patrol or an off-duty day you chose.
        const pending = d.beforeStart === true;

        return (
          <li key={d.dayKey}>
            <div
              className={`panel ${d.isToday ? "border-crimson-dim" : ""} ${
                pending ? "opacity-40" : d.isPast && !d.isToday ? "opacity-70" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => (pending ? undefined : setOpen(isOpen ? null : d.dayKey))}
                aria-expanded={pending ? undefined : isOpen}
                disabled={pending}
                className="tap flex w-full items-center gap-3 p-3 text-left"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center border ${
                    d.completed
                      ? "border-crimson bg-crimson text-ink"
                      : d.isToday
                        ? "border-crimson bg-crimson/10"
                        : "border-edge"
                  }`}
                >
                  {d.completed ? (
                    <span className="text-lg leading-none text-ink">✓</span>
                  ) : (
                    <>
                      <span className={`display text-xs ${d.isToday ? "text-crimson" : "text-muted"}`}>
                        {d.dayName}
                      </span>
                      <span className="text-[0.55rem] text-muted-dim tabular">{d.dateLabel}</span>
                    </>
                  )}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`display text-base ${rest ? "text-muted" : "text-ink"}`}>
                    {pending ? "Before day 0" : rest ? "Off-duty" : d.session!.title}
                  </span>
                  <span className="label-xs">
                    {pending
                      ? "You hadn't started yet"
                      : d.completed
                      ? `Complete${d.setsLogged > 0 ? ` · ${d.setsLogged} sets` : ""}`
                      : d.setsLogged > 0
                        ? `${d.setsLogged} sets logged`
                        : rest
                          ? "Optional 45 min walk"
                          : d.session!.main.length > 0
                            ? `${d.session!.main.length} movements · ${rounds} rounds`
                            : // Thursday is a pick-one, not a circuit — calling
                              // the VR titles "movements" misreads the session.
                              `${d.session!.options?.length ?? 0} options · pick one`}
                  </span>
                </span>

                <span className={`shrink-0 text-lg ${isOpen ? "text-crimson" : "text-muted-dim"}`}>
                  {pending ? "" : isOpen ? "−" : "+"}
                </span>
              </button>

              {isOpen && !rest ? (
                <div className="flex flex-col gap-4 border-t border-edge p-3">
                  <Link
                    href={`/patrol/${d.date}`}
                    className={`tap display flex items-center justify-center border px-4 py-3 text-sm tracking-widest ${
                      d.completed
                        ? "border-crimson-dim text-crimson"
                        : "border-crimson bg-crimson text-ink"
                    }`}
                  >
                    {d.completed ? "Review session" : "Start session"}
                  </Link>

                  {d.session!.blurb ? (
                    <p className="text-sm leading-relaxed text-muted">{d.session!.blurb}</p>
                  ) : null}

                  {d.session!.warmup ? <Block title="Warm-up" items={d.session!.warmup} /> : null}
                  {d.session!.main.length > 0 ? <Block title="Work" items={d.session!.main} /> : null}

                  {d.session!.options ? (
                    <div className="flex flex-col gap-2">
                      <p className="label-xs">Pick one</p>
                      <ul className="flex flex-col gap-1.5">
                        {d.session!.options.map((o) => (
                          <li key={o} className="text-sm text-ink">
                            {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {d.session!.extras ? <Block title="Additionally" items={d.session!.extras} /> : null}
                  {d.session!.cooldown ? <Block title="Cooldown" items={d.session!.cooldown} /> : null}

                  {d.session!.rule ? (
                    <>
                      <TensionLine accent />
                      <p className="border-l-2 border-l-crimson pl-3 text-sm leading-relaxed text-muted">
                        {d.session!.rule}
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}

              {isOpen && rest ? (
                <div className="border-t border-edge p-3">
                  <p className="text-sm text-muted">
                    No patrol. The plan prescribes this — a rest day taken on purpose isn&apos;t a missed one.
                  </p>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Block({ title, items }: { title: string; items: Exercise[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="label-xs">{title}</p>
      <ul className="flex flex-col divide-y divide-edge border border-edge">
        {items.map((e) => (
          <li key={e.name} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-ink">
                {e.name}
                {e.since ? (
                  <span className="ml-2 border border-crimson-dim px-1 text-[0.5rem] uppercase tracking-widest text-crimson">
                    New
                  </span>
                ) : null}
              </span>
              {e.note ? <span className="text-xs text-muted-dim">{e.note}</span> : null}
            </span>
            <span className="shrink-0 text-sm text-muted tabular">{e.dose}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
