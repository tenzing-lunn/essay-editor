"use client";

import EssaySuggestion from "@/components/EssaySuggestion";
import EssayFixes from "@/components/EssayFixes";
import type { Suggestion } from "@/lib/suggestions";

type Props = {
  suggestion: Suggestion; active: boolean; hidden?: boolean; canApply: boolean; draft: string; brief: string;
  sources: { manual: string; includeAntigone: boolean }; canApplyFix: (revision: string) => boolean; onApplyFix: (revision: string) => void;
  onAccept: () => void; onDismiss: () => void; onJump: (issue: { quote: string; note: string }) => void; onFindEvidence: () => void;
  autoRun: number; onAutoRun: () => void;
};

export default function SuggestionCard({ suggestion: s, active, hidden, canApply, draft, brief, sources, canApplyFix, onApplyFix, onAccept, onDismiss, onJump, onFindEvidence, autoRun, onAutoRun }: Props) {
  const replaces = !!s.replacement && s.replacement !== s.quote;
  return <div className="issue" data-category={s.category} data-suggestion-id={s.id} aria-current={active ? "true" : undefined} hidden={hidden}>
    <div className="issue-head">
      <span className="issue-category">{s.category}</span>
      {s.origin !== "live" && <span className="issue-origin">{s.origin === "review" ? "Review" : "Selection"}</span>}
    </div>
    <button className="issue-location" aria-label={`Show in essay: ${s.quote}`} onClick={() => onJump(s)}><q>{s.quote}</q></button>
    <p className="issue-note">{s.note}</p>
    {replaces ? <EssaySuggestion original={s.quote} replacement={s.replacement!} available={canApply} onAccept={onAccept} onDismiss={onDismiss} /> : <>
      <EssayFixes issue={{ quote: s.quote, note: s.note }} draft={draft} brief={brief} onJump={onJump} autoRun={autoRun} onAutoRun={onAutoRun}
        sources={sources} canApply={canApplyFix} onApply={onApplyFix} />
      <div className="suggestion-actions">
        {(s.category === "Use of evidence" || s.category === "Factual accuracy") && <button onClick={onFindEvidence}>Find evidence</button>}
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </>}
  </div>;
}
