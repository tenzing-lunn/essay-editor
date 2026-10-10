import { requireAccount } from "@/lib/server/auth";
import { readVersion } from "@/lib/server/essays";
import { json, route } from "@/lib/server/http";

export const GET = route(async (_request, { params }: { params: Promise<{ id: string; versionId: string }> }) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  const { id, versionId } = await params;
  return json({ version: await readVersion(account.id, id, versionId) });
}, false);
