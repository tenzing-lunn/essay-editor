"use client";

import { useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { aiFetch } from "@/lib/ai-client";
import { essayParagraphs } from "@/lib/essay-document";
import type { EssaySettings } from "@/lib/essay-document";
import { essayContext, mergeRevisionTasks } from "@/lib/essay-workflow";
import type { RevisionTask, SourceCheck } from "@/lib/essay-workflow";
import { ANTIGONE_VIEWER } from "@/lib/antigone";
import type { BookQuote } from "@/lib/antigone";
import EssayRevisionTasks from "@/components/EssayRevisionTasks";

type Props = {
  editorRef: RefObject<HTMLDivElement | null>; draft: string; loaded: boolean; words: number;
  brief: string; onBriefChange: (text: string) => void; getBrief: () => string;
  settings: EssaySettings; getSettings: () => EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
  onJumpTask: (task: RevisionTask, context?: string) => void; onError: (message: string | null) => void;
  evidenceRequest: { query: string; nonce: number } | null;
};

const CHECKLIST = ["Thesis states a specific argument", "Each paragraph develops that argument", "Claims have verified supporting evidence", "Quotations have checked citations", "Repetition and contradictions reviewed", "Grammar and formatting checked"];

/** The saved schema takes a whole number 0–100000; anything else would make every autosave fail. */
const clampWords = (n: unknown) => Math.min(100000, Math.max(0, Math.round(Number(n)) || 0));

export default function SourcesTab({ editorRef, draft, loaded, words, brief, onBriefChange, getBrief, settings, getSettings, updateSettings, onJumpTask, onError }: Props) {
  const [checkingSources, setCheckingSources] = useState(false);
  const sourceRunning = useRef(false);
  const [sourceCheckContext, setSourceCheckContext] = useState<string | null>(null);
  const [sourceCheckCount, setSourceCheckCount] = useState(0);
  const quoteRunning = useRef(false);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteResults, setQuoteResults] = useState<{ quotes: BookQuote[]; total: number; query: string } | null>(null);
  const [findingQuotes, setFindingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [copiedQuote, setCopiedQuote] = useState<string | null>(null);
  const text = () => editorRef.current?.innerText ?? "";
  const context = essayContext(draft, brief, settings.sources, settings.includeAntigone);

  const checkSources = async () => {
    if (!loaded || sourceRunning.current || !text().trim() || !editorRef.current) return;
    sourceRunning.current = true; setCheckingSources(true); onError(null);
    const snapshot = text(), assignment = getBrief(), sources = getSettings().sources, includeAntigone = getSettings().includeAntigone;
    const paragraphs = essayParagraphs(editorRef.current).map((p, id) => ({ id, text: p.innerText.trim() }));
    const context = essayContext(snapshot, assignment, sources, includeAntigone);
    try {
      const r = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "sources", paragraphs, brief: assignment, sources, includeAntigone }) });
      const result: SourceCheck = await r.json();
      if (!r.ok) throw new Error((result as unknown as { error: string }).error);
      if (context !== essayContext(text(), getBrief(), getSettings().sources, getSettings().includeAntigone)) {
        onError("Your essay or sources changed during the source check. Check again for current results."); return;
      }
      const tasks: RevisionTask[] = result.issues.map((issue) => ({
        ...issue, id: crypto.randomUUID(), kind: "source", paragraph: paragraphs[issue.paragraphId].text,
        status: "open", context, note: "",
      }));
      updateSettings((s) => ({ ...s, tasks: mergeRevisionTasks(s.tasks, tasks, "source") }));
      setSourceCheckCount(result.issues.length);
      setSourceCheckContext(context);
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { sourceRunning.current = false; setCheckingSources(false); }
  };

  const findQuotes = async (e: FormEvent) => {
    e.preventDefault();
    const query = quoteQuery.trim();
    if (!query || quoteRunning.current) return;
    quoteRunning.current = true;
    setFindingQuotes(true);
    setQuoteError(null);
    setQuoteResults(null);
    setCopiedQuote(null);
    try {
      const response = await fetch(`/api/quotes?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setQuoteResults({ ...data, query });
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Could not look up quotes.");
    } finally {
      quoteRunning.current = false;
      setFindingQuotes(false);
    }
  };

  const copyQuote = async (quote: BookQuote) => {
    try {
      await navigator.clipboard.writeText(`“${quote.text}” (Sophocles, Antigone ${quote.reference}; trans. Richard Jebb)`);
      setCopiedQuote(quote.reference);
    } catch {
      setQuoteError("Could not copy automatically. Select and copy the passage below.");
    }
  };

  return <>
    <section className="essay-requirements" aria-label="Assignment">
      <h2>Assignment</h2>
      <label>Assignment prompt / rubric<textarea rows={5} maxLength={20000} value={brief} onChange={(e) => onBriefChange(e.target.value)} /></label>
      <label>Target word count<input type="number" min={0} max={100000} value={settings.targetWords} onChange={(e) => updateSettings((s) => ({ ...s, targetWords: clampWords(Number(e.target.value)) }))} /></label>
      {settings.targetWords > 0 && <p>{words}/{settings.targetWords} words · {Math.max(0, settings.targetWords - words)} to target</p>}
      <details><summary>Before you submit</summary>
        {CHECKLIST.map((item) => <label className="checklist-item" key={item}><input type="checkbox" checked={settings.checklist[item] ?? false} onChange={(e) => updateSettings((s) => ({ ...s, checklist: { ...s.checklist, [item]: e.target.checked } }))} />{item}</label>)}
      </details>
    </section>
    <section className="source-check" aria-label="Sources">
      <h2>Sources</h2>
      <label className="checklist-item"><input type="checkbox" checked={settings.includeAntigone} onChange={(e) => updateSettings((s) => ({ ...s, includeAntigone: e.target.checked }))} />Include cached Antigone text</label>
      <p><a href={ANTIGONE_VIEWER} target="_blank" rel="noreferrer">View the source edition</a></p>
      <label>Source excerpts<textarea rows={5} maxLength={50000} value={settings.sources} onChange={(e) => updateSettings((s) => ({ ...s, sources: e.target.value }))} /></label>
      <button disabled={!loaded || checkingSources || !words} onClick={() => void checkSources()}>{checkingSources ? "Checking sources…" : "Check sources"}</button>
      <div aria-live="polite">{sourceCheckContext === context && <p className="muted">{sourceCheckCount ? `${sourceCheckCount} source checks added or updated.` : "No new source checks flagged."}</p>}</div>
    </section>
    <EssayRevisionTasks kind="source" tasks={settings.tasks} context={context} onJump={(t) => onJumpTask(t)}
      onRemove={(task) => updateSettings((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== task.id) }))}
      onChange={(task) => updateSettings((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? task : t) }))} />
    <section className="quote-lookup" aria-label="Book quotes">
      <h2>Book quotes</h2>
      <p className="muted">Sophocles’ <i>Antigone</i> · Richard Jebb, Perseus edition</p>
      <form onSubmit={findQuotes} className="quote-search">
        <label htmlFor="quote-query">Find a phrase or line number</label>
        <div>
          <input id="quote-query" value={quoteQuery} maxLength={200} onChange={(e) => setQuoteQuery(e.target.value)} placeholder="e.g. ship, or 175–191" />
          <button disabled={findingQuotes || !quoteQuery.trim()}>{findingQuotes ? "Searching…" : "Find quotes"}</button>
        </div>
      </form>
      <p><a href={ANTIGONE_VIEWER} target="_blank" rel="noopener noreferrer">Read Antigone in Scaife ↗</a></p>
      <p className="quote-credit">Text: <a href="https://github.com/PerseusDL/canonical-greekLit/blob/master/data/tlg0011/tlg002/tlg0011.tlg002.perseus-eng2.xml" target="_blank" rel="noopener noreferrer">Perseus Digital Library, Tufts University</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p>
      <div aria-live="polite">
        {quoteError && <p className="error">{quoteError}</p>}
        {quoteResults && <p className="muted">{quoteResults.total ? `${quoteResults.total} passage${quoteResults.total === 1 ? "" : "s"} found for “${quoteResults.query}”${quoteResults.total > 12 ? " · showing the first 12" : ""}.` : `No passages found for “${quoteResults.query}”. Try a shorter phrase or a line number.`}</p>}
      </div>
      {quoteResults?.quotes.map((quote) => (
        <div className="book-quote" key={quote.reference}>
          <p className="muted">{quote.speaker} · lines {quote.reference}</p>
          <blockquote>{quote.text}</blockquote>
          <div className="quote-actions">
            <button onClick={() => copyQuote(quote)}>{copiedQuote === quote.reference ? "Copied!" : "Copy quote + citation"}</button>
            <a href={quote.url} target="_blank" rel="noopener noreferrer">View in Scaife ↗</a>
          </div>
        </div>
      ))}
    </section>
  </>;
}
