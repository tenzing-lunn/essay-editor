import { requireAccount } from "@/lib/server/auth";
import { recordCheck } from "@/lib/server/checks";
import { json, parse, route } from "@/lib/server/http";
import { CheckInput } from "@/lib/writer-memory";

type Context = { params: Promise<{ id: string }> };

// The client reports a grade or a live check after the AI route returns it. The AI route itself stays account-free, because
// visitors with their own key can use it signed out; they simply build no memory.
export const POST = route(async (request, { params }: Context) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  await recordCheck(account.id, (await params).id, await parse(request, CheckInput));
  return json({ ok: true });
});
