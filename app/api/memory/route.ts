import { requireAccount } from "@/lib/server/auth";
import { listChecks } from "@/lib/server/checks";
import { json, route } from "@/lib/server/http";
import { buildMemory } from "@/lib/writer-memory";

export const GET = route(async () => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json({ memory: buildMemory(await listChecks(account.id)) });
}, false);
