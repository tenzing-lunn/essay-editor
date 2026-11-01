"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { wordDiff } from "@/components/AnnotatedPassage";
import GradeCircle from "@/components/GradeCircle";
import PenIcon from "@/components/PenIcon";
import Wordmark from "@/components/Wordmark";
import { TRAITS } from "@/lib/essay-grade";
import { SAMPLE_ESSAY_PARAGRAPHS, SAMPLE_ESSAY_TITLE } from "@/lib/sample-essay";
import { SAMPLE_GRADE, SAMPLE_ISSUES, markSegments } from "@/lib/sample-results";

const traitName = (key: string) => TRAITS.find((t) => t.key === key)?.name ?? key;
const show = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });

/** The prompt checklist's status, as an icon and in words; failing rows first. */
const STATUS = {
  missed: { icon: "cross", label: "Missed", order: 0 },
  partial: { icon: "half", label: "Partly met", order: 1 },
  met: { icon: "tick", label: "Met", order: 2 },
} as const;

/**
 * The sample essay as a page on the desk with the fixture's results in the panel beside it: the grade card on top, then one
 * note per mark, numbered like the counters in the text. A mark and its note select each other; the other notes dim.
 */
export default function SampleDemo() {
  const [active, setActive] = useState<number | null>(null);
  const [gradeOpen, setGradeOpen] = useState(true);
  const grade = SAMPLE_GRADE;
  const reqs = [...grade.requirements].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order);
  const pick = (i: number, target: "card" | "mark") => { setActive(i); show(`sample-${target}-${i}`); };

  return <div className="sample">
    <header className="sample-bar">
      <Wordmark />
      <p>A sample essay. The grade and notes were computed once and saved; nothing on this page runs the AI.</p>
      <Link className="btn btn-ink" href="/login?next=/">Check my own essay</Link>
    </header>
    <div className="sample-body">
      <div className="sample-desk">
        <article className="sample-page" aria-label="Sample essay" lang="en">
          <h1>{SAMPLE_ESSAY_TITLE}</h1>
          {SAMPLE_ESSAY_PARAGRAPHS.map((p, pi) => <p key={pi}>{markSegments(p, SAMPLE_ISSUES).map((seg, si) => seg.issue === undefined ? <Fragment key={si}>{seg.text}</Fragment>
            : <Fragment key={si}><mark id={`sample-mark-${seg.issue}`} className="mark" data-category={SAMPLE_ISSUES[seg.issue].category} data-on={seg.issue === active || undefined}
                role="button" tabIndex={0} aria-label={`Note ${seg.issue + 1}, ${SAMPLE_ISSUES[seg.issue].category}: ${seg.text}`}
                onClick={() => pick(seg.issue!, "card")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(seg.issue!, "card"); } }}>{seg.text}</mark>
              <sup className="mark-n" aria-hidden="true">{seg.issue + 1}</sup></Fragment>)}</p>)}
        </article>
      </div>

      <aside className="sample-side" aria-label="Scholia's notes">
        <section className="sample-grade" aria-label="Rubric grade">
          <div className="sample-grade-head">
            <GradeCircle letter={grade.letter} percent={grade.percent} />
            <button className="sample-toggle" aria-expanded={gradeOpen} aria-controls="sample-grade" onClick={() => setGradeOpen(!gradeOpen)}>{gradeOpen ? "Hide rubric" : "Show rubric"}</button>
          </div>
          <p className="sample-caveat">Rubric estimate, not your teacher’s grade.</p>
          <div id="sample-grade" hidden={!gradeOpen}>
            <h2>Biggest gains</h2>
            <ol className="sample-gains">{grade.nextSteps.map((s, i) => <li key={i}><b>{traitName(s.trait)}.</b> {s.step}</li>)}</ol>
            <h2>Rubric</h2>
            <ul className="sample-traits">
              {grade.traits.map((t) => <li key={t.key}>
                <details>
                  <summary>
                    <span className="trait-name">{t.name} <span className="trait-weight">{t.weight}%</span></span>
                    <span className="trait-level" data-level={t.level}>{t.label}</span>
                    <span className="trait-pips" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} data-on={n <= t.level || undefined} />)}</span>
                  </summary>
                  {t.strengths && <p><b>Earns credit:</b> {t.strengths}</p>}
                  {t.weaknesses && <p><b>To reach the next level:</b> {t.weaknesses}</p>}
                  {t.evidence.map((q) => <q key={q} className="sample-evidence">{q}</q>)}
                </details>
              </li>)}
            </ul>
            <h2>Prompt checklist</h2>
            <ul className="sample-reqs">{reqs.map((r, i) => <li key={i} data-status={r.status}>
              <PenIcon name={STATUS[r.status].icon} size={20} className="pen-mark" data-status={r.status} />
              <div>
                <p className="req-name">{r.requirement}</p>
                <p><b className="req-status" data-status={r.status}>{STATUS[r.status].label}.</b>{r.note && <> {r.note}</>}</p>
                {r.evidence && <q className="sample-evidence">{r.evidence}</q>}
              </div>
            </li>)}</ul>
          </div>
        </section>

        <h2 className="notes-head">Notes · {SAMPLE_ISSUES.length}</h2>
        <ol className="notes" data-picking={active !== null || undefined}>
          {SAMPLE_ISSUES.map((s, i) => {
            const fix = s.replacement ? wordDiff(s.quote, s.replacement) : null;
            return <li key={i} id={`sample-card-${i}`} className="note" data-category={s.category} data-on={i === active || undefined} onClick={() => pick(i, "mark")}>
              <p className="note-tag"><span className="note-cat">{s.category}</span><span className="note-n">{i + 1}</span></p>
              <button className="note-quote" aria-label={`Show in essay: ${s.quote}`}><span className="mark-quote">{s.quote}</span></button>
              <p className="note-body">{s.note}</p>
              {fix && <p className="note-fix" aria-label={`Change ${fix.del} to ${fix.ins}`}><del>{fix.del}</del> <ins>{fix.ins}</ins></p>}
            </li>;
          })}
        </ol>
      </aside>
    </div>
  </div>;
}
