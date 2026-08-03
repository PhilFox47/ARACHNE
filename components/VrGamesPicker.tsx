"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VrGame } from "@/lib/equipment";
import { saveVrGames } from "@/app/settings/actions";

/**
 * Thursday's pick-one list comes from here. The document names five games; this
 * is the version that knows which of them you own and what else you've bought
 * since.
 */
export function VrGamesPicker({ initial, hasHeadset }: { initial: VrGame[]; hasHeadset: boolean }) {
  const router = useRouter();
  const [games, setGames] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const persist = (next: VrGame[]) => {
    setGames(next);
    if (navigator.vibrate) navigator.vibrate(6);
    start(async () => {
      await saveVrGames(next);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 1800);
    });
  };

  const toggle = (key: string) =>
    persist(games.map((g) => (g.key === key ? { ...g, owned: !g.owned } : g)));

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    const key = `vr_${label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_")}`.slice(0, 48);
    if (games.some((g) => g.key === key)) {
      setDraft("");
      return;
    }
    persist([
      ...games,
      { key, label, howTo: "25 minutes, heart rate high", owned: true, custom: true },
    ]);
    setDraft("");
  };

  const ownedCount = games.filter((g) => g.owned).length;

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs">VR games</p>
        {saved ? (
          <p className="label-xs text-cobalt-lift">Saved</p>
        ) : (
          <p className="label-xs tabular">{ownedCount} in rotation</p>
        )}
      </div>

      {!hasHeadset ? (
        <p className="text-xs leading-relaxed text-crimson">
          VR headset is unticked above, so Thursday falls back to outdoor sprint intervals. These stay here
          for when it comes back.
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-edge border border-edge">
        {games.map((g) => (
          <li key={g.key} className="flex items-start gap-3 px-3 py-2.5">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              disabled={pending}
              role="switch"
              aria-checked={g.owned}
              aria-label={g.label}
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs ${
                g.owned ? "border-crimson bg-crimson text-ink" : "border-edge text-transparent"
              }`}
            >
              ✓
            </button>

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={`text-sm ${g.owned ? "text-ink" : "text-muted-dim"}`}>{g.label}</span>
              <span className="text-xs leading-relaxed text-muted-dim">{g.howTo}</span>
            </span>

            {g.custom ? (
              <button
                type="button"
                onClick={() => persist(games.filter((x) => x.key !== g.key))}
                disabled={pending}
                aria-label={`Remove ${g.label}`}
                className="label-xs shrink-0 text-crimson"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add a game — Pistol Whip, Synth Riders…"
          aria-label="Add VR game"
          className="tap min-w-0 flex-1 border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || draft.trim().length === 0}
          className="tap display border border-edge px-4 text-xs tracking-widest text-muted disabled:opacity-30"
        >
          Add
        </button>
      </div>

      <p className="text-xs leading-relaxed text-muted-dim">
        Only ticked games appear on Thursday. The document&apos;s rule stands whichever you pick: the goal is
        being out of breath, not the high score.
      </p>
    </div>
  );
}
