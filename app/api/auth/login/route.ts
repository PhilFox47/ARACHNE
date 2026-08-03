import { NextResponse } from "next/server";
import { checkPassword, issueToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!checkPassword(password)) {
    // A uniform delay so a wrong password can't be distinguished by timing.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, issueToken(), sessionCookieOptions);
  return res;
}
