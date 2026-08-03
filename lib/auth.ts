import crypto from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };

/** A year. The brief is explicit: don't make me log in constantly. */
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.APP_PASSWORD;
  if (!s) {
    throw new Error("Neither SESSION_SECRET nor APP_PASSWORD is set. See .env.example.");
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths separately —
  // length is not the secret here, the value is.
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(input, expected);
}

export function issueToken(): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  return `${expires}.${sign(String(expires))}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const expires = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!safeEqual(mac, sign(expires))) return false;
  const exp = Number(expires);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_SEC,
  secure: process.env.COOKIE_SECURE === "true",
} as const;
