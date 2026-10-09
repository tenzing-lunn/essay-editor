import type { AiSettings } from "./ai-config";
import { EMPTY_AI_COST, addAiReceipts, validReceipt, type AiCost } from "./ai-cost.ts";

const STORAGE_KEY = "finals:ai:v1";
let current: AiSettings | null = null;
let loaded = false;
const COST_KEY = "finals:ai-cost:v1";
let cost: AiCost = { ...EMPTY_AI_COST };
let costLoaded = false;

export function readAiCost(): AiCost {
  if (!costLoaded && typeof window !== "undefined") {
    costLoaded = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(COST_KEY) ?? "null");
      if (saved && [saved.costUsd, saved.requests, saved.unpriced, saved.inputTokens, saved.outputTokens].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) && (saved.last === null || validReceipt(saved.last))) cost = saved;
    } catch { /* Keep counting in memory when storage is unavailable. */ }
  }
  return cost;
}

function saveAiCost(next: AiCost) {
  cost = next; costLoaded = true;
  try { sessionStorage.setItem(COST_KEY, JSON.stringify(cost)); } catch {}
  window.dispatchEvent(new Event("ai-cost-change"));
}

export function resetAiCost() { saveAiCost({ ...EMPTY_AI_COST }); }

function receiveUsage(value: unknown) {
  if (Array.isArray(value) && value.length) saveAiCost(addAiReceipts(readAiCost(), value.filter(validReceipt)));
}

export function readAiSettings(): AiSettings | null {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && (saved.provider === "anthropic" || saved.provider === "openai") && typeof saved.apiKey === "string" && saved.apiKey.trim()) {
        current = { provider: saved.provider, apiKey: saved.apiKey, economy: saved.economy !== false };
      }
    } catch { /* In-memory credentials still work when storage is unavailable. */ }
  }
  return current;
}

export function saveAiSettings(settings: AiSettings | null) {
  loaded = true;
  current = settings;
  try {
    if (settings) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* Keep the key only in memory. */ }
  window.dispatchEvent(new Event("ai-settings-change"));
}

export async function aiFetch(url: "/api/ai" | "/api/tutor" | "/api/ai/connection", init: RequestInit = {}) {
  const settings = readAiSettings();
  const headers = new Headers(init.headers);
  if (settings) {
    headers.set("x-ai-provider", settings.provider);
    headers.set("x-ai-key", settings.apiKey);
    headers.set("x-ai-economy", String(settings.economy));
  }
  // Never follow redirects carrying a credential to another destination.
  const response = await fetch(url, { ...init, headers, redirect: "error", cache: "no-store" });
  try { receiveUsage(JSON.parse(response.headers.get("x-ai-usage") ?? "[]")); } catch {}
  if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) return response;
  // Preserve the tutor's plain-text stream while handling usage receipts separately.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  const transformed = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = pending.indexOf("\n\n")) >= 0) {
        const frame = pending.slice(0, end); pending = pending.slice(end + 2);
        if (!frame.startsWith("data: ")) continue;
        const event = JSON.parse(frame.slice(6));
        if (typeof event.text === "string" && event.text) controller.enqueue(encoder.encode(event.text));
        receiveUsage(event.usage);
      }
    },
    flush() { if (pending.trim()) throw new Error("The tutor stream ended before usage could be received."); },
  }));
  const resultHeaders = new Headers(response.headers);
  resultHeaders.set("content-type", "text/plain; charset=utf-8");
  return new Response(transformed, { status: response.status, headers: resultHeaders });
}
