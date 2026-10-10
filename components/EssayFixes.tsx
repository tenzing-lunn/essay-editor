"use client";

import { aiFetch } from "@/lib/ai-client";

import { useEffect, useRef, useState } from "react";
import KeyErrorLink from "@/components/KeyErrorLink";
import EssaySuggestion from "@/components/EssaySuggestion";
import { searchIndex } from "@/components/SourcesTab";
import { chunkSections, formatCitation, indexPassages, rankPassages } from "@/lib/sources";
import type { Passage } from "@/lib/sources";
import { useBooks } from "@/lib/use-books";
import type { FixAdvice } from "@/lib/essay-fixes";

type Props = {
  issue: { quote: string; note: string };
  draft: string;
  brief: string;
  onJump: (issue: { quote: string; note: string }) => void;
  autoRun?: number;
  onAutoRun?: () => void;
  /** The writer's sources to draw quotations from; omitted where quotations don't apply. */
  sources?: { manual: string; includeAntigone: boolean };
  /** Offer a drop-in revision of the flagged passage. */
  onApply?: (revision: string) => void;
  canApply?: (revision: string) => boolean;
};

/** The passages most likely to help: whatever the flagged text quotes, then the closest match to the passage and its paragraph. The feedback's own words ("wrong", "quotation") would only add noise. */
async function relevantPassages(issue: Props["issue"], draft: string, sources: NonNullable<Props["sources"]>, books: () => Promise<Passage[]>) {
  let all: Passage[] = [];
  try { all = (await searchIndex(sources.includeAntigone, books)).passages; } catch { /* the fix still works without quotations */ }
  if (sources.manual.trim()) all = [...all, ...chunkSections("pasted", "Pasted excerpts", [{ location: "pasted excerpt", text: sources.manual }])];
  if (!all.length) return [];
  const index = indexPassages(all);
  const paragraph = draft.split(/\n\s*\n/).find((p) => p.includes(issue.quote)) ?? "";
  const seen = new Set<string>();
  return [...rankPassages(index, issue.quote, 2), ...rankPassages(index, `${issue.quote} ${paragraph}`, 8)]
    .filter((p) => !seen.has(p.text) && !!seen.add(p.text)).slice(0, 6)
    .map(({ title, location, text }) => ({ title, location, text }));
}

export default function EssayFixes({ issue, draft, brief, onJump, autoRun, onAutoRun, sources, onApply, canApply }: Props) {
  const { passages } = useBooks();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fixes: FixAdvice; draft: string; brief: string; note: string; searched: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const stale = !!result && (result.draft !== draft || result.brief !== brief || result.note !== issue.note);

  const suggest = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const found = sources ? await relevantPassages(issue, draft, sources, passages) : [];
      const response = await aiFetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "fixes", draft, brief, issue, revise: !!onApply, sources: found }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not suggest fixes.");
      setResult({ fixes: data, draft, brief, note: issue.note, searched: found.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest fixes.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  // A nonce from the popover's "Suggest fixes"; the running ref stops a second request.
  useEffect(() => {
    if (!autoRun) return;
    onAutoRun?.();
    void suggest();
  }, [autoRun]);

  const copy = async (citation: string) => {
    try { await navigator.clipboard.writeText(citation); setCopied(citation); }
    catch { setError("Could not copy. Select the quotation and copy it instead."); }
  };

  return (
    <div className="essay-fixes" onClick={(e) => e.stopPropagation()}>
      <button onClick={suggest} disabled={busy || !draft.trim()}>
        {busy ? "Finding fixes…" : result ? "Suggest fixes again" : "Suggest fixes"}
      </button>
      <div aria-live="polite" aria-busy={busy}>
        {error && <p className="error" role="alert">{error} Try again.<KeyErrorLink error={error} /></p>}
        {result && <div className="fix-guidance">
          {stale && <p className="muted">Feedback changed. Suggest again.</p>}
          <h4>Ways to fix this</h4>
          <ul>{result.fixes.steps.map((step, index) => <li key={index}>{step}</li>)}</ul>
          {result.fixes.revision && onApply && <>
            <h4>Suggested revision</h4>
            <EssaySuggestion original={issue.quote} replacement={result.fixes.revision} available={canApply?.(result.fixes.revision) ?? false}
              onAccept={() => onApply(result.fixes.revision)} onDismiss={() => setResult({ ...result, fixes: { ...result.fixes, revision: "" } })} />
          </>}
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
          {result.fixes.elsewhere.length > 0 && <>
            <h4>Elsewhere in your essay</h4>
            {result.fixes.elsewhere.map((place, index) => <div className="fix-place" key={index}>
              <q>{place.quote}</q>
              <p>{place.instruction}</p>
              <button disabled={!draft.includes(place.quote)} onClick={() => onJump({ quote: place.quote, note: place.instruction })}>
                {draft.includes(place.quote) ? "Show in essay" : "Passage has changed"}
              </button>
            </div>)}
          </>}
        </div>}
      </div>
    </div>
  );
}
