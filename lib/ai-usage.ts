import { AsyncLocalStorage } from "node:async_hooks";
import { estimateAiCost, type AiReceipt } from "./ai-cost.ts";
import type { AiCredentials } from "./ai-config";

const usage = new AsyncLocalStorage<AiReceipt[]>();
export function recordAiUsage(credentials: AiCredentials, data: unknown, model = credentials.model) {
  usage.getStore()?.push(estimateAiCost(credentials.provider, model, data));
}

// Every visitor's receipts are scoped to their request.
export function withAiUsage(handler: () => Promise<Response>): Promise<Response> {
  const receipts: AiReceipt[] = [];
  return usage.run(receipts, async () => {
    const response = await handler();
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-ai-usage", JSON.stringify(receipts));
    return new Response(response.body, { status: response.status, headers });
  });
}
