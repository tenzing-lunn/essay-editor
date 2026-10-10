import type { Account } from "@/lib/api-types";
import { clientIp, refundSignup, reserveSignup, startSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";
import { fail, invalid, json, readJson, route } from "@/lib/server/http";
import { hashPassword, validateSignup } from "@/lib/server/password";

export const POST = route(async (request) => {
  const input = validateSignup(await readJson(request));
  if (!input.ok) return invalid(input.error);
  const { name, username, password } = input.value;
  const ip = clientIp(request);
  const wait = await reserveSignup(ip);
  if (wait) return fail(429, `Too many new accounts from this network. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`, "locked");
  const [account] = await sql<Account>(
    `INSERT INTO users (username, name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING RETURNING id, username, name`,
    [username, name, await hashPassword(password)]);
  if (!account) { await refundSignup(ip); return fail(409, "That username is taken. Try another one.", "taken"); }
  await sql(`DELETE FROM login_throttle WHERE username = $1`, [username]); // a new account starts with no failed attempts
  await startSession(account.id);
  return json({ account }, 201);
});
