"use client";

/**
 * The timer's voice.
 *
 * Tones are synthesised rather than shipped as files: three beeps as audio
 * assets would be more bytes than the whole of this module, would need
 * decoding, and would be one more thing to cache for a PWA that is expected to
 * work with no network.
 *
 * Two things about browsers make this fiddlier than it looks.
 *
 *   An AudioContext starts suspended and only a real user gesture may resume
 *   it. So `primeSound` is called from the tap that opens the timer, not from
 *   the timer itself — by the time a countdown is running there is no gesture
 *   left to borrow, and every tone would be silently dropped.
 *
 *   iOS routes Web Audio through the ringer channel, so a phone with the side
 *   switch flicked to silent will play none of this. Nothing on the web can
 *   override that. The vibration stays for exactly this reason, and the timer
 *   says so where it is relevant.
 */

let ctx: AudioContext | null = null;

const STORE_KEY = "arachne.holdSound";

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORE_KEY) !== "off";
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, on ? "on" : "off");
}

/**
 * Must be called synchronously inside a click or tap. Creating the context and
 * resuming it anywhere else leaves it suspended on iOS and throttled on some
 * Android builds, and every later tone is a no-op with no error to notice.
 */
export function primeSound(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** A context that was suspended by backgrounding comes back mute otherwise. */
export function wakeSound(): void {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

export function releaseSound(): void {
  const c = ctx;
  ctx = null;
  void c?.close().catch(() => {});
}

interface Note {
  /** Hz. */
  hz: number;
  /** Seconds from the start of the sequence. */
  at: number;
  /** Seconds. */
  len: number;
  /** 0–1, before the envelope. */
  gain: number;
}

/**
 * Triangle rather than sine: a sine at 900 Hz disappears under breathing and a
 * bit of room noise, and a square is unpleasant at the volume this needs to be.
 * Every note gets a short attack and a real release, because a hard-edged
 * oscillator start is heard as a click before it is heard as a pitch.
 */
function play(notes: Note[]): void {
  if (!ctx || !soundEnabled()) return;
  const c = ctx;
  const t0 = c.currentTime + 0.01;

  for (const n of notes) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(n.hz, t0 + n.at);

    amp.gain.setValueAtTime(0.0001, t0 + n.at);
    amp.gain.exponentialRampToValueAtTime(n.gain, t0 + n.at + 0.012);
    amp.gain.setValueAtTime(n.gain, t0 + n.at + n.len - 0.05);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);

    osc.connect(amp).connect(c.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.len + 0.02);
  }
}

/** One of the five counting you in. Deliberately small and unremarkable. */
export const soundLeadTick = () => play([{ hz: 660, at: 0, len: 0.07, gain: 0.16 }]);

/** The clock has started. A rising pair — unmistakably "go", not "stop". */
export const soundStart = () =>
  play([
    { hz: 784, at: 0, len: 0.11, gain: 0.3 },
    { hz: 1175, at: 0.11, len: 0.22, gain: 0.34 },
  ]);

/**
 * The target is cleared and you may come out of it.
 *
 * The one sound that has to be heard through a shaking plank and a heartbeat in
 * your ears, so it is the longest, the loudest and the only one with three
 * notes — a rising triad nothing else in the app resembles.
 */
export const soundTarget = () =>
  play([
    { hz: 1047, at: 0, len: 0.13, gain: 0.36 },
    { hz: 1319, at: 0.14, len: 0.13, gain: 0.36 },
    { hz: 1568, at: 0.28, len: 0.42, gain: 0.4 },
  ]);

/** Every thirty seconds past the target, or from the start of a max hold. */
export const soundTick = () => play([{ hz: 880, at: 0, len: 0.06, gain: 0.14 }]);

/** Logged. A falling pair, so it can never be mistaken for the start. */
export const soundStop = () =>
  play([
    { hz: 660, at: 0, len: 0.08, gain: 0.22 },
    { hz: 440, at: 0.09, len: 0.16, gain: 0.22 },
  ]);
