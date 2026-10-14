import { withAiUsage } from "@/lib/ai-usage";
import { z } from "zod";
import { resolveAiCredentials } from "@/lib/ai-config";
import { structuredAi } from "@/lib/ai-provider";
import { freeConnection, freeGate, freeStatus } from "@/lib/server/ai-quota";
import { currentAccount } from "@/lib/server/auth";
import { rejectCrossSite } from "@/lib/same-origin";

// Without a key, on the free allowance, the test spends nothing and reports what is left; otherwise it tests the key with the provider.
const handlePost = async (request: Request) => await freeConnection(request.headers, process.env, currentAccount) ?? freeGate(request.headers, process.env, currentAccount, async () => {
  const credentials = resolveAiCredentials(request.headers, process.env, false);
  await structuredAi(credentials, z.object({ connected: z.boolean() }), "Return connected: true as JSON.", "Test connection.", 64);
  return { ok: true, model: credentials.model };
});

/** The count for the AI button on page load, read without spending a check. */
export const GET = (request: Request) => freeStatus(request.headers, process.env, currentAccount);

export function POST(request: Request) {
  const blocked = rejectCrossSite(request); if (blocked) return blocked;
  return withAiUsage(() => handlePost(request));
}
