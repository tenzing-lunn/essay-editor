"use client";

import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";
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

type Line = { d: string; i: number };
const GRID = 32;

/**
 * One paragraph on ruled paper with Scholia's notes in the margin beside it. Each mark carries a sigla number; each note sits
 * level with its line and is tied to it by a pen line drawn across the gutter. Opening a note dims the others.
 * Below 960px the notes fold under the paragraph and the lines are not drawn.
 */
export default function AnnotatedPassage({ paragraph, issues, initial = 0, label }: { paragraph: string; issues: readonly EssayIssue[]; initial?: number; label: string }) {
  const [active, setActiveState] = useState(initial);
  const [touched, setTouched] = useState(false);
  const setActive = (i: number) => { setActiveState(i); setTouched(true); };
  const [tops, setTops] = useState<number[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [height, setHeight] = useState<number | undefined>();
  const root = useRef<HTMLDivElement>(null);

  const layout = useCallback(() => {
    const el = root.current;
    if (!el || !matchMedia("(min-width: 960px)").matches) { setTops(null); setLines([]); setHeight(undefined); return; }
    const box = el.getBoundingClientRect();
    const notes = [...el.querySelectorAll<HTMLElement>(".note")];
    const text = el.querySelector<HTMLElement>(".annot-text")!.getBoundingClientRect();
    const margin = el.querySelector<HTMLElement>(".annot-notes")!.getBoundingClientRect();
    const next: number[] = [];
    const paths: Line[] = [];
    let floor = 0;
    const marks: { i: number; first: DOMRect }[] = [];
    issues.forEach((_, i) => {
      const rects = el.querySelector(`[data-mark="${i}"]`)?.getClientRects();
      if (!rects?.length) return;
      const first = rects[0];
      const top = Math.max(Math.round((first.top - margin.top) / GRID) * GRID, floor);
      next[i] = top;
      floor = top + Math.ceil(notes[i].offsetHeight / GRID) * GRID + GRID;
      marks.push({ i, first });
    });
    // When the notes run past the paragraph, lift the whole stack (never above the passage's first line) so it stays level with the text.
    const textH = el.querySelector<HTMLElement>(".annot-text")!.offsetHeight;
    const lift = Math.min(Math.max(0, floor - GRID - textH), next[marks[0]?.i] ?? 0);
    const shift = Math.floor(lift / GRID) * GRID;
    marks.forEach(({ i, first }) => {
      next[i] -= shift;
      // From the gutter level with the mark's first line, across the pink rule, to the note's first line.
      const x1 = text.right - box.left + 10, y1 = first.top - box.top + first.height / 2 + 2;
      const x2 = margin.left - box.left - 8, y2 = margin.top - box.top + next[i] + GRID / 2 + 2;
      const bend = (x2 - x1) * 0.55;
      paths.push({ i, d: `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` });
    });
    floor -= shift + GRID;
    setTops(next);
    setLines(paths);
    setHeight(Math.max(floor, textH));
  }, [issues]);

  useLayoutEffect(() => {
    layout();
    const ro = new ResizeObserver(layout);
    if (root.current) ro.observe(root.current);
    document.fonts?.ready.then(layout);
    return () => ro.disconnect();
  }, [layout]);

  const segs = markSegments(paragraph, issues);
  return <div ref={root} className="annot sheet-row" data-laid={tops ? "" : undefined} style={{ minHeight: height }}>
    <div className="annot-text">
      <p className="annot-label">{label}</p>
      <p className="typed">{segs.map((seg, k) => seg.issue === undefined ? <Fragment key={k}>{seg.text}</Fragment>
        : <Fragment key={k}><mark data-mark={seg.issue} className="mark hl" data-category={issues[seg.issue].category} data-on={seg.issue === active || undefined}
            tabIndex={0} aria-describedby={`note-${seg.issue}`} onMouseEnter={() => setActive(seg.issue!)} onFocus={() => setActive(seg.issue!)}>{seg.text}</mark><sup className="sigla" data-category={issues[seg.issue].category}>{seg.issue + 1}</sup></Fragment>)}</p>
    </div>
    <ol className="annot-notes" aria-label="Scholia's notes">
      {issues.map((s, i) => {
        const fix = s.replacement ? wordDiff(s.quote, s.replacement) : null;
        return <li key={i} id={`note-${i}`} className="note" data-category={s.category} data-on={i === active || undefined}
          style={tops?.[i] !== undefined ? { top: tops[i] } : undefined} onMouseEnter={() => setActive(i)}>
          <p className="note-body"><span className="note-sigla">{i + 1}</span> <span className="note-cat">{s.category}</span> {s.note}</p>
          {fix && <p className="note-fix" aria-label={`Change ${fix.del} to ${fix.ins}`}><del>{fix.del}</del> <ins>{fix.ins}</ins></p>}
        </li>;
      })}
    </ol>
    <svg className="annot-lines" aria-hidden="true">
      {/* Keyed on the active state, so opening a note redraws its line; once touched, the line that goes inactive stays drawn instead of replaying. */}
      {lines.map((l) => <path key={`${l.i}-${l.i === active}`} d={l.d} pathLength={1} data-category={issues[l.i].category} data-on={l.i === active || undefined}
        style={!touched ? { animationDelay: `${900 + l.i * 220}ms` } : l.i === active ? { animationDelay: "0ms" } : { animation: "none", strokeDashoffset: 0 }} />)}
    </svg>
  </div>;
}
