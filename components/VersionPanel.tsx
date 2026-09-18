"use client";

import { useState } from "react";
import { APP_VERSION, RELEASES } from "@/lib/version";

/**
 * What is running, and what changed.
 *
 * The schema version sits next to the app version because they answer different
 * questions and are easy to confuse: one says which build this is, the other
 * says how far the database has been migrated. When something looks wrong after
 * an update, the pair of them is the first thing worth reading out.
 */
export function VersionPanel({
  schemaVersion,
  dayStartHour,
}: {
  schemaVersion: number;
  /**
   * The hour the running build turns the day over.
   *
   * Here rather than buried in an env file because this is the panel that
   * answers "what is the build on my phone actually doing". The day boundary is
   * invisible until the one night it matters, and when it does not behave the
   * first question is whether this build has it at all.
   */
  dayStartHour: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs">Version</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="label-xs underline">
          {open ? "Hide" : "What changed"}
        </button>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="numeral text-3xl text-ink tabular">{APP_VERSION}</span>
        <span className="label-xs">schema {schemaVersion}</span>
      </div>

      <p className="label-xs text-muted-dim">
        The day turns over at {dayStartHour}:00 — DAY_START_HOUR
      </p>

      {open ? (
        <ul className="flex flex-col gap-4 border-t border-edge pt-3">
          {RELEASES.map((r) => (
            <li key={r.version} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="display text-sm text-ink">
                  {r.version}
                  {r.version === APP_VERSION ? (
                    <span className="ml-2 border border-crimson-dim px-1 text-[0.5rem] uppercase tracking-widest text-crimson">
                      Running
                    </span>
                  ) : null}
                </span>
                <span className="label-xs tabular">{r.date}</span>
              </div>
              <p className="text-sm text-muted">{r.headline}</p>
              <ul className="flex flex-col gap-1">
                {r.changes.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 bg-cobalt" />
                    <span className="text-xs leading-relaxed text-muted-dim">{c}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-relaxed text-muted-dim">
          Small changes move the last number, larger ones the middle. Databases from any earlier version
          are migrated forward when the app opens them — nothing needs re-entering after an update.
        </p>
      )}
    </div>
  );
}
