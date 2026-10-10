"use client";

import { useEffect, useState } from "react";
import { readAiCost, readAiSettings } from "@/lib/ai-client";
import { formatAiCost } from "@/lib/ai-cost";
import type { AiProvider } from "@/lib/ai-config";

export const OPEN_AI_SETTINGS = "ai-settings-open";
export const openAiSettings = () => window.dispatchEvent(new Event(OPEN_AI_SETTINGS));
const NAMES: Record<AiProvider, string> = { anthropic: "Claude", openai: "OpenAI" };

/** The account entry point: which AI key is connected, what it has cost, and the way into AI settings. */
export default function AiAccount({ compact = false }: { compact?: boolean }) {
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [cost, setCost] = useState("");
  useEffect(() => {
    const refresh = () => { setProvider(readAiSettings()?.provider ?? null); const c = readAiCost(); setCost(c.requests ? `≈ ${formatAiCost(c.costUsd)}${c.unpriced ? "+" : ""}` : ""); };
    refresh();
    window.addEventListener("ai-settings-change", refresh); window.addEventListener("ai-cost-change", refresh);
    return () => { window.removeEventListener("ai-settings-change", refresh); window.removeEventListener("ai-cost-change", refresh); };
  }, []);
  const label = provider ? `${NAMES[provider]} key saved${cost ? ` · ${cost}` : ""}` : "Connect your AI key";
  return <button className="ai-account" data-connected={!!provider} data-compact={compact} onClick={openAiSettings}
    title={provider ? "AI settings: key, model and cost" : "Add your API key to use the AI tools"} aria-label={compact ? `AI settings: ${label}` : undefined}>
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M17 6l3 3M14.5 8.5l2 2" />
    </svg>
    <span className="ai-account-dot" aria-hidden="true" />
    {!compact && <span className="ai-account-label">{label}</span>}
  </button>;
}
