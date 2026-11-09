"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode, RefObject } from "react";
import { essayParagraphs } from "@/lib/essay-document";
import { ORIGIN_LABEL, stackMargin } from "@/lib/notes";
import type { Note } from "@/lib/notes";
import { SuggestionDiff } from "@/components/EssaySuggestion";

export type Outcome = "fixed" | "skipped" | "dismissed";
export type SelectionCard = { quote: string; answer: string; replacements: string[]; fresh: boolean; paragraphId: number };
type Props = {
  root: RefObject<HTMLDivElement | null>; layoutKey: string; mode: "write" | "review";
  notes: Note[]; current: Note | null; position: { at: number; total: number }; outcomes: Record<string, Outcome>;
  status: string; checking: number;
  selection: SelectionCard | null; selectionBusy: boolean; onReplace: (word: string) => void; onDismissSelection: () => void;
  canApply: (note: Note) => boolean; onApply: (note: Note) => void; onDismiss: (note: Note) => void; onDone: (note: Note) => void;
  onJump: (note: Note) => void; onFixNow: (note: Note) => void; onFindEvidence: (note: Note) => void; onOpenPlan: () => void;
  onAsk: (note: Note, question: string) => void; onSkip: () => void; onPrev: () => void; onNext: () => void;
  onStartReview: (paragraphId?: number) => void; fixes: (note: Note) => ReactNode; aiCheck: ReactNode;
};
const HIDDEN_KEY = "essay:margin-hidden";
const WIDTH_KEY = "essay:margin-width";
const MIN_WIDTH = 240, MAX_WIDTH = 520, HIDE_BELOW = 160;

const QUICK = new Set(["Grammar", "Wrong word"]);
const SHORT: Record<Outcome, string> = { fixed: "Fixed", skipped: "Skipped", dismissed: "Not a problem" };

