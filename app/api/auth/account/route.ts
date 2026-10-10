import { checkPassword, endSession, lockedMessage, requireAccount } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";
import { fail, invalid, json, readJson, route } from "@/lib/server/http";

// Deleting the user cascades to sessions, essays, versions and books.
export const DELETE = route(async (request) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  const { password } = await readJson(request);
  if (typeof password !== "string" || !password) return invalid("Enter your password to delete your account.");
  const check = await checkPassword(account.username, password);
  if (!check.ok) return check.lockedMinutes ? fail(429, lockedMessage(check.lockedMinutes), "locked") : invalid("Wrong password.");
  await sql(`DELETE FROM users WHERE id = $1`, [account.id]);
  await sql(`DELETE FROM login_throttle WHERE username = $1`, [account.username]);
  await endSession();
  return json({ ok: true });
});
