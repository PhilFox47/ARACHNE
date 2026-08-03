/**
 * Nano-GPT access. The API key is read here and here only — it never crosses
 * into a client component or a response body.
 *
 * The active vision model comes from the database first, environment second.
 * That ordering is what lets the model be swapped from the settings page
 * without editing .env and restarting the container.
 */

export interface ModelOption {
  id: string;
  name: string;
  inputPerM: number | null;
  outputPerM: number | null;
  /** Estimated cost per 1,000 meal photos, for ranking. */
  per1kMeals: number | null;
}

const IN_TOKENS_PER_MEAL = 1100;
const OUT_TOKENS_PER_MEAL = 150;

export function baseUrl(): string {
  return process.env.NANOGPT_BASE_URL ?? "https://nano-gpt.com/api/v1";
}

export function apiKey(): string | null {
  return process.env.NANOGPT_API_KEY || null;
}

export function envModel(): string | null {
  return process.env.NANOGPT_VISION_MODEL || null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Providers disagree on both the key names and the scale. Normalise to per-million. */
function pricing(m: Record<string, unknown>): { in: number | null; out: number | null } {
  const p = (m.pricing ?? m.cost ?? {}) as Record<string, unknown>;
  const raw = (a: string[]) => {
    for (const k of a) {
      const v = num(p[k]);
      if (v !== null) return v;
    }
    return null;
  };
  const scale = (v: number | null) => (v === null ? null : v < 0.001 ? v * 1e6 : v);
  return {
    in: scale(raw(["prompt", "input", "input_tokens", "prompt_tokens"])),
    out: scale(raw(["completion", "output", "output_tokens", "completion_tokens"])),
  };
}

function isVision(m: Record<string, unknown>): boolean {
  const arch = m.architecture as Record<string, unknown> | undefined;
  const mods = (arch?.input_modalities ?? m.input_modalities ?? m.modalities) as unknown;
  if (Array.isArray(mods) && mods.some((x) => /image|vision/i.test(String(x)))) return true;
  const mod = (arch?.modality ?? m.modality) as unknown;
  if (typeof mod === "string" && /image/i.test(mod)) return true;
  const caps = m.capabilities as Record<string, unknown> | undefined;
  if (caps && (caps.vision || caps.image_input)) return true;
  if (m.supports_vision === true || m.vision === true) return true;
  return /vision|-vl\b|\bvl-/i.test(String(m.id ?? ""));
}

/**
 * Fetches the live vision-capable model list, cheapest first.
 *
 * Throws on failure rather than returning an empty list — the settings page
 * needs to tell the difference between "no models" and "couldn't reach
 * Nano-GPT", so it can fall back to a free-text field instead of showing an
 * empty picker.
 */
export async function listVisionModels(): Promise<ModelOption[]> {
  const key = apiKey();
  if (!key) throw new Error("NANOGPT_API_KEY is not set.");

  const res = await fetch(`${baseUrl()}/models?detailed=true`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Nano-GPT returned ${res.status} ${res.statusText}`);

  const body = (await res.json()) as Record<string, unknown>;
  const raw = (Array.isArray(body) ? body : (body.data ?? body.models ?? [])) as Record<string, unknown>[];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("No models in the response.");

  return raw
    .filter(isVision)
    .map((m) => {
      const pr = pricing(m);
      const per1k =
        pr.in === null
          ? null
          : ((pr.in * IN_TOKENS_PER_MEAL + (pr.out ?? 0) * OUT_TOKENS_PER_MEAL) / 1e6) * 1000;
      return {
        id: String(m.id ?? m.name ?? ""),
        name: String(m.name ?? m.id ?? ""),
        inputPerM: pr.in,
        outputPerM: pr.out,
        per1kMeals: per1k === null ? null : Math.round(per1k * 1000) / 1000,
      };
    })
    .filter((m) => m.id.length > 0)
    .sort((a, b) => (a.inputPerM ?? Infinity) - (b.inputPerM ?? Infinity));
}
