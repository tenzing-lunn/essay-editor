import { requireAccount } from "@/lib/server/auth";
import { deleteEssay, patchEssay, PatchSchema, readEssay, saveEssay, SaveSchema } from "@/lib/server/essays";
import { json, parse, route } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json({ essay: await readEssay(account.id, (await params).id) });
}, false);

export const PUT = route(async (request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json(await saveEssay(account.id, (await params).id, await parse(request, SaveSchema)));
});

export const PATCH = route(async (request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json({ essay: await patchEssay(account.id, (await params).id, await parse(request, PatchSchema)) });
});

export const DELETE = route(async (_request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  await deleteEssay(account.id, (await params).id);
  return json({ ok: true });
});
