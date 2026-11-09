"use client";

import { useEffect, useId, useState } from "react";
import type { RefObject } from "react";
import { aiFetch } from "@/lib/ai-client";
import { recordCheck } from "@/lib/essay-store";
import { passageRange } from "@/lib/essay-document";
import { checkGate, checksFor, flippedChecks, gradeKey, levelsOf, TRAITS } from "@/lib/essay-grade";
import type { Grade, GradeCheck, StageCheck, TraitKey } from "@/lib/essay-grade";
import KeyErrorLink from "@/components/KeyErrorLink";
import ShareReport from "@/components/ShareReport";
import GradeCircle from "@/components/GradeCircle";
import PenIcon from "@/components/PenIcon";

type Props = {
  essayId: string; root: RefObject<HTMLDivElement | null>; draft: string; brief: string; words: number; loaded: boolean; onJump: (range: Range) => void; onAddPrompt: () => void;
  /** Bumped by the Suggestions tab's Check my essay: each new value grades once, under the same guards as the button, and opens the card. */
  runSignal?: number;
  /** Patterns from the writer's past essays (lib/writer-memory.ts), shown until this essay has a grade. */
  memory?: string[];
  /** The rest of the full read, listed with the grade's checks: the argument map against the plan and the source check. */
  stageChecks?: StageCheck[]; onShowCheck?: (key: string) => void;
};
/** `previous` and `previousLevels` are the grade before this one, so the card can say what moved. */
/** `seen` is the failing checks the writer has seen since this grade (the Check gate); a new grade starts it empty. */
type SavedGrade = { draft: string; brief: string; grade: Grade; previous?: number; previousLevels?: Partial<Record<TraitKey, number>>; seen?: string[] };

const OPEN_KEY = "essay:grade-open";
const STATUS = { met: "Met", partial: "Partly met", missed: "Missed" } as const;
const FLIP = { pass: "Now passes", fail: "Now fails" } as const;
const STAGE = { pass: "Passes", fail: "Fails", unknown: "Not checked" } as const;
const traitName = (key: string) => TRAITS.find((t) => t.key === key)?.name ?? key;

