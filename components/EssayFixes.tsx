"use client";

import { aiFetch } from "@/lib/ai-client";

import { useEffect, useRef, useState } from "react";
import KeyErrorLink from "@/components/KeyErrorLink";
import EssaySuggestion from "@/components/EssaySuggestion";
import { relevantPassages } from "@/components/SourcesTab";
import { formatCitation } from "@/lib/sources";
import { useBooks } from "@/lib/use-books";
import type { FixAdvice } from "@/lib/essay-fixes";

type Props = {
  issue: { quote: string; note: string };
  draft: string;
  brief: string;
  autoRun?: number;
  onAutoRun?: () => void;
  /** The writer's sources to draw quotations from; omitted where quotations don't apply. */
  sources?: { manual: string; includeAntigone: boolean };
  /** Offer drop-in rewrites of the flagged passage. */
  onApply?: (revision: string) => void;
  canApply?: (revision: string) => boolean;
};

type Result = { fixes: FixAdvice; draft: string; brief: string; note: string; searched: number | null };

export default function EssayFixes({ issue, draft, brief, autoRun, onAutoRun, sources, onApply, canApply }: Props) {
  const { passages } = useBooks();
  const running = useRef(false);
  const [busy, setBusy] = useState<"fixes" | "quotes" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const stale = !!result && (result.draft !== draft || result.brief !== brief || result.note !== issue.note);

  const ask = async (quotes: boolean) => {
    if (running.current) return;
    running.current = true;
    setBusy(quotes ? "quotes" : "fixes");
    setError(null);
    try {
      const found = quotes && sources ? await relevantPassages(issue.quote, draft, sources, passages) : [];
      const response = await aiFetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "fixes", draft, brief, issue, revise: !quotes && !!onApply, quotes, sources: found }),
      });
      const data: FixAdvice = await response.json();
      if (!response.ok) throw new Error((data as unknown as { error?: string }).error || "Could not suggest fixes.");
      setResult((prev) => quotes && prev
        ? { ...prev, fixes: { ...prev.fixes, quotes: data.quotes }, searched: found.length }
        : { fixes: data, draft, brief, note: issue.note, searched: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest fixes.");
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  // A nonce from the popover's "Suggest fixes"; the running ref stops a second request.
  useEffect(() => {
    if (!autoRun) return;
    onAutoRun?.();
    void ask(false);
  }, [autoRun]);

  const copy = async (citation: string) => {
    try { await navigator.clipboard.writeText(citation); setCopied(citation); }
    catch { setError("Could not copy. Select the quotation and copy it instead."); }
  };

  const dropOption = (text: string) => result && setResult({ ...result, fixes: { ...result.fixes, options: result.fixes.options.filter((o) => o.text !== text) } });

  return (
    <div className="essay-fixes" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => ask(false)} disabled={!!busy || !draft.trim()}>
        {busy === "fixes" ? "Finding fixes…" : result ? "Suggest fixes again" : "Suggest fixes"}
      </button>
      <div aria-live="polite" aria-busy={!!busy}>
        {error && <p className="error" role="alert">{error} Try again.<KeyErrorLink error={error} /></p>}
        {result && <div className="fix-guidance">
          {stale && <p className="muted">Feedback changed. Suggest again.</p>}
          {result.fixes.advice && <p className="fix-advice">{result.fixes.advice}</p>}
          {onApply && result.fixes.options.length > 0 && <>
            <h4>{result.fixes.options.length === 1 ? "A way to rewrite it" : "Two ways to rewrite it"}</h4>
            {result.fixes.options.map((o) => <div className="fix-option" key={o.text}>
              {o.how && <p className="muted">{o.how}</p>}
              <EssaySuggestion original={issue.quote} replacement={o.text} available={canApply?.(o.text) ?? false}
                onAccept={() => onApply(o.text)} onDismiss={() => dropOption(o.text)} />
            </div>)}
          </>}
          {sources && result.searched === null && <button className="fix-more" onClick={() => ask(true)} disabled={!!busy}>
            {busy === "quotes" ? "Finding quotes…" : "Find quotes I could use"}
          </button>}
          {result.fixes.quotes.length > 0 && <>
            <h4>Quotes you could use</h4>
            {result.fixes.quotes.map((q) => {
              const citation = formatCitation(q, q.text);
              return <div className="fix-quote" key={citation}>
                <blockquote>{q.text}</blockquote>
                <p className="muted">{q.title}, {q.location}</p>
                {q.why && <p>{q.why}</p>}
                <button onClick={() => copy(citation)}>{copied === citation ? "Copied" : "Copy with citation"}</button>
              </div>;
            })}
          </>}
          {sources && result.searched === 0 && <p className="muted">Upload your book or paste excerpts in Sources to get quotations from it.</p>}
          {sources && result.searched !== null && result.searched > 0 && result.fixes.quotes.length === 0 && <p className="muted">No quotation in your sources fits this passage.</p>}
        </div>}
      </div>
    </div>
  );
}
