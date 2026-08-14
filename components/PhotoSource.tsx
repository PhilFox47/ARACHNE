"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Camera or gallery, chosen rather than assumed.
 *
 * A file input with `accept="image/*"` and nothing else lets the browser decide
 * what opens, and on a phone that is usually the photo library — so logging a
 * meal meant saving it to your camera roll first, and a gallery app filling up
 * with pictures of dinner. Adding `capture="environment"` fixes that and breaks
 * the other half: it opens the camera and nothing else, so a photo you already
 * took becomes unreachable.
 *
 * Both, then. Two inputs, because `capture` is an attribute of the element and
 * not of the click — one element cannot be both — and because `capture` also
 * suppresses `multiple`, so the camera takes one shot at a time and the library
 * takes as many as you like.
 */

const STORE_KEY = "arachne.photoSource";

export type PhotoSource = "camera" | "library";

export function preferredSource(): PhotoSource {
  if (typeof window === "undefined") return "camera";
  return window.localStorage.getItem(STORE_KEY) === "library" ? "library" : "camera";
}

function remember(s: PhotoSource) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORE_KEY, s);
}

export function usePhotoSource({
  multiple = false,
  onFiles,
}: {
  /** Only ever honoured by the library input — `capture` overrides it. */
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Held in a ref so the inputs below never close over a stale handler.
  const handler = useRef(onFiles);
  handler.current = onFiles;

  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Cleared before the callback: an unchanged value fires no change event, so
    // photographing the same thing twice in a row would silently do nothing.
    e.target.value = "";
    if (files.length > 0) handler.current(files);
  };

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={take}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={take}
      />
    </>
  );

  const openCamera = useCallback(() => cameraRef.current?.click(), []);
  const openLibrary = useCallback(() => libraryRef.current?.click(), []);
  const open = useCallback(
    (source: PhotoSource) => (source === "camera" ? cameraRef.current : libraryRef.current)?.click(),
    [],
  );

  return { inputs, openCamera, openLibrary, open };
}

/**
 * The choice, where showing two buttons per kind of photo would mean six.
 *
 * The note sheet and the entry sheet both already ask *what* the photo is — the
 * label, the recipe, the dish — so asking *where it comes from* on every one of
 * those would multiply the row. One remembered setting above them costs a tap
 * once and none afterwards.
 */
export function SourceToggle({
  value,
  onChange,
}: {
  value: PhotoSource;
  onChange: (s: PhotoSource) => void;
}) {
  const pick = (s: PhotoSource) => {
    onChange(s);
    remember(s);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="label-xs">Photos from</span>
      <div className="flex border border-edge">
        {(["camera", "library"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pick(s)}
            aria-pressed={value === s}
            className={`px-2.5 py-1 text-xs ${
              value === s ? "bg-cobalt/20 text-cobalt-lift" : "text-muted-dim"
            }`}
          >
            {s === "camera" ? "Camera" : "Gallery"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Reads the remembered choice after mount — localStorage has no server side. */
export function useRememberedSource(): [PhotoSource, (s: PhotoSource) => void] {
  const [source, setSource] = useState<PhotoSource>("camera");
  useEffect(() => setSource(preferredSource()), []);
  return [source, setSource];
}