export default function EssayGrade({ essayId, root, draft, brief, words, loaded, onJump, onAddPrompt, runSignal, memory = [], stageChecks = [], onShowCheck }: Props) {
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
      if (s && typeof s.draft === "string" && typeof s.brief === "string" && Array.isArray(s.grade?.traits)) setSaved({ ...s, seen: Array.isArray(s.seen) ? s.seen.filter((k: unknown) => typeof k === "string") : [] });
      setOpenState(localStorage.getItem(OPEN_KEY) === "1");
    } catch { /* Start without a saved grade. */ }
  }, []);

  const unchanged = saved?.draft === draft && saved.brief === brief;
  // `fromCheck`: the hero ran the live check too, and the panel already shows its no-key or used-up error, so the card stays quiet.
  const run = async (fromCheck = false) => {
    if (running || unchanged) return;
    if (words < 150) { setError("Write at least 150 words before grading."); return; }
    setRunning(true); setError(null);
    try {
      const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "grade", draft, brief, words }) });
      const data = await response.json();
      if (!response.ok && fromCheck && (response.status === 401 || response.status === 402)) return;
      if (!response.ok) throw new Error(data.error);
      const next: SavedGrade = { draft, brief, grade: data, previous: saved?.grade.percent, previousLevels: saved ? levelsOf(saved.grade) : undefined };
      setSaved(next); setOpen(true);
      void recordCheck(essayId, { kind: "grade", words: Math.min(words, 100000), levels: levelsOf(data) });
      try { localStorage.setItem(gradeKey(essayId), JSON.stringify(next)); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };
  // The editor hands this card to SuggestionsTab as a ReactNode, so the hero button reaches it through this prop, not a callback.
  useEffect(() => {
    if (!runSignal) return;
    setOpen(true); void run(true);
  }, [runSignal]);
  const clear = () => {
    setSaved(null); setError(null);
    try { localStorage.removeItem(gradeKey(essayId)); } catch {}
  };
  const seen = saved?.seen ?? [];
  const setSeen = (next: string[]) => {
    if (!saved) return;
    const updated = { ...saved, seen: next };
    setSaved(updated);
    try { localStorage.setItem(gradeKey(essayId), JSON.stringify(updated)); } catch {}
  };
  // Going to a failing check's passage, or to where a stage check lives, counts as seeing it.
  const see = (key: string) => { if (!seen.includes(key)) setSeen([...seen, key]); };
  const jump = (quote: string, key: string) => {
    const range = root.current && passageRange(root.current, quote);
    if (range) { onJump(range); see(key); } else setError("That passage has changed since grading.");
  };
  const quote = (q: string, key: string) => <button key={q} className="issue-location" onClick={() => jump(q, key)} aria-label={`Show passage: ${q}`}><q className="mark-quote">{q}</q></button>;
  const seenToggle = (key: string) => <button className="link grade-check-seen" aria-pressed={seen.includes(key)}
    onClick={() => setSeen(seen.includes(key) ? seen.filter((k) => k !== key) : [...seen, key])}>{seen.includes(key) ? "Seen" : "Mark seen"}</button>;

  const grade = saved?.grade;
  const checks = grade ? checksFor(grade) : [];
  const flips = grade ? flippedChecks(saved.previousLevels, grade) : {};
  const passing = (list: GradeCheck[], what: string) => `${list.filter((c) => c.pass).length} of ${list.length} ${what}`;
  const checkRow = (c: GradeCheck) => {
    const trait = c.kind === "trait" ? grade!.traits.find((t) => t.key === c.key) : undefined;
    const state = c.pass ? "pass" : c.status === "partial" ? "partial" : "fail";
    const flip = trait && flips[trait.key];
    return <li key={c.key} className="grade-check" data-state={state} data-seen={!c.pass && seen.includes(c.key)}>
      <PenIcon name={c.pass ? "tick" : c.status === "partial" ? "half" : "cross"} size={18} className="grade-check-icon" />
      <div>
        <p className="grade-check-head">
          <span className="grade-check-name">{c.name}</span>
          <span className="grade-check-verdict">{trait ? `${c.pass ? "Passes" : "Fails"} · ${trait.label}` : STATUS[c.status!]}</span>
          {flip && <span className="grade-check-flip" data-flip={flip}>{FLIP[flip]}</span>}
          {!c.pass && seenToggle(c.key)}
        </p>
        {c.detail && <p className="grade-check-detail">{trait && !c.pass ? `To pass: ${c.detail}` : c.detail}</p>}
        {c.evidence.map((q) => quote(q, c.key))}
      </div>
    </li>;
  };
  const stageRow = (c: StageCheck) => <li key={c.key} className="grade-check" data-state={c.state} data-seen={c.state === "fail" && seen.includes(c.key)}>
    <PenIcon name={c.state === "pass" ? "tick" : c.state === "fail" ? "cross" : "half"} size={18} className="grade-check-icon" />
    <div>
      <p className="grade-check-head">
        <span className="grade-check-name">{c.name}</span>
        <span className="grade-check-verdict">{STAGE[c.state]}</span>
        {c.state === "fail" && seenToggle(c.key)}
      </p>
      {c.detail && <p className="grade-check-detail">{c.detail}</p>}
      {onShowCheck && <button className="link grade-check-show" onClick={() => { onShowCheck(c.key); if (c.state === "fail") see(c.key); }}>{c.show}</button>}
    </div>
  </li>;
  const failing = [...checks.filter((c) => !c.pass).map((c) => c.key), ...stageChecks.filter((c) => c.state === "fail").map((c) => c.key)];
  const gate = checkGate(failing, seen);
  const passingCount = checks.filter((c) => c.pass).length + stageChecks.filter((c) => c.state === "pass").length;
  return (
    <section className="ai-check grade" aria-label="Rubric grade">
      <button className="ai-check-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span>Grade estimate{grade ? ` · ${grade.letter} (${grade.percent}%)` : ""}</span>
        <PenIcon name="chevron-right" className="ai-check-chevron" />
      </button>
      <div id={bodyId} className="ai-check-body" hidden={!open}>
        {grade && <>
          <GradeCircle letter={grade.letter} percent={grade.percent} />
          <p className="grade-caveat">
            <span title="Each trait gets a rubric level (0–4); the grade is their weighted average, where Proficient ≈ B and Exemplary ≈ A. It is computed the same way every time, but the levels are an AI reader's judgment.">Rubric estimate, not your teacher’s grade.</span>
            {saved.previous !== undefined && <span> Last grade: {saved.previous}%</span>}
          </p>
          {grade.capped && <p className="warn grade-note">Capped: the essay doesn’t fully answer the prompt, so strong writing alone can’t lift it higher.</p>}
          {!grade.promptScored && <p className="muted grade-note">Not graded against a prompt. <button className="link" onClick={onAddPrompt}>Add the assignment prompt</button> for a prompt-specific grade.</p>}
          <p className="grade-summary">{passing(checks.filter((c) => c.kind === "trait"), "rubric checks pass")}
            {checks.some((c) => c.kind === "requirement") && <> · {passing(checks.filter((c) => c.kind === "requirement"), "prompt requirements met")}</>}</p>
          {/* The three fixes come right under the letter: they are what the grade is for, so they read before the checks. */}
          {grade.nextSteps.length > 0 && <>
            <h4 className="grade-heading">Biggest gains</h4>
            <ol className="grade-steps">{grade.nextSteps.map((s, i) => <li key={i}><span className="muted">{traitName(s.trait)}:</span> {s.step}</li>)}</ol>
          </>}
          <ShareReport grade={grade} stale={!unchanged} />
        </>}
        {!grade && memory.length > 0 && <div className="grade-memory">
          <h4 className="grade-heading">From your past essays</h4>
          <ul>{memory.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>}
        <div className="ai-check-run">
          <button disabled={!loaded || running || !draft.trim() || unchanged} onClick={() => void run()} title={unchanged ? "No changes since this grade" : undefined}>
            {running ? "Grading…" : grade ? "Grade again" : "Grade my essay"}
          </button>
          {grade && <button onClick={clear}>Clear</button>}
          {grade && !unchanged && <span className="warn">Edited since this grade</span>}
        </div>
        <div aria-live="polite">{error && <p className="error">{error}<KeyErrorLink error={error} /></p>}</div>
        {grade && <>
          {/* The full read as a test suite: failing checks first and open, then any not yet run, passing ones folded away. */}
          <h4 className="grade-heading">Checks</h4>
          <ul className="grade-checks">{checks.filter((c) => !c.pass).map(checkRow)}{stageChecks.filter((c) => c.state === "fail").map(stageRow)}{stageChecks.filter((c) => c.state === "unknown").map(stageRow)}</ul>
          {passingCount > 0 && <details className="grade-passing">
            <summary>{passingCount} passing</summary>
            <ul className="grade-checks">{checks.filter((c) => c.pass).map(checkRow)}{stageChecks.filter((c) => c.state === "pass").map(stageRow)}</ul>
          </details>}
          {/* The gate out of Check: code counts what the writer has seen; nothing is locked. */}
          <h4 className="grade-heading">Before you revise</h4>
          <ul className="grade-checks">{gate.checks.map((c) => <li key={c.key} className="grade-check" data-state={c.pass ? "pass" : "fail"}>
            <PenIcon name={c.pass ? "tick" : "cross"} size={18} className="grade-check-icon" />
            <div>
              <p className="grade-check-head"><span className="grade-check-name">{c.name}</span></p>
              {c.detail && <p className="grade-check-detail">{c.detail}</p>}
            </div>
          </li>)}</ul>
          {gate.pass && failing.length > 0 && <p className="grade-gate">Ready to revise. Fix each one in your own words, then check again.</p>}
        </>}
      </div>
    </section>
  );
}
