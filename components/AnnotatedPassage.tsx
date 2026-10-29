"use client";

import { Fragment, useState } from "react";
import type { KeyboardEvent } from "react";
import type { EssayIssue } from "@/lib/essay-issues";
import { markSegments } from "@/lib/sample-results";

/** The changed words only, widened to whole words: "sympathy, he" → "sympathy; he" shows as sympathy, → sympathy; */
export function wordDiff(from: string, to: string) {
  let a = 0;
  while (a < from.length && a < to.length && from[a] === to[a]) a++;
  let b = 0;
  while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++;
  while (a > 0 && /\S/.test(from[a - 1])) a--;
  while (b > 0 && /\S/.test(from[from.length - b])) b--;
  return { del: from.slice(a, from.length - b).trim(), ins: to.slice(a, to.length - b).trim() };
}

/**
 * One paragraph framed like the editor: the page on the desk with its marks underlined, the notes panel beside it. A mark and
 * its note select each other; the other notes dim. Below 900px the notes stack under the page.
 */
export default function AnnotatedPassage({ paragraph, issues, initial = 0, label }: { paragraph: string; issues: readonly EssayIssue[]; initial?: number; label: string }) {
  const [active, setActive] = useState(initial);
  const press = (i: number) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(i); } };
  const segs = markSegments(paragraph, issues);
  return <figure className="annot">
    <figcaption className="annot-label">{label}</figcaption>
    <div className="annot-frame">
      <div className="annot-desk">
        <p className="annot-page">{segs.map((seg, k) => seg.issue === undefined ? <Fragment key={k}>{seg.text}</Fragment>
          : <Fragment key={k}><mark className="mark" data-category={issues[seg.issue].category} data-on={seg.issue === active || undefined}
              role="button" tabIndex={0} aria-pressed={seg.issue === active} aria-describedby={`annot-note-${seg.issue}`}
              onClick={() => setActive(seg.issue!)} onKeyDown={press(seg.issue)}>{seg.text}</mark><sup className="mark-n" aria-hidden="true">{seg.issue + 1}</sup></Fragment>)}</p>
      </div>
      <div className="annot-panel">
        <p className="notes-head">Notes · {issues.length}</p>
        <ol className="notes" aria-label="Scholia's notes" data-picking>
          {issues.map((s, i) => {
            const fix = s.replacement ? wordDiff(s.quote, s.replacement) : null;
            return <li key={i} id={`annot-note-${i}`} className="note" data-category={s.category} data-on={i === active || undefined} onClick={() => setActive(i)}>
              <p className="note-tag"><span className="note-cat">{s.category}</span><span className="note-n">{i + 1}</span></p>
              <button className="note-quote" aria-pressed={i === active} aria-label={`Select note ${i + 1}: ${s.quote}`}><span className="mark-quote">{s.quote}</span></button>
              <p className="note-body">{s.note}</p>
              {fix && <p className="note-fix" aria-label={`Change ${fix.del} to ${fix.ins}`}><del>{fix.del}</del> <ins>{fix.ins}</ins></p>}
            </li>;
          })}
        </ol>
      </div>
    </div>
  </figure>;
}
