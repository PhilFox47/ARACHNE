/**
 * Just the cookie name, in its own module with no Node built-ins.
 *
 * middleware.ts runs on the edge runtime and cannot import node:crypto, so it
 * must not reach into lib/auth.ts — importing the constant from there drags the
 * whole HMAC implementation into the edge bundle and the build fails.
 */
export const SESSION_COOKIE = "arachne_session";
