#!/usr/bin/env node
/**
 * Lists cheap vision-capable models from Nano-GPT so you can pick NANOGPT_VISION_MODEL.
 *
 *   NANOGPT_API_KEY=sk-... node scripts/list-vision-models.mjs
 *   NANOGPT_API_KEY=sk-... node scripts/list-vision-models.mjs --all
 *
 * Sorted cheapest-first by input price. The "est. cost / 1k meals" column assumes
 * roughly 1.1k input tokens per compressed 1200px photo plus ~150 output tokens.
 */

const BASE_URL = process.env.NANOGPT_BASE_URL ?? "https://nano-gpt.com/api/v1";
const KEY = process.env.NANOGPT_API_KEY;
const SHOW_ALL = process.argv.includes("--all");

if (!KEY) {
  console.error("NANOGPT_API_KEY is not set.");
  process.exit(1);
}

const IN_TOKENS_PER_MEAL = 1100;
const OUT_TOKENS_PER_MEAL = 150;

const num = (v) => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

/** Pricing shows up under several key spellings depending on the upstream provider. */
function pricing(m) {
  const p = m.pricing ?? m.cost ?? {};
  const inp =
    num(p.prompt) ?? num(p.input) ?? num(p.input_tokens) ?? num(p.prompt_tokens);
  const out =
    num(p.completion) ?? num(p.output) ?? num(p.output_tokens) ?? num(p.completion_tokens);
  // Some feeds quote per-token, others per-million. Normalise to per-million.
  const scale = (v) => (v == null ? null : v < 0.001 ? v * 1e6 : v);
  return { in: scale(inp), out: scale(out) };
}

function isVision(m) {
  const mods = m.architecture?.input_modalities ?? m.input_modalities ?? m.modalities ?? [];
  if (Array.isArray(mods) && mods.some((x) => /image|vision/i.test(String(x)))) return true;
  const mod = m.architecture?.modality ?? m.modality;
  if (typeof mod === "string" && /image/i.test(mod)) return true;
  if (m.capabilities && typeof m.capabilities === "object") {
    if (m.capabilities.vision || m.capabilities.image_input) return true;
  }
  if (m.supports_vision === true || m.vision === true) return true;
  return /vision|-vl\b|\bvl-/i.test(String(m.id ?? ""));
}

const res = await fetch(`${BASE_URL}/models?detailed=true`, {
  headers: { Authorization: `Bearer ${KEY}` },
});

if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}`);
  console.error((await res.text()).slice(0, 600));
  process.exit(1);
}

const body = await res.json();
const models = Array.isArray(body) ? body : (body.data ?? body.models ?? []);
if (!models.length) {
  console.error("No models in response. Raw shape:", Object.keys(body).join(", "));
  process.exit(1);
}

const rows = models
  .filter(isVision)
  .map((m) => {
    const pr = pricing(m);
    const per1k =
      pr.in == null
        ? null
        : ((pr.in * IN_TOKENS_PER_MEAL + (pr.out ?? 0) * OUT_TOKENS_PER_MEAL) / 1e6) * 1000;
    return { id: m.id ?? m.name, in: pr.in, out: pr.out, per1k };
  })
  .sort((a, b) => (a.in ?? Infinity) - (b.in ?? Infinity));

const shown = SHOW_ALL ? rows : rows.slice(0, 25);
const w = Math.max(20, ...shown.map((r) => String(r.id).length));
const fmt = (v, d) => (v == null ? "—" : v.toFixed(d));

console.log(`\n${rows.length} vision-capable model(s)${SHOW_ALL ? "" : ` — showing ${shown.length}`}\n`);
console.log(
  `${"MODEL ID".padEnd(w)}  ${"$/M in".padStart(9)}  ${"$/M out".padStart(9)}  ${"$/1k meals".padStart(11)}`,
);
console.log("-".repeat(w + 36));
for (const r of shown) {
  console.log(
    `${String(r.id).padEnd(w)}  ${fmt(r.in, 3).padStart(9)}  ${fmt(r.out, 3).padStart(9)}  ${fmt(r.per1k, 3).padStart(11)}`,
  );
}
console.log(`\nSet the winner as NANOGPT_VISION_MODEL in .env\n`);
