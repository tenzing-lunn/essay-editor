import type { AiSettings } from "./ai-config";
import type { WritingProfile } from "./essay-workflow";
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

// The current essay's writing profile rides along with every feedback request.
let writing: { profile: WritingProfile; thesis: string; targetWords: number } | null = null;
export function setAiWriting(next: typeof writing) { writing = next; }

export async function aiFetch(url: "/api/ai" | "/api/tutor" | "/api/ai/connection", init: RequestInit = {}, candidate?: AiSettings) {
  const settings = candidate ?? readAiSettings(); // a candidate key is tested before it is saved
  const headers = new Headers(init.headers);
  if (settings) {
    headers.set("x-ai-provider", settings.provider);
    headers.set("x-ai-key", settings.apiKey);
    headers.set("x-ai-economy", String(settings.economy));
  }
  const body = url === "/api/ai" && writing && typeof init.body === "string" ? JSON.stringify({ ...JSON.parse(init.body), writing }) : init.body;
  // Never follow redirects carrying a credential to another destination.
  const response = await fetch(url, { ...init, body, headers, redirect: "error", cache: "no-store" });
  // The Vercel Firewall answers rate-limited requests itself, without the app's JSON error.
  if (response.status === 429 && !response.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Too many AI requests from your network. Wait a minute, then try again." }, { status: 429 });
  }
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
