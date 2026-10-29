"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { wordDiff } from "@/components/AnnotatedPassage";
import Wordmark from "@/components/Wordmark";
import { TRAITS } from "@/lib/essay-grade";
import { SAMPLE_ESSAY_PARAGRAPHS, SAMPLE_ESSAY_TITLE } from "@/lib/sample-essay";
import { SAMPLE_GRADE, SAMPLE_ISSUES, markSegments } from "@/lib/sample-results";

const traitName = (key: string) => TRAITS.find((t) => t.key === key)?.name ?? key;
const show = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });

/** Pen marks for the prompt checklist: a tick, a half tick, a cross. Drawn, never glyphs. */
const PEN = {
  met: "M3 10.5l4 4.5 9-11",
  partial: "M3 10.5l4 4.5 4-5",
  missed: "M4.5 4.5l11 11M15.5 4.5l-11 11",
} as const;
const PenMark = ({ status }: { status: keyof typeof PEN }) =>
  <svg className="pen-mark" data-status={status} viewBox="0 0 20 20" role="img" aria-label={status === "met" ? "Met" : status === "partial" ? "Partly met" : "Missed"}>
    <path d={PEN[status]} />
  </svg>;

/**
 * The sample essay on notebook paper with the fixture's results in the margin beside it: the grade circled at the top, then
 * one note per mark, numbered like the sigla in the text. A mark and its note select each other; the others dim.
 */
export default function SampleDemo() {
  const [active, setActive] = useState<number | null>(null);
  const [gradeOpen, setGradeOpen] = useState(true);
  const grade = SAMPLE_GRADE;
  const pick = (i: number, target: "card" | "mark") => { setActive(i); show(`sample-${target}-${i}`); };
  const body = useRef<HTMLDivElement>(null);
  const [leader, setLeader] = useState("");

  // The active mark's pen line: from the paper's edge level with the mark, across the pink rule, to its note. Redrawn as
  // either column scrolls; hidden when either end is out of view, and on phones, where the notes stack under the essay.
  useEffect(() => {
    const el = body.current;
    if (!el || active === null) { setLeader(""); return; }
    const draw = () => {
      const mark = document.getElementById(`sample-mark-${active}`)?.getClientRects()[0];
      const note = document.getElementById(`sample-card-${active}`)?.getBoundingClientRect();
      const paper = el.querySelector(".sample-paper")!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const inView = (y: number) => y > box.top + 8 && y < box.bottom - 8;
      if (!mark || !note || !matchMedia("(min-width: 901px)").matches || !inView(mark.top) || !inView(note.top + 16)) { setLeader(""); return; }
      const x1 = Math.min(mark.right + 10, paper.right - 24) - box.left, y1 = mark.top + mark.height / 2 - box.top;
      const x2 = note.left - 6 - box.left, y2 = note.top + 16 - box.top;
      const bend = Math.max(40, (x2 - x1) * 0.5);
      setLeader(`M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    };
    const t = setTimeout(draw, 450); // after the smooth scroll settles
    const cols = el.querySelectorAll(".sample-paper, .sample-side");
    cols.forEach((c) => c.addEventListener("scroll", draw, { passive: true }));
    addEventListener("resize", draw);
    return () => { clearTimeout(t); cols.forEach((c) => c.removeEventListener("scroll", draw)); removeEventListener("resize", draw); };
  }, [active]);

  return <div className="sample" data-picking={active !== null || undefined}>
    <header className="sample-bar">
      <Wordmark />
      <p>A sample essay. The grade and notes were computed once and saved; nothing on this page runs the AI.</p>
      <Link className="btn btn-ink" href="/login?next=/">Check my own essay</Link>
    </header>
    <div className="sample-body" ref={body}>
      <div className="sample-paper ruled">
        <article className="sample-sheet" aria-label="Sample essay" lang="en">
          <h1>{SAMPLE_ESSAY_TITLE}</h1>
          {SAMPLE_ESSAY_PARAGRAPHS.map((p, pi) => <p key={pi}>{markSegments(p, SAMPLE_ISSUES).map((seg, si) => seg.issue === undefined ? <Fragment key={si}>{seg.text}</Fragment>
            : <Fragment key={si}><mark id={`sample-mark-${seg.issue}`} className="mark hl" data-category={SAMPLE_ISSUES[seg.issue].category} data-on={seg.issue === active || undefined}
                role="button" tabIndex={0} aria-label={`Note ${seg.issue + 1}, ${SAMPLE_ISSUES[seg.issue].category}: ${seg.text}`}
                onClick={() => pick(seg.issue!, "card")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(seg.issue!, "card"); } }}>{seg.text}</mark>
              <sup className="sigla" data-category={SAMPLE_ISSUES[seg.issue].category}>{seg.issue + 1}</sup></Fragment>)}</p>)}
        </article>
      </div>

      <aside className="sample-side ruled" aria-label="Scholia's notes">
        <section className="sample-grade" aria-label="Rubric grade">
          <div className="sample-grade-head">
            <p className="grade-circle" aria-label={`Grade estimate ${grade.letter}, ${grade.percent} percent`}>
              <span aria-hidden="true">{grade.letter}</span>
              <svg viewBox="0 0 120 92" aria-hidden="true"><path d="M70 9C38 3 9 22 11 50c2 26 34 37 62 32 27-5 41-25 34-47C101 17 84 9 62 9 50 9 40 12 33 17" /></svg>
              <small aria-hidden="true">{grade.percent}%</small>
            </p>
            <button className="sample-toggle" aria-expanded={gradeOpen} aria-controls="sample-grade" onClick={() => setGradeOpen(!gradeOpen)}>{gradeOpen ? "Hide rubric" : "Show rubric"}</button>
          </div>
          <p className="sample-caveat">A rubric estimate, not your teacher’s grade.</p>
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
            <ul className="sample-reqs">{grade.requirements.map((r, i) => <li key={i} data-status={r.status}>
              <PenMark status={r.status} />
              <div>{r.requirement}{r.note && <p>{r.note}</p>}{r.evidence && <q className="sample-evidence">{r.evidence}</q>}</div>
            </li>)}</ul>
          </div>
        </section>

        <h2 className="sample-notes-head">Notes · {SAMPLE_ISSUES.length}</h2>
        <ol className="sample-notes">
          {SAMPLE_ISSUES.map((s, i) => {
            const fix = s.replacement ? wordDiff(s.quote, s.replacement) : null;
            return <li key={i} id={`sample-card-${i}`} className="note" data-category={s.category} data-on={i === active || undefined} onClick={() => pick(i, "mark")}>
              <p className="note-lead"><span className="note-sigla">{i + 1}</span> <span className="note-cat">{s.category}</span></p>
              <button className="note-quote" aria-label={`Show in essay: ${s.quote}`}><span className="hl">{s.quote}</span></button>
              <p className="note-body">{s.note}</p>
              {fix && <p className="note-fix" aria-label={`Change ${fix.del} to ${fix.ins}`}><del>{fix.del}</del> <ins>{fix.ins}</ins></p>}
            </li>;
          })}
        </ol>
      </aside>
      <svg className="annot-lines sample-leader" aria-hidden="true">{leader && <path key={active} d={leader} pathLength={1} data-category={SAMPLE_ISSUES[active!].category} data-on />}</svg>
    </div>
  </div>;
}
