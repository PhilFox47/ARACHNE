import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readStored } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** Auth-gated image serving off the upload volume. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await isAuthed())) return new NextResponse("Not authorised.", { status: 401 });

  const { path } = await ctx.params;
  const stored = readStored(path.join("/"));
  if (!stored) return new NextResponse("Not found.", { status: 404 });

  return new NextResponse(new Uint8Array(stored.buf), {
    headers: {
      "content-type": stored.type,
      // Stored files are immutable — the name is a fresh UUID on every write.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
