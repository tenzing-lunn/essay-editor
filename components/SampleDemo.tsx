"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { TRAITS } from "@/lib/essay-grade";
import { SAMPLE_ESSAY_PARAGRAPHS, SAMPLE_ESSAY_TITLE } from "@/lib/sample-essay";
import { SAMPLE_GRADE, SAMPLE_ISSUES, markSegments } from "@/lib/sample-results";

const STATUS = { met: "✓", partial: "◐", missed: "✗" } as const;
const traitName = (key: string) => TRAITS.find((t) => t.key === key)?.name ?? key;
const show = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });

/**
 * The sample essay in the editor's layout with the fixture's results: paper with underlines on the left, the grade card and
 * suggestion cards on the right. Static markup stands in for the editor's ::highlight marks; the only behaviour is that an
 * underline and its card select each other.
 */
export default function SampleDemo() {
  const [active, setActive] = useState<number | null>(null);
  const [gradeOpen, setGradeOpen] = useState(true);
  const grade = SAMPLE_GRADE;
  const pick = (i: number, target: "card" | "mark") => { setActive(i); show(`sample-${target}-${i}`); };

  return <div className="sample">
    <header className="sample-bar">
      <Link href="/" className="home-brand">{APP_NAME}</Link>
      <p>This is a sample. The grade and suggestions were computed once and saved; nothing on this page runs the AI.</p>
      <Link className="button primary" href="/login?next=/">Check my own essay</Link>
    </header>
    <div className="sample-body">
      <div className="sample-paper">
        <div className="page-fit" data-fluid>
          <article className="page" aria-label="Sample essay">
            <h1>{SAMPLE_ESSAY_TITLE}</h1>
            {SAMPLE_ESSAY_PARAGRAPHS.map((p, pi) => <p key={pi}>{markSegments(p, SAMPLE_ISSUES).map((seg, si) => seg.issue === undefined ? <Fragment key={si}>{seg.text}</Fragment>
              : <mark key={si} id={`sample-mark-${seg.issue}`} className="sample-mark" data-category={SAMPLE_ISSUES[seg.issue].category} data-active={seg.issue === active || undefined}
                role="button" tabIndex={0} aria-label={`${SAMPLE_ISSUES[seg.issue].category}: ${seg.text}`}
                onClick={() => pick(seg.issue!, "card")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(seg.issue!, "card"); } }}>{seg.text}</mark>)}</p>)}
          </article>
        </div>
      </div>
      <aside className="side sample-side" aria-label="Feedback">
        <section className="ai-check grade" aria-label="Rubric grade">
          <button className="ai-check-toggle" aria-expanded={gradeOpen} aria-controls="sample-grade" onClick={() => setGradeOpen(!gradeOpen)}>
            <span>Grade estimate · {grade.letter} ({grade.percent}%)</span>
            <span className="ai-check-chevron" aria-hidden="true">›</span>
          </button>
          <div id="sample-grade" className="ai-check-body" hidden={!gradeOpen}>
            <p className="ai-headline grade-headline"><b>{grade.letter}</b> <span>{grade.percent}%</span></p>
            <p className="muted ai-meta">
              <span title="Each trait gets a rubric level (0–4); the grade is their weighted average, where Proficient ≈ B and Exemplary ≈ A. It is computed the same way every time, but the levels are an AI reader's judgment.">Rubric estimate, not your teacher’s grade.</span>
            </p>
            <h4 className="grade-heading">Biggest gains</h4>
            <ol className="grade-steps">{grade.nextSteps.map((s, i) => <li key={i}><span className="muted">{traitName(s.trait)}:</span> {s.step}</li>)}</ol>
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
                  {t.evidence.map((q) => <q key={q} className="sample-evidence">{q}</q>)}
                </details>
              </li>)}
            </ul>
            <h4 className="grade-heading">Prompt checklist</h4>
            <ul className="grade-reqs">{grade.requirements.map((r, i) => <li key={i} data-status={r.status}>
              <span className="grade-req-mark" aria-label={r.status}>{STATUS[r.status]}</span>
              <div>{r.requirement}{r.note && <p className="muted">{r.note}</p>}{r.evidence && <q className="sample-evidence">{r.evidence}</q>}</div>
            </li>)}</ul>
          </div>
        </section>
        <h2>Suggestions · {SAMPLE_ISSUES.length}</h2>
        {SAMPLE_ISSUES.map((s, i) => <div key={i} id={`sample-card-${i}`} className="issue" data-category={s.category} aria-current={i === active ? "true" : undefined} onClick={() => pick(i, "mark")}>
          <div className="issue-head"><span className="issue-category">{s.category}</span></div>
          <button className="issue-location" aria-label={`Show in essay: ${s.quote}`}><q>{s.quote}</q></button>
          <p className="issue-note">{s.note}</p>
          {s.replacement && <div className="essay-suggestion"><div className="suggestion-diff" aria-label="Suggested change"><del>{s.quote}</del> <ins>{s.replacement}</ins></div></div>}
        </div>)}
      </aside>
    </div>
  </div>;
}