/** The page's margin: AI notes beside the paragraph they are about. Quiet while writing; in Review it holds the one note being worked. */
export default function EssayMargin(props: Props) {
  const { root, layoutKey, mode, notes, current, outcomes, selection } = props;
  const box = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(HIDDEN_KEY) === "1"); } catch {} }, []);
  const toggleHidden = () => setHidden((h) => { try { localStorage.setItem(HIDDEN_KEY, h ? "0" : "1"); } catch {} return !h; });
  const [width, setWidth] = useState(300);
  useEffect(() => { try { const w = Number(localStorage.getItem(WIDTH_KEY)); if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w); } catch {} }, []);
  // Review always shows the note being worked, so only Write can be folded away.
  const collapsed = hidden && mode === "write";
  // Dragging the line: wider or narrower, and past a point it folds the margin away; drag back out to open it.
  const drag = useRef<{ right: number; w: number; hide: boolean } | null>(null);
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button") || !box.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { right: box.current.getBoundingClientRect().right, w: width, hide: collapsed };
  };
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const w = d.right - e.clientX;
    d.hide = mode === "write" && w < HIDE_BELOW;
    if (!d.hide) d.w = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
    setHidden(d.hide); setWidth(d.w);
  };
  const endDrag = () => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    try { localStorage.setItem(WIDTH_KEY, String(d.w)); localStorage.setItem(HIDDEN_KEY, d.hide ? "1" : "0"); } catch {}
  };
  const cards = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<Record<string, number>>({});
  const [relayout, setRelayout] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  useEffect(() => { setShowHow(false); setAsking(false); setQuestion(""); }, [current?.id]);
  // Notes Review handled may vanish from the list (applied, dismissed); remember where they were so their chip stays put.
  const handledParagraph = useRef(new Map<string, number>());
  for (const n of notes) if (n.paragraphId !== undefined) handledParagraph.current.set(n.id, n.paragraphId);

  // Slots: one for the selection answer, one per paragraph that has something to show, one for notes about the whole essay.
  type Slot = { key: string; paragraphId?: number; body: ReactNode };
  const slots: Slot[] = [];
  const byParagraph = new Map<number, Note[]>();
  const loose: Note[] = [];
  for (const n of notes) {
    if (n.paragraphId === undefined) loose.push(n);
    else byParagraph.set(n.paragraphId, [...byParagraph.get(n.paragraphId) ?? [], n]);
  }
  const card = (n: Note) => <ReviewCard {...props} note={n} showHow={showHow} onShowHow={() => setShowHow((v) => !v)}
    asking={asking} onAsking={setAsking} question={question} onQuestion={setQuestion} />;
  const asked: Slot[] = [];
  if (selection) asked.push({ key: "selection", paragraphId: selection.paragraphId < 0 ? undefined : selection.paragraphId, body: <section className="issue margin-answer" aria-label="Answer about your selection">
    <div className="issue-head"><span className="issue-origin">You asked</span>{!selection.fresh && <span className="muted">Selection changed</span>}</div>
    {selection.answer && <p className="issue-note">{selection.answer}</p>}
    {selection.replacements.length > 0 && <div className="chips synonyms" aria-label="Replacements">
      {selection.replacements.map((word) => <button key={word} disabled={!selection.fresh} title={`Replace with “${word}”`} onClick={() => props.onReplace(word)}>{word}</button>)}
    </div>}
    <div className="suggestion-actions"><button onClick={props.onDismissSelection}>Dismiss</button></div>
  </section> });
  if (props.selectionBusy && !selection) asked.push({ key: "busy", body: <p className="muted margin-busy">Working…</p> });
  if (mode === "review") {
    // The answer to an Ask rides under the current card, so it shows on phones too, where only that card is visible.
    if (current) slots.push({ key: "current", paragraphId: current.paragraphId, body: <div className="margin-stack">{card(current)}{asked.map((a) => <div key={a.key}>{a.body}</div>)}</div> });
    const handled = new Map<number, Outcome[]>();
    for (const [id, outcome] of Object.entries(outcomes)) {
      const n = notes.find((x) => x.id === id) ?? null;
      const at = n?.paragraphId ?? handledParagraph.current.get(id);
      if (at !== undefined && at !== current?.paragraphId) handled.set(at, [...handled.get(at) ?? [], outcome]);
    }
    for (const [at, list] of handled) slots.push({ key: `done:${at}`, paragraphId: at, body: <div className="margin-chips">{list.map((o, i) => <span key={i} className="margin-chip" data-outcome={o}>{o === "fixed" ? "✓ " : ""}{SHORT[o]}</span>)}</div> });
  } else {
    slots.push(...asked);
    for (const [at, list] of byParagraph) {
      const quick = list.filter((n) => n.category && QUICK.has(n.category) && n.replacement && props.canApply(n));
      const waiting = list.length - quick.length;
      slots.push({ key: `p:${at}`, paragraphId: at, body: <div className="margin-chips">
        {quick.map((n) => <span key={n.id} className="margin-quick" data-category={n.category}>
          <SuggestionDiff original={n.quote ?? ""} replacement={n.replacement!} />
          <button className="link" onClick={() => props.onApply(n)}>Apply</button>
          <button className="link margin-x" aria-label={`Dismiss: ${n.text}`} onClick={() => props.onDismiss(n)}>×</button>
        </span>)}
        {waiting > 0 && <button className="margin-chip margin-waiting" onClick={() => props.onStartReview(at)}>{waiting} note{waiting === 1 ? "" : "s"} waiting</button>}
      </div> });
    }
    if (loose.length) slots.push({ key: "loose", body: <button className="margin-chip margin-waiting" onClick={() => props.onStartReview()}>{loose.length} note{loose.length === 1 ? "" : "s"} about the whole essay</button> });
  }
  const shownKeys = slots.map((s) => s.key).join("|");
  const paragraphOf = new Map(slots.map((s) => [s.key, s.paragraphId]));

  useLayoutEffect(() => {
    const container = box.current, editor = root.current;
    if (!container || !editor) return;
    const origin = container.getBoundingClientRect().top;
    const paras = essayParagraphs(editor);
    // The count and the AI check sit at the top of the margin; cards are pushed below them like any card above.
    const items = [{ key: "__top", top: 0, height: topRef.current?.offsetHeight ?? 0 }, ...slots.map((s) => {
      const el = cards.current.get(s.key);
      const p = s.paragraphId === undefined ? null : paras[s.paragraphId];
      return { key: s.key, top: p ? p.getBoundingClientRect().top - origin : 0, height: el?.offsetHeight ?? 0 };
    })];
    const next = Object.fromEntries(stackMargin(items, 8).filter(({ key }) => key !== "__top").map(({ key, top }) => [key, Math.round(top)]));
    if (JSON.stringify(next) !== JSON.stringify(tops)) setTops(next);
  }, [shownKeys, layoutKey, relayout, showHow, asking, current?.id, collapsed, width]);
  useEffect(() => {
    const editor = root.current; if (!editor) return;
    const again = () => setRelayout((n) => n + 1);
    const observer = new ResizeObserver(again); observer.observe(editor);
    const cardObserver = new ResizeObserver(again); cards.current.forEach((el) => cardObserver.observe(el));
    if (topRef.current) cardObserver.observe(topRef.current);
    void document.fonts?.ready.then(again);
    window.addEventListener("resize", again);
    return () => { observer.disconnect(); cardObserver.disconnect(); window.removeEventListener("resize", again); };
  }, [root, shownKeys, collapsed]);

  const total = notes.length;
  return <aside className="essay-margin" ref={box} aria-label="Notes in the margin" data-mode={mode} data-collapsed={collapsed || undefined} style={collapsed ? undefined : { width }}>
    <div className="margin-divider" role="separator" aria-orientation="vertical" aria-label="Drag to resize or hide the notes"
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {mode === "write" && <button className="margin-toggle" aria-expanded={!collapsed} aria-label={collapsed ? `Show notes${total ? ` (${total})` : ""}` : "Hide notes"}
        title={collapsed ? "Show notes" : "Hide notes"} onClick={toggleHidden}>
        <span aria-hidden="true">{collapsed ? "‹" : "›"}</span>
        {collapsed && total > 0 && <span className="margin-toggle-count" aria-hidden="true">{total}</span>}
      </button>}
    </div>
    <div className="margin-body">
      <div ref={topRef} className="margin-top">
        {mode === "write" && <div className="margin-head">
          <span>{props.checking > 0 ? `Reading… ${props.checking} left` : total ? `${total} note${total === 1 ? "" : "s"} in the margin` : "No notes yet"}</span>
          {props.status && <span className="muted">{props.status}</span>}
        </div>}
        {props.aiCheck}
      </div>
      <div className="margin-slots">
        {slots.map((s) => <div key={s.key} className={`margin-slot${s.key === "current" ? " current" : ""}`} data-anchored={paragraphOf.get(s.key) !== undefined || undefined}
          ref={(el) => { if (el) cards.current.set(s.key, el); else cards.current.delete(s.key); }}
          style={{ top: tops[s.key] ?? 0, visibility: s.key in tops ? undefined : "hidden" }}>{s.body}</div>)}
      </div>
    </div>
  </aside>;
}

