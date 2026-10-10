import { requireAccount } from "@/lib/server/auth";
import { createEssay, CreateSchema, emptyTrash, isView, listEssays, SEARCH_MAX } from "@/lib/server/essays";
import { invalid, json, parse, route } from "@/lib/server/http";

const view = (request: Request) => new URL(request.url).searchParams.get("view") ?? "recent";

export const GET = route(async (request) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  const v = view(request), q = new URL(request.url).searchParams.get("q") ?? "";
  if (!isView(v)) return invalid("view must be recent, archived or trash.");
  if (q.length > SEARCH_MAX) return invalid(`Search for up to ${SEARCH_MAX} characters.`);
  return json({ essays: await listEssays(account.id, v, q) });
}, false);

// New essay, "Make a copy" (copyOf), or importing a draft kept in this browser before accounts existed.
export const POST = route(async (request) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json({ essay: await createEssay(account.id, await parse(request, CreateSchema)) }, 201);
});

export const DELETE = route(async (request) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  if (view(request) !== "trash") return invalid("Only the trash can be emptied: use ?view=trash.");
  await emptyTrash(account.id);
  return json({ ok: true });
});
