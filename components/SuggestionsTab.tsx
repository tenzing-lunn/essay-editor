"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import SuggestionCard from "@/components/SuggestionCard";
import EssaySuggestion from "@/components/EssaySuggestion";
import type { Suggestion } from "@/lib/suggestions";
import type { IssueCategory } from "@/lib/essay-issues";

type Props = {
  suggestions: Suggestion[]; activeId: string | null; shown: boolean;
  draft: string; brief: string; words: number; loading: boolean;
  checking: number; checked: boolean; checkedAt?: number; liveFresh: boolean; progress: { fixed: number; added: number } | null;
  onCheck: (grammarOnly?: boolean) => void;
  reviewing: boolean; reviewDisabled: string | null; onReview: () => void;
  quiet: boolean; onQuietChange: (quiet: boolean) => void;
  onAddPrompt: () => void;
  aiCheck: ReactNode;
  selection: { quote: string; answer: string; rewrite: string; replacements: string[]; fresh: boolean; connections: boolean } | null;
  selectionBusy: boolean;
  onReplace: (text: string) => void; onDismissRewrite: () => void; onDismissSelection: () => void; onConnections: () => void;
  review: { overall: string[]; fresh: boolean } | null; autoReview: boolean; onAutoReviewChange: (on: boolean) => void;
  canApply: (s: Suggestion) => boolean; onAccept: (s: Suggestion) => void; onDismiss: (s: Suggestion) => void;
  onJump: (issue: { quote: string; note: string }) => void; onFindEvidence: (s: Suggestion) => void;
  fixesRequest: { id: string; nonce: number } | null; onFixesStarted: () => void;
};

export default function SuggestionsTab(props: Props) {
  const { suggestions, activeId, shown, checking, checked, progress, selection, review, fixesRequest } = props;
  const [filter, setFilter] = useState<IssueCategory | null>(null);
  const [changedOpen, setChangedOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const counts = new Map<IssueCategory, number>();
  for (const s of suggestions) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  if (filter && !counts.has(filter)) setFilter(null);
  const anchored = suggestions.filter((s) => s.paragraphId !== undefined);
  const changed = suggestions.filter((s) => s.paragraphId === undefined);
  const matches = (s: Suggestion) => !filter || s.category === filter;

  const reveal = (id: string) => requestAnimationFrame(() => list.current?.querySelector(`[data-suggestion-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }));
  useEffect(() => {
    if (!fixesRequest) return;
    setFilter(null);
    if (changed.some((s) => s.id === fixesRequest.id)) setChangedOpen(true);
    reveal(fixesRequest.id);
  }, [fixesRequest?.nonce]);
  useEffect(() => { if (activeId && shown) reveal(activeId); }, [activeId]);

  const card = (s: Suggestion) => <SuggestionCard key={s.id} suggestion={s} active={s.id === activeId} hidden={!matches(s)} canApply={props.canApply(s)}
    draft={props.draft} brief={props.brief} onAccept={() => props.onAccept(s)} onDismiss={() => props.onDismiss(s)} onJump={props.onJump}
    onFindEvidence={() => props.onFindEvidence(s)} autoRun={fixesRequest?.id === s.id ? fixesRequest.nonce : 0} onAutoRun={props.onFixesStarted} />;
  const time = props.checkedAt ? new Date(props.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

  return <div className="suggestions-tab">
    <div className="check-actions">
      <button className="primary check-essay" onClick={() => props.onCheck()} disabled={checking > 0 || props.loading || props.words === 0}>
        {checking > 0 ? `Checking… ${checking} left` : checked ? "Check again" : "Check essay"}
      </button>
      <div className="check-secondary">
        <button onClick={() => props.onCheck(true)} disabled={checking > 0 || props.loading || props.words === 0}>Grammar only</button>
        <button onClick={props.onReview} disabled={props.reviewing || !!props.reviewDisabled} title={props.reviewDisabled ?? undefined}>{props.reviewing ? "Reviewing…" : "Whole-essay review"}</button>
        <button role="switch" aria-checked={props.quiet} className="switch" title="Show only argument, evidence and structure issues" onClick={() => props.onQuietChange(!props.quiet)}>
          <span className="switch-track" aria-hidden="true" />Drafting mode
        </button>
      </div>
    </div>
    <p className="check-status muted" aria-live="polite">
      {checked && <span>{time ? `Checked ${time}` : "Checked"}{progress ? ` · ${progress.fixed} fixed, ${progress.added} new` : ""}</span>}
      {checked && !props.liveFresh && checking === 0 && <span>Edited since check · <button className="link" onClick={() => props.onCheck()} disabled={props.loading || props.words === 0}>Check again</button></span>}
      {!props.brief.trim() && <span>No assignment prompt yet · <button className="link" onClick={props.onAddPrompt}>Add</button></span>}
    </p>
    {props.aiCheck}
    {counts.size > 1 && <div className="chips suggestion-chips" role="group" aria-label="Filter suggestions">
      <button aria-pressed={!filter} onClick={() => setFilter(null)}>All <span className="chip-count">{suggestions.length}</span></button>
      {[...counts].map(([category, n]) => <button key={category} data-category={category} aria-pressed={filter === category} onClick={() => setFilter(category)}>
        <span className="category-dot" aria-hidden="true" />{category} <span className="chip-count">{n}</span>
      </button>)}
    </div>}
    {props.selectionBusy && <p className="muted">Working…</p>}
    {selection && <section className="issue selection-card" aria-label="Your selection">
      <div className="issue-head"><span className="issue-category">Your selection</span>{!selection.fresh && <span className="muted">Selection changed</span>}</div>
      {selection.answer && <p>{selection.answer}</p>}
      {selection.rewrite && <EssaySuggestion original={selection.quote} replacement={selection.rewrite} available={selection.fresh} onAccept={() => props.onReplace(selection.rewrite)} onDismiss={props.onDismissRewrite} />}
      {selection.replacements.length > 0 && <div className="chips synonyms" aria-label="Replacements">
        {selection.replacements.map((word) => <button key={word} disabled={!selection.fresh} title={`Replace with “${word}”`} onClick={() => props.onReplace(word)}>{word}</button>)}
      </div>}
      <div className="suggestion-actions">
        {selection.connections && <button onClick={props.onConnections}>Connections →</button>}
        <button onClick={props.onDismissSelection}>Dismiss</button>
      </div>
    </section>}
    {review && review.overall.length > 0 && <details className="issue big-picture" open>
      <summary><span className="issue-category">Big picture</span>{!review.fresh && <span className="tag">Out of date</span>}</summary>
      <ul>{review.overall.map((o, k) => <li key={k}>{o}</li>)}</ul>
      <label className="checklist-item" title="Uses your API key"><input type="checkbox" checked={props.autoReview} onChange={(e) => props.onAutoReviewChange(e.target.checked)} />Re-review every 3 min</label>
    </details>}
    <div ref={list}>
      {anchored.map(card)}
      {changed.length > 0 && <details className="changed-since" open={changedOpen} onToggle={(e) => setChangedOpen(e.currentTarget.open)} hidden={!changed.some(matches)}>
        <summary>Changed since check ({changed.length})</summary>
        {changed.map(card)}
      </details>}
    </div>
    {suggestions.length === 0 ? <p className="muted empty">{checked || review ? "All clear." : "No suggestions yet."}</p>
      : !suggestions.some(matches) && <p className="muted empty">Nothing in this category.</p>}
  </div>;
}
