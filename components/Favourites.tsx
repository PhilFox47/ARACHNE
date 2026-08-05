"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logFavourite, removeFavourite, renameFavourite } from "@/app/fuel/actions";

export interface FavouriteItem {
  id: number;
  normKey: string;
  label: string;
  kcal: number | null;
  mealType: "meal" | "snack";
  uses: number;
}

function Star({ filled = true, size = 11 }: { filled?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" />
    </svg>
  );
}

/**
 * The things you eat on purpose, one tap away.
 *
 * Separate from the "Again" row underneath, which is derived from repetition.
 * That one notices what you happen to eat a lot; this one holds what you
 * decided was worth naming — and the morning coffee belongs in the second list
 * long before it has earned a place in the first.
 */
export function Favourites({
  items,
  date,
  onLogged,
}: {
  items: FavouriteItem[];
  /** The day being logged to. */
  date: string;
  onLogged: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  if (items.length === 0) return null;

  const log = (id: number) => {
    if (navigator.vibrate) navigator.vibrate(10);
    start(async () => {
      await logFavourite(id, date);
      onLogged();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs flex items-center gap-1.5 text-crimson">
          <Star size={9} />
          Favourites
        </p>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="label-xs underline"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {editing ? (
        <ul className="panel divide-y divide-edge">
          {items.map((f) => (
            <li key={f.id}>
              <EditRow item={f} />
            </li>
          ))}
        </ul>
      ) : (
        // One row that scrolls, rather than a wrapping block that pushes the
        // day's log below the fold.
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {items.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={pending}
              onClick={() => log(f.id)}
              className="tap flex shrink-0 items-center gap-2 border border-crimson-dim px-3 py-1.5 text-xs text-ink active:border-crimson active:bg-crimson/15 disabled:opacity-50"
            >
              <span className="text-crimson">
                <Star />
              </span>
              <span className="max-w-[9rem] truncate">{f.label}</span>
              {f.kcal !== null ? (
                <span className="text-muted-dim tabular">{Math.round(f.kcal)}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditRow({ item }: { item: FavouriteItem }) {
  const router = useRouter();
  const [label, setLabel] = useState(item.label);
  const [pending, start] = useTransition();

  const save = () => {
    const next = label.trim();
    if (next === "" || next === item.label) {
      setLabel(item.label);
      return;
    }
    start(async () => {
      await renameFavourite(item.id, next);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`Rename ${item.label}`}
        className="tap min-w-0 flex-1 border border-edge bg-panel-2 px-2 text-sm text-ink outline-none focus:border-cobalt"
      />
      <span className="label-xs shrink-0 tabular">
        {item.kcal !== null ? `${Math.round(item.kcal)} kcal` : "—"}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await removeFavourite(item.normKey);
            router.refresh();
          })
        }
        aria-label={`Remove ${item.label} from favourites`}
        className="tap shrink-0 px-2 text-sm text-crimson disabled:opacity-40"
      >
        ✕
      </button>
    </div>
  );
}

/** The star on an entry row. Toggling it is the only way one gets created. */
export function FavouriteToggle({
  isFavourite,
  onToggle,
  pending,
}: {
  isFavourite: boolean;
  onToggle: () => void;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={isFavourite}
      className={`label-xs flex items-center gap-1.5 disabled:opacity-40 ${
        isFavourite ? "text-crimson" : "text-muted"
      }`}
    >
      <Star filled={isFavourite} />
      {isFavourite ? "Favourite" : "Add to favourites"}
    </button>
  );
}
