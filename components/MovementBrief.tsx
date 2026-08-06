"use client";

import { FAMILY_LABELS, type Movement } from "@/lib/movements";

/**
 * One movement, explained — and the same explanation everywhere it is needed.
 *
 * It lived inside THE WEB's node sheet, which meant the screen you actually do
 * the work on had none of it. Standing over a mat trying to remember which
 * shoulder the roll goes over is exactly when "what goes wrong" is worth
 * reading, and that was the one moment it was three taps away on another page.
 *
 * So the body is here and both callers render it. THE WEB wraps it in its own
 * state chrome — locked, mastered, how many clean sessions — and the session
 * wraps it in nothing at all. Neither owns a second copy of the words.
 */

export interface TreeContext {
  /** Position in the strand, for "3 of 8". */
  tier: number;
  rungs: number;
  /** The rung this is built on, and the one it becomes. */
  below: string | null;
  above: string | null;
  /** Movements in other strands that mastering this one opens. */
  opens: string[];
  /** What counts as mastered, as a phrase. */
  mastery: string;
}

export function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="label-xs">{title}</p>
      <ol className="flex flex-col gap-1.5">
        {items.map((s, i) => (
          <li key={s} className="flex gap-2.5">
            <span className="numeral shrink-0 text-xs text-crimson tabular">{i + 1}</span>
            <span className="text-sm leading-relaxed text-muted">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chips({ title, items, cobalt }: { title: string; items: string[]; cobalt?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="label-xs">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((c) => (
          <span
            key={c}
            className={`border px-2.5 py-1 text-xs ${
              cobalt ? "border-cobalt/40 text-cobalt-lift" : "border-edge text-ink"
            }`}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MovementBriefBody({ m, tree }: { m: Movement; tree: TreeContext | null }) {
  const isGround = m.track === "groundwork";

  return (
    <>
      <p className="text-sm leading-relaxed text-muted">{m.summary}</p>

      <Block title="Setting up" items={m.setup} />
      <Block title="The rep" items={m.execution} />

      <div className="flex flex-col gap-1.5">
        <p className="label-xs text-crimson">What goes wrong</p>
        <p className="border-l-2 border-l-crimson pl-3 text-sm leading-relaxed text-muted">{m.watch}</p>
      </div>

      <Chips title="Cues" items={m.cues} />
      <Chips title="Trains" items={m.trains} cobalt />

      {m.requires && m.requires.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="label-xs">Needs from elsewhere</p>
          {m.requires.map((r) => (
            <p key={`${r.family}-${r.why}`} className="text-xs leading-relaxed text-muted-dim">
              <span className="text-muted">{FAMILY_LABELS[r.family]}</span> — {r.why}
            </p>
          ))}
        </div>
      ) : null}

      {/* ── Where it sits ──
          The half of the tree that was never visible. A strand's next rung is
          obvious from the list; that the roll from a crouch is what both the
          cartwheel and the safety vault are waiting on is not, and it is the
          best reason to do a boring rung properly. */}
      {tree && !isGround ? (
        <div className="flex flex-col gap-2 border-t border-edge pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-xs">Where this sits</p>
            <p className="label-xs tabular">
              {FAMILY_LABELS[m.family]} · {tree.tier + 1} of {tree.rungs}
            </p>
          </div>

          <dl className="flex flex-col gap-1.5 text-sm">
            <Line label="Built on" value={tree.below ?? "Where the strand starts"} />
            <Line label="Becomes" value={tree.above ?? "The top of this strand"} />
            <Line label="Mastered at" value={tree.mastery} crimson />
          </dl>

          {tree.opens.length > 0 ? (
            <div className="flex flex-col gap-1 border-l-2 border-l-cobalt pl-3">
              <p className="label-xs text-cobalt-lift">Mastering this also opens</p>
              <p className="text-sm leading-relaxed text-ink">{tree.opens.join(" · ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {isGround ? (
        <p className="border-t border-edge pt-3 text-xs leading-relaxed text-muted-dim">
          Groundwork — always available, never locked, and there is nothing to master here. This is
          what you do so the rest of the session goes well.
        </p>
      ) : null}
    </>
  );
}

function Line({ label, value, crimson }: { label: string; value: string; crimson?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="label-xs shrink-0">{label}</dt>
      <dd className={`min-w-0 text-right text-sm ${crimson ? "text-crimson" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