type CardProps = Props & { note: Note; showHow: boolean; onShowHow: () => void; asking: boolean; onAsking: (on: boolean) => void; question: string; onQuestion: (q: string) => void };
function ReviewCard(p: CardProps) {
  const n = p.note;
  const quick = !!n.replacement && n.replacement !== n.quote && p.canApply(n);
  const isTask = n.origin === "source" || n.origin === "revision";
  const evidence = n.category === "Use of evidence" || n.category === "Factual accuracy";
  return <section className="issue margin-card" data-category={n.category} aria-label={`Note ${p.position.at} of ${p.position.total}`}>
    <div className="issue-head">
      {n.category ? <span className="issue-category">{n.category}</span> : <span />}
      <span className="issue-origin">{ORIGIN_LABEL[n.origin]}</span>
    </div>
    {n.quote && <button className="issue-location" aria-label={`Show in essay: ${n.quote}`} onClick={() => p.onJump(n)}><q className="mark-quote">{n.quote}</q></button>}
    <p className="issue-note">{n.text}</p>
    {n.why && <p className="muted margin-why">{n.why}</p>}
    {quick && <SuggestionDiff original={n.quote ?? ""} replacement={n.replacement!} />}
    <div className="suggestion-actions">
      {quick ? <button className="primary" onClick={() => p.onApply(n)}>Apply</button>
        : n.origin === "plan" ? <button className="primary" onClick={p.onOpenPlan}>Open plan</button>
        : <button className="primary" onClick={() => p.onFixNow(n)}>Fix it now</button>}
      {!quick && n.origin !== "plan" && n.quote && !isTask && <button aria-expanded={p.showHow} onClick={p.onShowHow}>Show me how</button>}
      {isTask && <button onClick={() => p.onDone(n)}>Done</button>}
      {evidence && <button onClick={() => p.onFindEvidence(n)}>Find evidence</button>}
      {n.origin !== "plan" && <button aria-expanded={p.asking} onClick={() => p.onAsking(!p.asking)}>Ask</button>}
    </div>
    {p.showHow && p.fixes(n)}
    {p.asking && <form className="margin-ask" onSubmit={(e) => { e.preventDefault(); if (!p.question.trim()) return; p.onAsk(n, p.question.trim()); p.onAsking(false); p.onQuestion(""); }}>
      <label className="muted" htmlFor="margin-ask-input">Ask about this {n.quote ? "passage" : "paragraph"}</label>
      <div className="margin-ask-row">
        <input id="margin-ask-input" autoFocus value={p.question} maxLength={4000} onChange={(e) => p.onQuestion(e.target.value)} placeholder="Why does this matter?" />
        <button disabled={!p.question.trim() || p.selectionBusy}>Ask</button>
      </div>
    </form>}
    <div className="margin-card-foot">
      <button className="link" onClick={p.onSkip}>Skip</button>
      {n.origin !== "plan" && <button className="link" onClick={() => p.onDismiss(n)}>Not a problem</button>}
      <span className="grow" />
      <button className="margin-step" aria-label="Previous note" disabled={p.position.at <= 1} onClick={p.onPrev}>←</button>
      <button className="margin-step" aria-label="Next note" onClick={p.onNext}>→</button>
    </div>
  </section>;
}
