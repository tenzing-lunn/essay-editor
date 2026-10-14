import { requireAccount } from "@/lib/server/auth";
import { fail, json, parse, route } from "@/lib/server/http";
import { encodeShare, ShareRequest, shareEnabled } from "@/lib/server/share";

// Mints a signed report link from the editor's current grade. Nothing is stored: the link is the report.
export const POST = route(async (request) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  if (!shareEnabled()) return fail(503, "Sharing is not set up on this instance.");
  const payload = await parse(request, ShareRequest);
  return json({ url: `${new URL(request.url).origin}/r?d=${encodeShare(payload)}` });
});
