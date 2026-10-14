"use client";

import { useEffect, useRef, useState } from "react";
import { aiFetch, readAiFree, readAiSettings, saveAiSettings, readAiCost, resetAiCost } from "@/lib/ai-client";
import { EMPTY_AI_COST, formatAiCost, type AiCost } from "@/lib/ai-cost";
import { keyProblem, type AiFree, type AiProvider, type AiSettings as Saved } from "@/lib/ai-config";
import { APP_NAME } from "@/lib/brand";
import { OPEN_AI_SETTINGS } from "@/components/AiAccount";

const PROVIDERS: Record<AiProvider, { name: string; keys: string; platform: string; chat: string; prefix: string }> = {
  anthropic: { name: "Claude", keys: "https://platform.claude.com/settings/keys", platform: "Claude Platform", chat: "Claude.ai", prefix: "sk-ant-" },
  openai: { name: "OpenAI", keys: "https://platform.openai.com/api-keys", platform: "OpenAI Platform", chat: "ChatGPT", prefix: "sk-" },
};
type Tone = "" | "ok" | "warn" | "error" | "busy";

/** The three ways to run checks: this month's free allowance, a bring-your-own API key, and the coming Plus plan. Spending and privacy details stay out of the way. */
export function AiSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [free, setFree] = useState<AiFree | null>(null);
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [economy, setEconomy] = useState(true);
  const [message, setMessage] = useState<{ tone: Tone; text: string }>({ tone: "", text: "" });
  const [cost, setCost] = useState<AiCost>(EMPTY_AI_COST);
  const [spent, setSpent] = useState(false); // once shown, the card stays so Reset does not yank it away
  useEffect(() => {
    const refresh = () => { const next = readAiCost(); setCost(next); if (next.requests) setSpent(true); };
    refresh();
    window.addEventListener("ai-cost-change", refresh);
    return () => window.removeEventListener("ai-cost-change", refresh);
  }, []);
  useEffect(() => {
    const refresh = () => setFree(readAiFree());
    refresh();
    window.addEventListener("ai-free-change", refresh);
    return () => window.removeEventListener("ai-free-change", refresh);
  }, []);
  useEffect(() => {
    const open = () => {
      const current = readAiSettings();
      setSaved(current); setProvider(current?.provider ?? "anthropic"); setKey(current?.apiKey ?? ""); setEconomy(current?.economy ?? true);
      setShowKey(false); setMessage({ tone: "", text: "" }); setSpent(readAiCost().requests > 0); setFree(readAiFree());
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    window.addEventListener(OPEN_AI_SETTINGS, open);
    return () => window.removeEventListener(OPEN_AI_SETTINGS, open);
  }, []);
  const p = PROVIDERS[provider];
  const testing = message.tone === "busy";
  const unchanged = !!saved && saved.provider === provider && saved.apiKey === key.trim() && saved.economy === economy;
  const remember = (next: Saved | null) => { saveAiSettings(next); setSaved(next); };

  async function connect() {
    const apiKey = key.trim();
    const other = (Object.keys(PROVIDERS) as AiProvider[]).find((id) => id !== provider && !keyProblem(id, apiKey));
    const problem = !apiKey ? "Paste your API key first." : other ? `That key is for ${PROVIDERS[other].name}. Choose ${PROVIDERS[other].name} above, or paste your ${p.name} key.` : keyProblem(provider, apiKey);
    if (problem) { setMessage({ tone: "error", text: problem }); keyInput.current?.focus(); return; }
    const candidate = { provider, apiKey, economy };
    setMessage({ tone: "busy", text: "Checking your key with " + p.name + "…" });
    let outcome: { tone: Tone; text: string };
    try {
      const response = await aiFetch("/api/ai/connection", { method: "POST" }, candidate);
      const result = await response.json();
      // Save only a key the provider accepted; credit or rate-limit problems still mean the key itself works.
      if (response.ok || response.status !== 401) remember(candidate);
      outcome = response.ok ? { tone: "ok", text: `Connected. Feedback now runs on ${result.model}, billed to your ${p.name} account.` }
        : response.status !== 401 ? { tone: "warn", text: `Key saved, but the test failed: ${result.error}` }
        : { tone: "error", text: !saved ? result.error : saved.apiKey === apiKey && saved.provider === provider ? `${result.error} Paste a new key or disconnect this one.` : `${result.error} Your previous key is still connected.` };
    } catch { outcome = { tone: "error", text: "Could not reach the app. Check your connection and try again." }; }
    setMessage(outcome);
  }
  // The fieldset is disabled while testing, which drops focus; once the result renders, put focus where the next action is.
  useEffect(() => {
    if (message.tone === "ok") dialog.current?.querySelector<HTMLElement>(".ai-actions .primary")?.focus();
    else if (message.tone === "error" || message.tone === "warn") keyInput.current?.focus();
  }, [message]);
  function disconnect() { remember(null); setKey(""); setMessage({ tone: "", text: "Disconnected. Your key was removed from this tab." }); keyInput.current?.focus(); }

  const left = free ? Math.max(0, free.limit - free.used) : 0;
  const reset = free ? new Date(free.resetsAt) : null;
  const resetDate = reset && !Number.isNaN(reset.getTime()) ? reset.toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" }) : "";
  const status = saved ? `${PROVIDERS[saved.provider].name} key saved` : free ? `${left} free check${left === 1 ? "" : "s"} left` : "Not connected";
  return <dialog ref={dialog} className="ai-settings-dialog" aria-labelledby="ai-settings-title" onClose={() => { setKey(""); setShowKey(false); }}>
    <header className="ai-head">
      <div>
        <h2 id="ai-settings-title">AI settings</h2>
        <p className="ai-status" data-connected={!!saved || left > 0}><span aria-hidden="true" />{status}</p>
      </div>
      <button className="ai-close" aria-label="Close AI settings" onClick={() => dialog.current?.close()}>×</button>
    </header>
    <p className="ai-lede">Three ways to run checks in {APP_NAME}.</p>

    <section className="ai-step" aria-labelledby="ai-door-free">
      <h3 id="ai-door-free">Free checks</h3>
      <p>{free
        ? `${free.used} of ${free.limit} free checks used this month${resetDate ? ` · resets ${resetDate}` : ""}. One check is one click of Check my essay, however long the essay. They run on the economy model on this instance's key; nothing to set up.`
        : "This instance is not offering free checks right now. Connect your own key below."}</p>
    </section>

    <section className="ai-step" aria-labelledby="ai-door-key">
      <h3 id="ai-door-key">Your own key</h3>
      <p className="ai-lede">An API key is a password that lets {APP_NAME} bill AI requests to your own Claude or OpenAI account. Unlimited checks; each request costs a fraction of a cent to a few cents, so a month is usually under a dollar. A {p.chat} subscription is not an API key: API credit is bought separately, a few dollars at a time.</p>
      <form onSubmit={(event) => { event.preventDefault(); void connect(); }}>
        <fieldset disabled={testing}>
          <section className="ai-step" aria-labelledby="ai-step-provider">
            <h3 id="ai-step-provider"><span className="ai-step-n" aria-hidden="true">1</span>Choose a provider</h3>
            <div className="ai-options" role="radiogroup" aria-labelledby="ai-step-provider">
              {(Object.keys(PROVIDERS) as AiProvider[]).map((id) => <label key={id} className="ai-option">
                <input type="radio" name="ai-provider" checked={provider === id} onChange={() => { setProvider(id); setKey(saved?.provider === id ? saved.apiKey : ""); setEconomy(saved?.provider === id ? saved.economy : true); setMessage({ tone: "", text: "" }); }} />
                <strong>{PROVIDERS[id].name}</strong><span>{id === "anthropic" ? "by Anthropic · recommended" : "GPT-4.1 mini"}</span>
              </label>)}
            </div>
          </section>

          <section className="ai-step" aria-labelledby="ai-step-key">
            <h3 id="ai-step-key"><span className="ai-step-n" aria-hidden="true">2</span>Paste your API key</h3>
            <div className="ai-key-row">
              <input id="ai-key" ref={keyInput} aria-label="API key" type={showKey ? "text" : "password"} value={key} onChange={(event) => { setKey(event.target.value); setMessage({ tone: "", text: "" }); }}
                autoComplete="off" spellCheck={false} placeholder={`${p.prefix}…`} />
              <button type="button" onClick={() => setShowKey((v) => !v)} aria-controls="ai-key" aria-label={showKey ? "Hide key" : "Show key"}>{showKey ? "Hide" : "Show"}</button>
            </div>
            <div className="small ai-help">
              <p>No key yet? Three steps:</p>
              <ol>
                <li>Sign in to the <a href={p.keys} target="_blank" rel="noreferrer">{p.platform} ↗</a> (or create an account there) and add a few dollars of API credit in billing.</li>
                <li>Create a key on its API keys page and copy it straight away; it is shown only once. {p.name} keys start with {p.prefix}.</li>
                <li>Paste it above and choose <strong>Connect</strong>. {APP_NAME} tests the key with {p.name} before saving it.</li>
              </ol>
              <p className="muted">Set a monthly spending limit with your provider. Never share your key; if it leaks, delete it on the same page and create a new one.</p>
            </div>
          </section>

          {provider === "anthropic" && <section className="ai-step" aria-labelledby="ai-step-quality">
            <h3 id="ai-step-quality"><span className="ai-step-n" aria-hidden="true">3</span>Choose quality</h3>
            <div className="ai-options ai-quality" role="radiogroup" aria-labelledby="ai-step-quality">
              <label className="ai-option"><input type="radio" name="ai-quality" checked={economy} onChange={() => setEconomy(true)} />
                <strong>Economy</strong><span>Haiku 5.5 for everything · about $0.001 a request</span></label>
              <label className="ai-option"><input type="radio" name="ai-quality" checked={!economy} onChange={() => setEconomy(false)} />
                <strong>Deeper feedback</strong><span>Sonnet 5.5 for reviews, Haiku for quick checks · about $0.02 a request</span></label>
            </div>
          </section>}

          <div className="ai-actions">
            <button type="submit" className="primary">{testing ? "Connecting…" : unchanged ? "Test again" : saved ? "Save and test" : "Connect"}</button>
            {saved && <button type="button" className="link ai-disconnect" onClick={disconnect}>Disconnect</button>}
          </div>
        </fieldset>
        <p className="ai-message" role="status" data-tone={message.tone}>{message.text}</p>
      </form>
    </section>

    <section className="ai-step" aria-labelledby="ai-door-plus">
      <h3 id="ai-door-plus">Plus</h3>
      <p className="small muted">Coming: hosted checks on the stronger model for a monthly price. Not available yet.</p>
    </section>

    {(cost.requests > 0 || spent) && <details className="ai-usage">
      <summary>Spending in this tab · ≈ {formatAiCost(cost.costUsd)}{cost.unpriced ? "+" : ""}</summary>
      <dl className="ai-usage-stats">
        <div><dt>Estimated cost</dt><dd className="ai-usage-total" aria-live="polite">≈ {formatAiCost(cost.costUsd)}{cost.unpriced ? "+" : ""}</dd></div>
        <div><dt>Requests</dt><dd>{cost.requests}</dd></div>
        <div><dt>Tokens</dt><dd>{(cost.inputTokens + cost.outputTokens).toLocaleString()}</dd></div>
      </dl>
      {cost.last && <p className="small muted">Last request: {cost.last.costUsd === null ? "cost unavailable" : `≈ ${formatAiCost(cost.last.costUsd)}`} on {cost.last.model}</p>}
      {cost.unpriced > 0 && <p className="small warn">{cost.unpriced} request{cost.unpriced === 1 ? " has" : "s have"} no complete usage or known price, so the total is partial.</p>}
      <details className="small">
        <summary>How this is estimated</summary>
        <p>{cost.inputTokens.toLocaleString()} input and {cost.outputTokens.toLocaleString()} output tokens, priced at standard rates (checked October 9, 2026) including cached tokens. Counts every request in this tab since the last reset, including connection tests and automatic reviews. Reloading keeps the counter; resetting only clears this display. Your provider’s usage dashboard is the billing record, and interrupted requests may not be counted.</p>
        <p>For a request with 3,000 input and 1,000 output tokens: Haiku 5.5 ≈ $0.0008, GPT-4.1 mini ≈ $0.003, Sonnet 5.5 ≈ $0.016. Haiku costs 5× more per token once a single request exceeds 100,000 input tokens. An essay check may make several requests; longer drafts and source excerpts cost more. <a href="https://platform.claude.com/docs/en/about-claude/pricing" target="_blank" rel="noreferrer">Claude pricing</a> · <a href="https://developers.openai.com/api/docs/models/gpt-4.1-mini" target="_blank" rel="noreferrer">OpenAI pricing</a></p>
      </details>
      <p className="small"><button className="link" onClick={resetAiCost}>Reset counter</button></p>
    </details>}

    <details className="small ai-privacy">
      <summary>Privacy: where your key and essay go</summary>
      <p>Your key stays in this tab’s session storage until you disconnect or close the tab (browser session restore may keep it). The app server receives it with each AI request and forwards your text to the provider you chose; it never saves the key to disk. Free checks, where offered, send your text the same way on this instance’s key. Use your own copy of the app or a host you trust.</p>
      <p>Your essays are saved to your account, so they open on any device you sign in to. Your API key is never saved to your account; it stays in this browser tab.</p>
    </details>
  </dialog>;
}
