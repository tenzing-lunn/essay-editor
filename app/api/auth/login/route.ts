import { checkPassword, endSession, lockedMessage, startSession } from "@/lib/server/auth";
import { fail, invalid, json, readJson, route } from "@/lib/server/http";
import { normalizeUsername } from "@/lib/server/password";
import { PASSWORD_MAX } from "@/lib/api-types";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  if (!username || typeof body.password !== "string" || !body.password) return invalid("Enter your username and password.");
  const check = await checkPassword(username, body.password.slice(0, PASSWORD_MAX + 1));
  if (!check.ok) return check.lockedMinutes ? fail(429, lockedMessage(check.lockedMinutes), "locked") : fail(401, "Wrong username or password.");
  await endSession();
  await startSession(check.account.id);
  return json({ account: check.account });
});
