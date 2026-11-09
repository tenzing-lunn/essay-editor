"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readAiRuns } from "@/lib/ai-activity";
import type { AiRun } from "@/lib/ai-activity";

export type ReviewTally = { fixed: number; skipped: number; left: number; dismissed: number; seen: number; total: number };
type Props = {
  essayId: string; grade: ReactNode; tally: ReviewTally | null; onReviewSkipped: () => void; onDismissTally: () => void;
  overall: { notes: string[]; fresh: boolean } | null; autoReview: boolean; onAutoReviewChange: (on: boolean) => void;
  canCheck: boolean; reviewing: boolean; reviewDisabled: string | null; onGrammarOnly: () => void; onReview: () => void;
  quiet: boolean; onQuietChange: (quiet: boolean) => void;
};

const when = (at: number) => {
  const d = new Date(at), today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Below the essay, where a teacher writes: the grade, what the last review did, and every time the AI ran on this essay. */
export default function EndComment({ essayId, grade, tally, onReviewSkipped, onDismissTally, overall, autoReview, onAutoReviewChange, canCheck, reviewing, reviewDisabled, onGrammarOnly, onReview, quiet, onQuietChange }: Props) {
  const [runs, setRuns] = useState<AiRun[]>([]);
  const [allRuns, setAllRuns] = useState(false);
  useEffect(() => {
    const load = () => setRuns(readAiRuns(essayId));
    load();
    window.addEventListener("ai-activity-change", load);
    return () => window.removeEventListener("ai-activity-change", load);
  }, [essayId]);
  const shown = allRuns ? runs : runs.slice(0, 6);
  return <section className="end-comment" aria-label="End comment">
    {grade}
    {tally && <section className="end-tally" aria-label="This review">
      <div className="end-tally-head"><h2>This review</h2><button className="link" onClick={onDismissTally}>Hide</button></div>
      <p className="muted">{tally.seen} of {tally.total} notes seen{tally.total > tally.seen ? `; ${tally.total - tally.seen} not reached yet` : ""}</p>
      <ul>
        <li><b className="end-tally-ok">{tally.fixed}</b> fixed, in your own words</li>
        <li><b>{tally.skipped}</b> skipped: they stay in the margin</li>
        <li><b>{tally.dismissed}</b> marked not a problem</li>
      </ul>
      {tally.left > 0 && <button onClick={onReviewSkipped}>Review the {tally.left} left</button>}
    </section>}
    {overall && overall.notes.length > 0 && <section className="end-overall" aria-label="Big picture">
      <h2>Big picture {!overall.fresh && <span className="tag">Out of date</span>}</h2>
      <ul>{overall.notes.map((o, k) => <li key={k}>{o}</li>)}</ul>
      <label className="checklist-item" title="Uses your API key"><input type="checkbox" checked={autoReview} onChange={(e) => onAutoReviewChange(e.target.checked)} />Re-review every 3 min</label>
    </section>}
    <section className="end-log" aria-label="What the AI did on this essay">
      <h2>What the AI did on this essay</h2>
      {!runs.length ? <p className="muted">Nothing yet. Every time the AI runs on this essay, it shows here with what it read.</p> : <ol>
        {shown.map((run) => <li key={run.id}>
          <span className="end-log-time">{when(run.at)}</span>
          <span className="end-log-what">
            <b>{run.label}{!run.ok && <span className="end-log-failed"> · didn’t finish</span>}</b>
            {run.detail && <span className="end-log-detail">“{run.detail.slice(0, 160)}”</span>}
            <span className="muted">Read {run.reads.join(", ") || "nothing"}.</span>
          </span>
        </li>)}
      </ol>}
      {runs.length > shown.length && <button className="link" onClick={() => setAllRuns(true)}>Show all {runs.length}</button>}
      <p className="muted end-log-note">Kept in this browser. Nothing reached your essay without your click or your typing.</p>
    </section>
    <details className="more-checks">
      <summary>More checks</summary>
      <div className="check-secondary">
        <button onClick={onGrammarOnly} disabled={!canCheck}>Grammar only</button>
        <button onClick={onReview} disabled={reviewing || !!reviewDisabled} title={reviewDisabled ?? "Big-picture feedback on the whole essay: argument, structure and the prompt"}>{reviewing ? "Reviewing…" : "Whole-essay review"}</button>
        <button role="switch" aria-checked={quiet} className="switch" title="Show only argument, evidence and structure notes" onClick={() => onQuietChange(!quiet)}>
          <span className="switch-track" aria-hidden="true" />Big issues only
        </button>
      </div>
    </details>
  </section>;
}
