import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Redirect-only gate. This checks that a session cookie *exists*, not that it is
 * valid — signature verification needs the secret and node:crypto, neither of
 * which belongs in the edge runtime.
 *
 * That is safe because it is not the enforcement point: every page calls
 * isAuthed() and every server action calls guard(), both of which verify the
 * HMAC properly. A forged cookie gets past this and is rejected one layer in.
 * The only job here is avoiding a flash of protected layout before the redirect.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const open =
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/health" ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js";

  if (open) return NextResponse.next();

  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
