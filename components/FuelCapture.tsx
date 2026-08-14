"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPhoto, createEntry, quickLog } from "@/app/fuel/actions";
import { MAX_PHOTOS, PHOTO_KIND_LABEL, PHOTO_KIND_SHORT, type PhotoKind } from "@/lib/meal";
import { useVisualViewport } from "./useVisualViewport";
import { ANALYSING_PLACEHOLDER } from "@/lib/plan";
import { Favourites, type FavouriteItem } from "./Favourites";
import { WebLoader } from "./WebLoader";
import { SourceToggle, usePhotoSource, useRememberedSource } from "./PhotoSource";

interface Shot {
  dataUrl: string;
  kind: PhotoKind;
}

interface QuickItem {
  normKey: string;
  description: string;
  uses: number;
  kcal: number | null;
}

/** Client-side compression to a 1200px max edge before anything is uploaded. */
async function compress(file: File, maxEdge = 1200, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

export function FuelCapture({
  date,
  quickItems,
  favourites,
}: {
  /** The day being logged to — not always today, since any past day is editable. */
  date: string;
  quickItems: QuickItem[];
  favourites: FavouriteItem[];
}) {
  const router = useRouter();
  const picker = usePhotoSource({ multiple: true, onFiles: (files) => void onPhoto(files) });
  // "reading" is a plate; "describing" is words. Same call, and the loader must
  // not claim to be looking at a photograph that does not exist.
  const [busy, setBusy] = useState<null | "saving" | "reading" | "describing">(null);
  const [awaitingNote, setPending2] = useState<{ id: number; shots: Shot[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const finish = (msg: string) => {
    setBusy(null);
    setNote(msg);
    router.refresh();
    setTimeout(() => setNote(null), 3200);
  };

  const onPhoto = async (files: File[]) => {
    setBusy("saving");
    setNote(null);
    if (navigator.vibrate) navigator.vibrate(8);

    let shots: string[];
    try {
      shots = await Promise.all(files.slice(0, MAX_PHOTOS).map((f) => compress(f)));
    } catch {
      finish("Couldn't read that image.");
      return;
    }

    // Save first, before anyone types anything. The entry exists before the
    // model is ever called, so a slow analysis — or abandoning the note sheet
    // entirely — can never cost you the log.
    const created = await createEntry({
      description: ANALYSING_PLACEHOLDER,
      photos: shots.map((dataUrl) => ({ dataUrl, kind: "dish" as const })),
      date,
    });
    if (!created.ok) {
      finish(created.error);
      return;
    }

    setBusy(null);
    setPending2({ id: created.id, shots: shots.map((dataUrl) => ({ dataUrl, kind: "dish" })) });
    router.refresh();
  };

  /** A photo added from inside the sheet, after the entry already exists. */
  const onExtra = async (entryId: number, file: File, kind: PhotoKind) => {
    let dataUrl: string;
    try {
      dataUrl = await compress(file);
    } catch {
      return;
    }
    await addPhoto(entryId, dataUrl, kind);
    setPending2((p) => (p ? { ...p, shots: [...p.shots, { dataUrl, kind }] } : p));
  };

  /**
   * A photo can't show diameter, how much of it you ate, or the oil it was
   * cooked in — and portion inference is where these estimates go wrong. One
   * line of context is worth more than any amount of model tuning.
   */
  const analyse = async (entryId: number, hint: string, fromText = false) => {
    setPending2(null);
    setBusy(fromText ? "describing" : "reading");
    try {
      const res = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId, hint: hint.trim() || undefined }),
      });
      const body = await res.json();
      if (body.analysed) {
        if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
        finish("Logged.");
      } else {
        finish(`Saved without numbers — ${body.error ?? "the model didn't answer"}.`);
      }
    } catch {
      finish("Saved without numbers — the model didn't answer.");
    }
  };

  /**
   * A meal you forgot to photograph.
   *
   * This field has always existed and always produced a row with no numbers in
   * it — a name on the list and nothing counted, which is most of the way to
   * not logging it. The description is evidence too, and the model can estimate
   * from it; it just was never asked to.
   *
   * The entry is saved before the model runs, exactly as the photo path does,
   * so a slow or failed estimate can never cost you the log. The difference is
   * that here the description is already yours, so there is no placeholder —
   * the row reads correctly from the moment you press Add.
   */
  const onText = () => {
    const described = text.trim();
    if (described.length === 0) return;
    start(async () => {
      const res = await createEntry({ description: described, date });
      setText("");
      if (!res.ok) {
        finish("Couldn't save that.");
        return;
      }
      await analyse(res.id, "", true);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {picker.inputs}

      {/* The single biggest thing on the screen, and the first one your thumb
          reaches. If logging feels like work it stops happening.
          It opens the camera: a meal you have to save to your camera roll first
          is a meal that fills a gallery app with pictures of dinner. The photo
          you already took is one button lower. */}
      <button
        type="button"
        disabled={busy !== null}
        onClick={picker.openCamera}
        className="tap panel-hot flex min-h-[104px] w-full flex-col items-center justify-center gap-2 active:opacity-80 disabled:opacity-60"
      >
        {busy ? (
          <WebLoader
            size={38}
            label={
              busy === "saving"
                ? "Saving"
                : busy === "describing"
                  ? "Working it out from your description"
                  : "Reading the plate"
            }
          />
        ) : (
          <>
            <svg viewBox="0 0 100 100" width="34" height="34" fill="none" stroke="#D42A3F" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="50" cy="55" r="22" />
              <circle cx="50" cy="55" r="9" opacity="0.5" />
              <path d="M30 30 H70" />
            </svg>
            <span className="display text-lg tracking-widest text-ink">Take a photo</span>
            <span className="label-xs">Saves instantly</span>
          </>
        )}
      </button>

      {busy === null ? (
        <button
          type="button"
          onClick={picker.openLibrary}
          className="tap flex w-full items-center justify-center gap-2 border border-edge text-xs text-muted active:border-cobalt active:text-cobalt-lift"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="3" y="5" width="18" height="14" />
            <path d="M3 16l5-5 4 4 3-3 6 6" strokeLinejoin="round" />
            <circle cx="8.5" cy="9.5" r="1.4" />
          </svg>
          Choose from gallery
        </button>
      ) : null}

      {note ? (
        <p role="status" className="border border-edge bg-panel-2 px-3 py-2 text-center text-xs text-muted">
          {note}
        </p>
      ) : null}

      <p className="label-xs">
        No photo? Describe it — it gets the same estimate
      </p>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onText();
          }}
          placeholder="…or describe it instead"
          aria-label="Describe what you ate"
          className="tap min-w-0 flex-1 border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
        />
        <button
          type="button"
          disabled={pending || text.trim().length === 0}
          onClick={onText}
          className="tap display border border-edge px-4 text-xs tracking-widest text-muted disabled:opacity-30"
        >
          Add
        </button>
      </div>

      {awaitingNote ? (
        <NoteSheet
          shots={awaitingNote.shots}
          onAdd={(file, kind) => void onExtra(awaitingNote.id, file, kind)}
          onAnalyse={(hint) => void analyse(awaitingNote.id, hint)}
        />
      ) : null}

      <Favourites items={favourites} date={date} onLogged={() => finish("Logged.")} />

      {quickItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="label-xs">Again</p>
          {/* One row that scrolls, rather than a wrapping block that pushes the
              day's log below the fold. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {quickItems.map((q) => (
              <button
                key={q.normKey}
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await quickLog(q.normKey, date);
                    if (navigator.vibrate) navigator.vibrate(10);
                    finish("Logged.");
                  })
                }
                className="tap flex shrink-0 items-center gap-2 border border-edge px-3 py-1.5 text-xs text-ink active:border-crimson"
              >
                <span className="max-w-[9rem] truncate">{q.description}</span>
                {q.kcal !== null ? <span className="text-muted-dim tabular">{q.kcal}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Appears after the shot, before the model runs. The entry is already saved by
 * this point, so there is no way to lose it here — the only thing at stake is
 * how good the estimate will be.
 */
function NoteSheet({
  shots,
  onAdd,
  onAnalyse,
}: {
  shots: Shot[];
  onAdd: (file: File, kind: PhotoKind) => void;
  onAnalyse: (hint: string) => void;
}) {
  const [hint, setHint] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const [addKind, setAddKind] = useState<PhotoKind>("label");
  const [source, setSource] = useRememberedSource();
  const add = usePhotoSource({ onFiles: (files) => onAdd(files[0], addKind) });
  const vp = useVisualViewport();

  useEffect(() => {
    // Focus without yanking the keyboard up on a phone the moment it appears —
    // typing is optional, and forcing the keyboard makes it feel required.
    ref.current?.focus({ preventScroll: true });
  }, []);

  /**
   * Append, then put the caret back at the end. Without the explicit
   * selection reset the input keeps its old caret position, so anything typed
   * after tapping a chip lands in front of the word instead of after it.
   */
  const append = (word: string) => {
    setHint((v) => {
      const next = v.trim().length === 0 ? word : `${v.trim()}, ${word}`;
      queueMicrotask(() => {
        const el = ref.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(next.length, next.length);
      });
      return next;
    });
  };

  return (
    /*
     * Anchored to the top, not the bottom.
     *
     * A bottom sheet is the right shape for something you only tap, and the
     * wrong one for something you type into: the on-screen keyboard takes the
     * lower half of a phone and this sheet was underneath it. The panel now
     * hangs from the top and the dismiss area sits below it, so the field you
     * are typing in stays above the keyboard rather than behind it.
     *
     * Sized from the visual viewport rather than dvh, because iOS Safari does
     * not shrink the dynamic viewport when the keyboard opens — see
     * useVisualViewport. Until real numbers arrive, CSS is left to it.
     */
    <div
      className="fixed inset-x-0 top-0 z-40 flex h-dvh flex-col bg-base/80 backdrop-blur-sm"
      style={vp.ready ? { top: vp.offsetTop, height: vp.height } : undefined}
    >
      <div className="pad-safe-t panel mx-auto flex w-full max-w-lg flex-col gap-3 overflow-y-auto border-b-2 border-b-crimson p-4">
        <div className="flex flex-col gap-1">
          <p className="display text-base text-ink">Anything the photo misses?</p>
          <p className="text-xs leading-relaxed text-muted">
            Size, how much you ate, what it was cooked in. Optional — saved either way.
          </p>
        </div>

        {/* The shots so far, plus a way to add the one that actually carries the
            numbers. A photo of the Nährwerttabelle beats any amount of guessing
            at a plate, and the model is told which image is which. */}
        {add.inputs}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {shots.map((s, i) => (
            <span key={i} className="flex shrink-0 flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.dataUrl} alt="" className="h-16 w-16 border border-edge object-cover" />
              <span className="label-xs">{PHOTO_KIND_SHORT[s.kind]}</span>
            </span>
          ))}
          {shots.length < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={() => add.open(source)}
              className="tap flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 border border-dashed border-edge text-muted-dim active:border-cobalt"
            >
              <span className="text-lg leading-none">+</span>
              <span className="label-xs leading-none">Add</span>
            </button>
          ) : null}
        </div>

        {shots.length < MAX_PHOTOS ? (
          <div className="flex flex-col gap-2">
            <SourceToggle value={source} onChange={setSource} />
            <div className="flex flex-wrap gap-2">
            {(["label", "recipe", "dish"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setAddKind(k);
                  add.open(source);
                }}
                className="tap border border-edge px-2.5 py-1 text-xs text-muted active:border-cobalt active:text-cobalt-lift"
              >
                + {PHOTO_KIND_LABEL[k].toLowerCase()}
              </button>
            ))}
            </div>
          </div>
        ) : null}

        <input
          ref={ref}
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAnalyse(hint);
          }}
          enterKeyHint="done"
          placeholder="e.g. 30 cm pizza, ate two thirds"
          aria-label="Extra detail for the estimate"
          className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
        />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {["small", "large", "half of it", "homemade", "restaurant portion"].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => append(w)}
              className="shrink-0 border border-edge px-3 py-1.5 text-xs text-muted active:border-cobalt active:text-cobalt-lift"
            >
              {w}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onAnalyse(hint)}
          className="tap display w-full border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink active:opacity-80"
        >
          {hint.trim() ? "Analyse with this" : "Analyse"}
        </button>
      </div>

      {/* Tapping away analyses without a note rather than discarding: the entry
          and its photos are already saved, so the only thing on this sheet is
          optional context, and cancelling out of it should still get numbers. */}
      <button
        type="button"
        onClick={() => onAnalyse(hint)}
        aria-label="Analyse without adding anything"
        className="flex-1"
      />
    </div>
  );
}
