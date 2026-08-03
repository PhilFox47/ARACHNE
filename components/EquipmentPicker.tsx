"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EquipmentItem } from "@/lib/equipment";
import { saveEquipment } from "@/app/settings/actions";

/**
 * What you own drives which movements get prescribed. Missing kit produces a
 * named substitute rather than a movement you can't perform, and the full list
 * (including anything custom) goes to the model when it picks loads.
 */
export function EquipmentPicker({ initial }: { initial: EquipmentItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const persist = (next: EquipmentItem[]) => {
    setItems(next);
    if (navigator.vibrate) navigator.vibrate(6);
    start(async () => {
      await saveEquipment(next);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 1800);
    });
  };

  const toggle = (key: string) =>
    persist(items.map((i) => (i.key === key ? { ...i, owned: !i.owned } : i)));

  const addCustom = () => {
    const label = draft.trim();
    if (!label) return;
    const key = `custom_${label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_")}`.slice(0, 48);
    if (items.some((i) => i.key === key)) {
      setDraft("");
      return;
    }
    persist([...items, { key, label, owned: true, custom: true }]);
    setDraft("");
  };

  const removeCustom = (key: string) => persist(items.filter((i) => i.key !== key));

  const ownedCount = items.filter((i) => i.owned).length;

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs">Training materials</p>
        {saved ? (
          <p className="label-xs text-cobalt-lift">Saved</p>
        ) : (
          <p className="label-xs tabular">{ownedCount} available</p>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-edge border border-edge">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-3 px-3 py-2.5">
            <button
              type="button"
              onClick={() => toggle(i.key)}
              disabled={pending}
              role="switch"
              aria-checked={i.owned}
              aria-label={i.label}
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs ${
                i.owned ? "border-crimson bg-crimson text-ink" : "border-edge text-transparent"
              }`}
            >
              ✓
            </button>

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={`text-sm ${i.owned ? "text-ink" : "text-muted-dim"}`}>{i.label}</span>
              {i.note ? <span className="text-xs leading-relaxed text-muted-dim">{i.note}</span> : null}
            </span>

            {i.custom ? (
              <button
                type="button"
                onClick={() => removeCustom(i.key)}
                disabled={pending}
                aria-label={`Remove ${i.label}`}
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
            if (e.key === "Enter") addCustom();
          }}
          placeholder="Add your own — cable machine, sandbag…"
          aria-label="Add equipment"
          className="tap min-w-0 flex-1 border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={pending || draft.trim().length === 0}
          className="tap display border border-edge px-4 text-xs tracking-widest text-muted disabled:opacity-30"
        >
          Add
        </button>
      </div>

      <p className="text-xs leading-relaxed text-muted-dim">
        Anything you untick gets substituted in your sessions rather than dropped — no pull-up bar swaps
        vertical pulling for inverted rows, so the training effect survives. Custom items are passed to the
        model when it picks loads.
      </p>
    </div>
  );
}
