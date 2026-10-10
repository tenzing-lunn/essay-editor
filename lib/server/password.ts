// Pure password hashing and sign-up validation; no Next or database imports so scripts/check_auth.cjs can test it directly.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE } from "../api-types.ts";

const N = 16384, R = 8, P = 1, KEY = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize("NFKC"), salt, length, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));
}

/** `scrypt$N$r$p$saltB64$hashB64`; the parameters travel with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${(await derive(password, salt, N, R, P, KEY)).toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const [cost, block, par] = [n, r, p].map(Number);
  if (![cost, block, par].every(Number.isSafeInteger) || cost < 2 || cost > 1 << 20 || block < 1 || block > 32 || par < 1 || par > 16) return false;
  const expected = Buffer.from(hash, "base64");
  if (expected.length < 16) return false;
  return timingSafeEqual(await derive(password, Buffer.from(salt, "base64"), cost, block, par, expected.length), expected);
}

// Unknown usernames still pay for one scrypt, so response time doesn't reveal which accounts exist.
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEY).toString("base64")}`;

export const normalizeUsername = (username: unknown) => typeof username === "string" ? username.trim().toLowerCase() : "";

export type SignupInput = { name: string; username: string; password: string };
export function validateSignup(body: unknown): { ok: true; value: SignupInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.replaceAll("\0", "").trim().replace(/\s+/g, " ") : ""; // Postgres text rejects U+0000
  const username = normalizeUsername(b.username);
  const password = typeof b.password === "string" ? b.password : "";
  if (!name) return { ok: false, error: "Enter your name." };
  if (name.length > NAME_MAX) return { ok: false, error: `Keep your name under ${NAME_MAX + 1} characters.` };
  if (username.length < 3 || username.length > 32) return { ok: false, error: "Choose a username of 3 to 32 characters." };
  if (!USERNAME_RE.test(username)) return { ok: false, error: "Usernames use letters, numbers, dots, dashes and underscores, and start with a letter or number." };
  return validatePassword(password) ?? { ok: true, value: { name, username, password } };
}

export function validatePassword(password: unknown): { ok: false; error: string } | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) return { ok: false, error: `Use a password of at least ${PASSWORD_MIN} characters.` };
  if (password.length > PASSWORD_MAX) return { ok: false, error: `Keep your password under ${PASSWORD_MAX + 1} characters.` };
  return null;
}
