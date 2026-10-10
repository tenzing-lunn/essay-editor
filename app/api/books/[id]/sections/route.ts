import { requireAccount } from "@/lib/server/auth";
import { appendSections, AppendSchema, readSectionPage } from "@/lib/server/books";
import { invalid, json, parse, route } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

// ?position=&offset= pages through the text; follow `next` until it is null.
export const GET = route(async (request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  const query = new URL(request.url).searchParams;
  const [position, offset] = [query.get("position") ?? "0", query.get("offset") ?? "0"].map(Number);
  if (![position, offset].every((n) => Number.isSafeInteger(n) && n >= 0)) return invalid("position and offset must be whole numbers.");
  return json(await readSectionPage(account.id, (await params).id, position, offset));
}, false);

export const POST = route(async (request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json({ book: await appendSections(account.id, (await params).id, await parse(request, AppendSchema)) });
});
