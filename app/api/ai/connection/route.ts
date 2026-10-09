import { withAiUsage } from "@/lib/ai-usage";
import { z } from "zod";
import { resolveAiCredentials, publicAiError } from "@/lib/ai-config";
import { structuredAi } from "@/lib/ai-provider";
import { rejectCrossSite } from "@/lib/same-origin";

async function handlePost(request: Request) {
  try {
    const credentials = resolveAiCredentials(request.headers, process.env, false);
    await structuredAi(credentials, z.object({ connected: z.boolean() }), "Return connected: true as JSON.", "Test connection.", 64);
    return Response.json({ ok: true, model: credentials.model }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = publicAiError(error);
    return Response.json({ error: failure.error }, { status: failure.status });
  }
}

export function POST(request: Request) {
  const blocked = rejectCrossSite(request); if (blocked) return blocked;
  return withAiUsage(() => handlePost(request));
}
