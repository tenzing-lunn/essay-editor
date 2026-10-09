"use client";

import { useEffect, useRef, useState } from "react";
import { aiFetch, readAiSettings, saveAiSettings, readAiCost, resetAiCost } from "@/lib/ai-client";
import { EMPTY_AI_COST, formatAiCost, type AiCost } from "@/lib/ai-cost";
import type { AiProvider } from "@/lib/ai-config";

export function AiSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [key, setKey] = useState("");
  const [economy, setEconomy] = useState(true);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [cost, setCost] = useState<AiCost>(EMPTY_AI_COST);
  useEffect(() => {
    const refresh = () => setConnected(Boolean(readAiSettings()));
    refresh();
    window.addEventListener("ai-settings-change", refresh);
    return () => window.removeEventListener("ai-settings-change", refresh);
  }, []);
  useEffect(() => {
    const refresh = () => setCost(readAiCost());
    refresh();
    window.addEventListener("ai-cost-change", refresh);
    return () => window.removeEventListener("ai-cost-change", refresh);
  }, []);
  function open() {
    const saved = readAiSettings();
    setProvider(saved?.provider ?? "anthropic"); setKey(saved?.apiKey ?? ""); setEconomy(saved?.economy ?? true); setMessage("");
    dialog.current?.showModal();
  }
  function save() {
    const apiKey = key.trim();
    if (!apiKey || apiKey.length > 512 || /[\s\x00-\x1f\x7f]/.test(apiKey)) { setMessage("Paste a valid API key without spaces."); return false; }
    saveAiSettings({ provider, apiKey, economy });
    setMessage("Key saved for this tab. Use Test connection to verify access.");
    return true;
  }
  async function test() {
    if (!save()) return;
    setTesting(true); setMessage("Testing…");
    try {
      const response = await aiFetch("/api/ai/connection", { method: "POST" });
      const result = await response.json();
      setMessage(response.ok ? `Connected to ${result.model}. AI requests are billed to your account.` : result.error);
    } catch { setMessage("Could not reach the app. Try again."); }
    finally { setTesting(false); }
  }
  return <>
    <button className="ai-settings-launch" onClick={open}>AI settings · {connected ? "key saved" : "add your key"} · ≈ {formatAiCost(cost.costUsd)}{cost.unpriced ? " + unknown" : ""}</button>
    <dialog ref={dialog} className="ai-settings-dialog" aria-labelledby="ai-settings-title" onClose={() => setKey("")}>
      <div className="ai-settings-heading"><h2 id="ai-settings-title">Your AI, your budget</h2><button aria-label="Close AI settings" onClick={() => dialog.current?.close()}>Close</button></div>
      <p>Connect your own API key. Your provider bills you directly for what you use, with no app subscription.</p>
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <fieldset disabled={testing}>
          <label htmlFor="ai-provider">Provider</label>
          <select id="ai-provider" value={provider} onChange={(event) => { setProvider(event.target.value as AiProvider); setKey(""); setMessage(""); }}><option value="anthropic">Claude (Anthropic)</option><option value="openai">OpenAI</option></select>
          <p className="small"><a href={provider === "anthropic" ? "https://platform.claude.com/settings/keys" : "https://platform.openai.com/api-keys"} target="_blank" rel="noreferrer">Get an API key ↗</a> · Add API credit with your provider. Chat subscriptions do not include API credit.</p>
          <label htmlFor="ai-key">API key</label>
          <input id="ai-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"} />
          {provider === "anthropic" && <label className="ai-economy"><input type="checkbox" checked={economy} onChange={(event) => setEconomy(event.target.checked)} /> Economy mode — use Haiku for all feedback</label>}
          <p className="small muted">{provider === "openai" ? "Uses GPT-4.1 mini for all AI tools." : economy ? "Uses Claude Haiku 5.5 for all AI tools." : "Uses Haiku 5.5 for quick checks and Sonnet 5.5 for deeper feedback."}</p>
          <div className="ai-settings-actions"><button type="submit">Save key</button><button type="button" onClick={test}>Test connection</button><button type="button" onClick={() => { saveAiSettings(null); setKey(""); setMessage("Key removed from this tab."); }}>Forget key</button></div>
        </fieldset>
      </form>
      <p role="status">{message}</p>
      <section className="ai-cost-counter" aria-labelledby="ai-cost-title">
        <div className="ai-settings-heading"><h3 id="ai-cost-title">Cost in this tab</h3><button onClick={resetAiCost}>Reset counter</button></div>
        <p className="ai-cost-total" aria-live="polite">≈ {formatAiCost(cost.costUsd)}{cost.unpriced ? " + unknown" : ""}</p>
        <p className="small">{cost.requests} request{cost.requests === 1 ? "" : "s"} · {cost.inputTokens.toLocaleString()} input tokens · {cost.outputTokens.toLocaleString()} output tokens</p>
        {cost.last && <p className="small">Last request: {cost.last.costUsd === null ? "cost unavailable" : `≈ ${formatAiCost(cost.last.costUsd)}`} · {cost.last.model}</p>}
        {cost.unpriced > 0 && <p className="small warn">{cost.unpriced} request{cost.unpriced === 1 ? " has" : "s have"} no complete usage or known price. The total is partial.</p>}
        <p className="small muted">Estimated from provider-reported tokens and standard rates, including cached tokens. Counts requests made in this tab since the last reset, across providers; connection tests and automatic reviews count too. Reloading keeps the counter. Resetting only clears this display. Your provider’s usage dashboard is the billing record; interrupted requests may not be counted.</p>
      </section>
      <div className="ai-cost-note"><strong>Small requests cost fractions of a cent to a few cents.</strong><p>For an example request with 3,000 input tokens and 1,000 output tokens: GPT-4.1 mini ≈ $0.003; Haiku 5.5 ≈ $0.0008; Sonnet 5.5 ≈ $0.016. Haiku 5.5 costs 5× more per token once a single request exceeds 100,000 input tokens. An essay check may make several requests. Longer drafts, repeated checks, and source excerpts cost more.</p><p className="small">Estimates in USD using standard rates checked October 9, 2026. <a href="https://platform.claude.com/docs/en/about-claude/pricing" target="_blank" rel="noreferrer">Claude pricing</a> · <a href="https://developers.openai.com/api/docs/models/gpt-4.1-mini" target="_blank" rel="noreferrer">OpenAI pricing</a>. Set a budget with your provider.</p></div>
      <p className="small muted">Your key stays in this tab’s session storage until you forget it or close the tab (browser session restore may retain it). The app server receives it for each AI request and forwards your text to the selected provider; it does not save the key to disk. Use your own copy or an app host you trust.</p>
      <p className="small muted">Your essay is saved only in this browser. Download it to keep a copy or move it to another device.</p>
    </dialog>
  </>;
}
