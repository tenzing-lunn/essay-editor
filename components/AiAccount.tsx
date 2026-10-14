"use client";

import { useEffect, useState } from "react";
import { primeAiFree, readAiCost, readAiFree, readAiSettings } from "@/lib/ai-client";
import { formatAiCost } from "@/lib/ai-cost";
import type { AiFree, AiProvider } from "@/lib/ai-config";

export const OPEN_AI_SETTINGS = "ai-settings-open";
export const openAiSettings = () => window.dispatchEvent(new Event(OPEN_AI_SETTINGS));
const NAMES: Record<AiProvider, string> = { anthropic: "Claude", openai: "OpenAI" };

/** The account entry point: which AI key is connected or how many free checks are left, what it has cost, and the way into AI settings. */
export default function AiAccount({ compact = false }: { compact?: boolean }) {
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [cost, setCost] = useState("");
  const [free, setFree] = useState<AiFree | null>(null);
  useEffect(() => {
    const refresh = () => { primeAiFree(); setProvider(readAiSettings()?.provider ?? null); setFree(readAiFree()); const c = readAiCost(); setCost(c.requests ? `≈ ${formatAiCost(c.costUsd)}${c.unpriced ? "+" : ""}` : ""); };
    refresh();
    const events = ["ai-settings-change", "ai-cost-change", "ai-free-change"];
    for (const event of events) window.addEventListener(event, refresh);
    return () => { for (const event of events) window.removeEventListener(event, refresh); };
  }, []);
  const left = free ? Math.max(0, free.limit - free.used) : 0;
  const label = provider ? `${NAMES[provider]} key saved${cost ? ` · ${cost}` : ""}`
    : free ? left ? `${left} free check${left === 1 ? "" : "s"} left` : "Free checks used up · connect a key"
    : "Connect your AI key";
  return <button className="ai-account" data-connected={!!provider || left > 0} data-compact={compact} onClick={openAiSettings}
    title={provider ? "AI settings: key, model and cost" : free ? "AI settings: this month's free checks, or your own key for unlimited" : "Add your API key to use the AI tools"} aria-label={compact ? `AI settings: ${label}` : undefined}>
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M17 6l3 3M14.5 8.5l2 2" />
    </svg>
    <span className="ai-account-dot" aria-hidden="true" />
    {!compact && <span className="ai-account-label">{label}</span>}
  </button>;
}
