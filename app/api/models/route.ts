import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listVisionModels } from "@/lib/nanogpt";

export const dynamic = "force-dynamic";

/**
 * Live vision-model list for the settings picker. Runs server-side so the API
 * key stays put — the client only ever sees model IDs and prices.
 */
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  try {
    const models = await listVisionModels();
    return NextResponse.json({ ok: true, models });
  } catch (err) {
    // A reachability failure is expected and recoverable — the settings page
    // falls back to a free-text field. Report it rather than pretending the
    // list is empty.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error." },
      { status: 200 },
    );
  }
}
