import { AsyncLocalStorage } from "node:async_hooks";
import { estimateAiCost, type AiReceipt } from "./ai-cost.ts";
import type { AiCredentials } from "./ai-config";

const usage = new AsyncLocalStorage<AiReceipt[]>();
export function recordAiUsage(credentials: AiCredentials, data: unknown, model = credentials.model) {
  usage.getStore()?.push(estimateAiCost(credentials.provider, model, data));
}

// Every visitor's receipts are scoped to their request, including streamed work.
export function withAiUsage(handler: () => Promise<Response>, streaming = false): Promise<Response> {
  const receipts: AiReceipt[] = [];
  return usage.run(receipts, async () => {
    const response = await handler();
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    if (!streaming || !response.ok || !response.body) {
      headers.set("x-ai-usage", JSON.stringify(receipts));
      return new Response(response.body, { status: response.status, headers });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    headers.set("content-type", "text/event-stream; charset=utf-8");
    headers.delete("content-length");
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (!chunk.done) {
            const text = decoder.decode(chunk.value, { stream: true });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          } else {
            const text = decoder.decode();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text, usage: receipts })}\n\n`));
            controller.close();
          }
        } catch (error) { controller.error(error); }
      },
      cancel(reason) { return reader.cancel(reason); },
    }), { status: response.status, headers });
  });
}
