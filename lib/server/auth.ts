// Username + password accounts with opaque session cookies. The database stores only sha256(token).
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import type { Account } from "../api-types";
import { USERNAME_RE } from "../api-types";
import { sql } from "./db";
import { noNul, unauthenticated } from "./http";
import { DUMMY_HASH, verifyPassword } from "./password";

export const SESSION_COOKIE = "essay_session";
const SESSION_DAYS = 30, RENEW_DAYS = 15, MAX_FAILURES = 10, LOCK_MINUTES = 15;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: SESSION_DAYS * 86400 });

/** Creates a session and sets its cookie. Route handlers only. */
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await sql(`DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()`, [userId]);
  await sql(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [hashToken(token), userId, SESSION_DAYS]);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions());
}

/** Deletes this browser's session row and cookie. Route handlers only. */
export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await sql(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
  store.delete(SESSION_COOKIE);
}

/**
 * The signed-in account, or null. Works in Server Components and route handlers.
 * Sliding renewal re-sets the cookie, which only route handlers may do; in a Server Component the set throws and renewal waits for the next API call.
 */
export const currentAccount = cache(async (): Promise<Account | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const hash = hashToken(token);
  const [row] = await sql<Account & { expired: boolean; renew: boolean }>(
    `SELECT u.id, u.username, u.name, s.expires_at <= now() AS expired, s.expires_at < now() + make_interval(days => $2) AS renew
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`, [hash, RENEW_DAYS]);
  if (!row || row.expired) {
    if (row) await sql(`DELETE FROM sessions WHERE token_hash = $1`, [hash]);
    try { store.delete(SESSION_COOKIE); } catch {}
    return null;
  }
  if (row.renew) {
    try {
      store.set(SESSION_COOKIE, token, cookieOptions());
      await sql(`UPDATE sessions SET expires_at = now() + make_interval(days => $2) WHERE token_hash = $1`, [hash, SESSION_DAYS]);
    } catch {} // Server Component: cookies are read-only here
  }
  return { id: row.id, username: row.username, name: row.name };
});

/** The signed-in account, or a 401 Response to return as is. */
export async function requireAccount(): Promise<Account | Response> {
  return await currentAccount() ?? unauthenticated();
}

export type PasswordCheck = { ok: true; account: Account } | { ok: false; lockedMinutes?: number };

/**
 * Verifies a password with a per-username lockout: MAX_FAILURES attempts without a success lock the username for LOCK_MINUTES.
 * Each attempt reserves its slot before the (slow) hash check, so parallel guesses can't all slip in before the count catches up,
 * and a correct password is refused while the username is locked.
 * Unknown usernames are throttled and hashed the same way, so neither timing nor lockouts reveal which accounts exist.
 */
export async function checkPassword(username: string, password: string): Promise<PasswordCheck> {
  const key = noNul(username).slice(0, 64);
  if (Math.random() < 0.05) await sql(`DELETE FROM login_throttle WHERE updated_at < now() - interval '1 day'`);
  // An expired lock starts a fresh count; going over MAX_FAILURES locks at once, without checking the password.
  const [slot] = await sql<{ attempt: number; minutes: number | null }>(
    `INSERT INTO login_throttle (username, failures) VALUES ($1, 1)
     ON CONFLICT (username) DO UPDATE SET
       failures = CASE WHEN login_throttle.locked_until <= now() THEN 1 ELSE login_throttle.failures + 1 END,
       locked_until = CASE
         WHEN login_throttle.locked_until <= now() THEN NULL
         WHEN login_throttle.locked_until IS NULL AND login_throttle.failures + 1 > $2 THEN now() + make_interval(mins => $3)
         ELSE login_throttle.locked_until END,
       updated_at = now()
     RETURNING failures AS attempt, ceil(extract(epoch from locked_until - now()) / 60)::int AS minutes`, [key, MAX_FAILURES, LOCK_MINUTES]);
  if (slot.minutes !== null) return { ok: false, lockedMinutes: Math.max(1, slot.minutes) };
  const [user] = USERNAME_RE.test(username)
    ? await sql<Account & { password_hash: string }>(`SELECT id, username, name, password_hash FROM users WHERE username = $1`, [username])
    : [];
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (user && valid) {
    // Reset the count, unless parallel attempts locked the username meanwhile: then even the right password waits.
    const [after] = await sql<{ minutes: number | null }>(
      `UPDATE login_throttle SET failures = CASE WHEN locked_until > now() THEN failures ELSE 0 END, updated_at = now()
       WHERE username = $1 RETURNING CASE WHEN locked_until > now() THEN ceil(extract(epoch from locked_until - now()) / 60)::int END AS minutes`, [key]);
    if (after?.minutes != null) return { ok: false, lockedMinutes: Math.max(1, after.minutes) };
    return { ok: true, account: { id: user.id, username: user.username, name: user.name } };
  }
  if (slot.attempt < MAX_FAILURES) return { ok: false };
  await sql(`UPDATE login_throttle SET locked_until = coalesce(locked_until, now() + make_interval(mins => $2)), updated_at = now() WHERE username = $1`, [key, LOCK_MINUTES]);
  return { ok: false, lockedMinutes: LOCK_MINUTES };
}

/** The client's IP: the first x-forwarded-for hop, which Vercel sets itself and clients can't spoof there. */
export const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "unknown";

// SIGNUP_LIMIT_PER_HOUR (default 5; 0 turns it off) new accounts per client IP in a fixed one-hour window.
// Loopback is exempt so local development and its test runs aren't throttled; on Vercel the client IP is never loopback.
const LOOPBACK = /^(?:127\.|::1$|::ffff:127\.)/;
const signupLimit = () => { const n = Number(process.env.SIGNUP_LIMIT_PER_HOUR ?? 5); return Number.isFinite(n) && n >= 0 ? n : 5; };

/** Reserves one sign-up for this IP before the account is created; returns minutes to wait when over the limit. */
export async function reserveSignup(ip: string): Promise<number | null> {
  const limit = signupLimit();
  if (!limit || LOOPBACK.test(ip)) return null;
  if (Math.random() < 0.05) await sql(`DELETE FROM signup_throttle WHERE window_start < now() - interval '1 hour'`);
  const [row] = await sql<{ count: number; minutes: number }>(
    `INSERT INTO signup_throttle (ip, count) VALUES ($1, 1)
     ON CONFLICT (ip) DO UPDATE SET
       count = CASE WHEN signup_throttle.window_start <= now() - interval '1 hour' THEN 1 ELSE signup_throttle.count + 1 END,
       window_start = CASE WHEN signup_throttle.window_start <= now() - interval '1 hour' THEN now() ELSE signup_throttle.window_start END
     RETURNING count, ceil(extract(epoch from window_start + interval '1 hour' - now()) / 60)::int AS minutes`, [noNul(ip).slice(0, 100)]);
  return row.count > limit ? Math.max(1, row.minutes) : null;
}

/** Gives back a reservation that didn't create an account (the username was taken). */
export const refundSignup = (ip: string) => sql(`UPDATE signup_throttle SET count = count - 1 WHERE ip = $1 AND count > 0`, [noNul(ip).slice(0, 100)]);

export const lockedMessage = (minutes: number) => `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
