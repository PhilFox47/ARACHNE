import fs from "node:fs";
import { isAuthed } from "@/lib/auth";
import { backupDbPath } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * Downloads one backup's database file.
 *
 * A route rather than a server action because the deliverable is a file the
 * browser saves — that needs a URL. The date is validated inside
 * `backupDbPath`, which builds the path from the backup directory rather than
 * from anything in the request, so there is no traversal to defend against
 * here.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  if (!(await isAuthed())) return new Response("Not authorised.", { status: 401 });

  const { date } = await params;
  const file = backupDbPath(date);
  if (!file) return new Response("No such backup.", { status: 404 });

  const body = fs.readFileSync(file);
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/vnd.sqlite3",
      "content-length": String(body.byteLength),
      "content-disposition": `attachment; filename="arachne-${date}.db"`,
      "cache-control": "no-store",
    },
  });
}
