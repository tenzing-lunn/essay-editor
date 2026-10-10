"use client";

import { useEffect, useId, useState } from "react";
import type { RefObject } from "react";
import { aiFetch } from "@/lib/ai-client";
import { passageRange } from "@/lib/essay-document";
import { gradeKey, TRAITS } from "@/lib/essay-grade";
import type { Grade } from "@/lib/essay-grade";
import KeyErrorLink from "@/components/KeyErrorLink";

type Props = { essayId: string; root: RefObject<HTMLDivElement | null>; draft: string; brief: string; words: number; loaded: boolean; onJump: (range: Range) => void; onAddPrompt: () => void };
type SavedGrade = { draft: string; brief: string; grade: Grade; previous?: number };

const OPEN_KEY = "essay:grade-open";
const STATUS = { met: "✓", partial: "◐", missed: "✗" } as const;
const traitName = (key: string) => TRAITS.find((t) => t.key === key)?.name ?? key;

export default function EssayGrade({ essayId, root, draft, brief, words, loaded, onJump, onAddPrompt }: Props) {
  const bodyId = useId();
  const [saved, setSaved] = useState<SavedGrade | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpenState] = useState(false);

  const setOpen = (value: boolean) => {
    setOpenState(value);
    try { localStorage.setItem(OPEN_KEY, value ? "1" : "0"); } catch {}
  };
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(gradeKey(essayId)) ?? "null");
      if (s && typeof s.draft === "string" && typeof s.brief === "string" && Array.isArray(s.grade?.traits)) setSaved(s);
      setOpenState(localStorage.getItem(OPEN_KEY) === "1");
    } catch { /* Start without a saved grade. */ }
  }, []);

  const unchanged = saved?.draft === draft && saved.brief === brief;
  const run = async () => {
    if (running || unchanged) return;
    if (words < 150) { setError("Write at least 150 words before grading."); return; }
    setRunning(true); setError(null);
    try {
      const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "grade", draft, brief, words }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const next: SavedGrade = { draft, brief, grade: data, previous: saved?.grade.percent };
      setSaved(next); setOpen(true);
      try { localStorage.setItem(gradeKey(essayId), JSON.stringify(next)); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };
  const clear = () => {
    setSaved(null); setError(null);
    try { localStorage.removeItem(gradeKey(essayId)); } catch {}
  };
  const jump = (quote: string) => {
    const range = root.current && passageRange(root.current, quote);
    if (range) onJump(range); else setError("That passage has changed since grading.");
  };
  const quote = (q: string) => <button key={q} className="issue-location" onClick={() => jump(q)} aria-label={`Show passage: ${q}`}><q>{q}</q></button>;

  const grade = saved?.grade;
  return (
    <section className="ai-check grade" aria-label="Rubric grade">
      <button className="ai-check-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span>Grade estimate{grade ? ` · ${grade.letter} (${grade.percent}%)` : ""}</span>
        <span className="ai-check-chevron" aria-hidden="true">›</span>
      </button>
      <div id={bodyId} className="ai-check-body" hidden={!open}>
        {grade && <>
          <p className="ai-headline grade-headline"><b>{grade.letter}</b> <span>{grade.percent}%</span></p>
          <p className="muted ai-meta">
            <span title="Each trait gets a rubric level (0–4); the grade is their weighted average, where Proficient ≈ B and Exemplary ≈ A. It is computed the same way every time, but the levels are an AI reader's judgment.">Rubric estimate, not your teacher’s grade.</span>
            {saved.previous !== undefined && <span> Last grade: {saved.previous}%</span>}
          </p>
          {grade.capped && <p className="warn grade-note">Capped: the essay doesn’t fully answer the prompt, so strong writing alone can’t lift it higher.</p>}
          {!grade.promptScored && <p className="muted grade-note">Not graded against a prompt. <button className="link" onClick={onAddPrompt}>Add the assignment prompt</button> for a prompt-specific grade.</p>}
        </>}
        <div className="ai-check-run">
          <button disabled={!loaded || running || !draft.trim() || unchanged} onClick={() => void run()} title={unchanged ? "No changes since this grade" : undefined}>
            {running ? "Grading…" : grade ? "Grade again" : "Grade my essay"}
          </button>
          {grade && <button onClick={clear}>Clear</button>}
          {grade && !unchanged && <span className="warn">Edited since this grade</span>}
        </div>
        <div aria-live="polite">{error && <p className="error">{error}<KeyErrorLink error={error} /></p>}</div>
        {grade && <>
          <ul className="grade-traits">
            {grade.traits.map((t) => <li key={t.key}>
              <details>
                <summary>
                  <span className="grade-trait-name">{t.name} <span className="muted">{t.weight}%</span></span>
                  <span className="grade-level" data-level={t.level}>{t.label}</span>
                  <span className="grade-pips" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} data-on={n <= t.level || undefined} />)}</span>
                </summary>
                {t.strengths && <p><b>Earns credit:</b> {t.strengths}</p>}
                {t.weaknesses && <p><b>To reach the next level:</b> {t.weaknesses}</p>}
                {t.evidence.map(quote)}
              </details>
            </li>)}
          </ul>
          {grade.nextSteps.length > 0 && <>
            <h4 className="grade-heading">Biggest gains</h4>
            <ol className="grade-steps">{grade.nextSteps.map((s, i) => <li key={i}><span className="muted">{traitName(s.trait)}:</span> {s.step}</li>)}</ol>
          </>}
          {grade.requirements.length > 0 && <>
            <h4 className="grade-heading">Prompt checklist</h4>
            <ul className="grade-reqs">{grade.requirements.map((r, i) => <li key={i} data-status={r.status}>
              <span className="grade-req-mark" aria-label={r.status}>{STATUS[r.status]}</span>
              <div>{r.requirement}{r.note && <p className="muted">{r.note}</p>}{r.evidence && quote(r.evidence)}</div>
            </li>)}</ul>
          </>}
        </>}
      </div>
    </section>
  );
}
