import { requireAccount } from "@/lib/server/auth";
import { removeBook, renameBook, RenameSchema } from "@/lib/server/books";
import { json, parse, route } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  const { title } = await parse(request, RenameSchema);
  return json({ book: await renameBook(account.id, (await params).id, title) });
});

export const DELETE = route(async (_request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  await removeBook(account.id, (await params).id);
  return json({ ok: true });
});
