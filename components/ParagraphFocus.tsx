"use client";

import { aiFetch } from "@/lib/ai-client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { RefObject } from "react";
import type { FocusAnalysis } from "@/lib/essay-focus";
import { bodyParagraphNumber, bodyParagraphOf, essayParagraphs, passageRange } from "@/lib/essay-document";
import KeyErrorLink from "@/components/KeyErrorLink";
export type FocusHandle = { focusRange: (range: Range, question?: string, analyze?: boolean) => void; focusElement: (element: Element) => void; exit: () => void };
const SKEPTIC = "Act as a skeptical reader of this paragraph: state the strongest objection, counterexample or alternative reading a grader could raise, and what evidence or reasoning the writer should add to answer it. Guidance only; do not write replacement prose.";
type Props = { root: RefObject<HTMLDivElement | null>; shown: boolean; draft: string; documentVersion: string; brief: string; onTargetChange?: (text: string) => void; onAnalysis?: (result: FocusAnalysis, draft: string, brief: string, paragraphs: string[]) => void };
export const ParagraphFocus = forwardRef<FocusHandle, Props>(function ParagraphFocus({ root, shown, draft, documentVersion, brief, onTargetChange, onAnalysis }, ref) {
  const [target, setTarget] = useState<number | null>(null);
  const [selection, setSelection] = useState("");
  const [analysis, setAnalysis] = useState<{ result: FocusAnalysis; draft: string; brief: string; target: number; skeptic: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const targetElement = useRef<HTMLElement | null>(null);
  const targetText = useRef("");
  const previousDocument = useRef(documentVersion);
  const elements = root.current ? essayParagraphs(root.current) : [];
  // Number paragraphs as the outline does (P{n}, body paragraphs only), not by raw block.
  const paragraphOf = bodyParagraphOf(elements);
  const label = (i: number, long = false) => { const n = paragraphOf[i] === undefined ? i + 1 : bodyParagraphNumber(paragraphOf, i); return !n ? "Heading" : long ? `Paragraph ${n}` : paragraphOf[i] === undefined ? `¶ ${n}` : `P${n}`; };
  const stale = !!analysis && (analysis.draft !== draft || analysis.brief !== brief || analysis.target !== target);
  const exit = () => { requestId.current++; abort.current?.abort(); targetElement.current = null; setBusy(false); setTarget(null); setSelection(""); setAnalysis(null); targetText.current = ""; onTargetChange?.(""); };
  const analyze = async (index: number, passage: string, question?: string) => {
    if (!root.current) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const ticket = ++requestId.current; const snapshot = root.current.innerText;
    const paras = essayParagraphs(root.current).map((p, id) => ({ id, text: p.innerText.trim() }));
    setBusy(true); setError(""); setAnalysis(null);
    try {
      const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ mode: "focus", paragraphs: paras, target: index, selection: passage.trim(), question, brief }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not analyze these connections.");
      if (requestId.current === ticket) { const skeptic = question === SKEPTIC; setAnalysis({ result, draft: snapshot, brief, target: index, skeptic }); if (!skeptic) onAnalysis?.(result, snapshot, brief, paras.map((p) => p.text)); }
    } catch (e) { if (requestId.current === ticket && !controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (requestId.current === ticket) setBusy(false); }
  };
  const choose = (index: number, passage = "", question?: string, inspect = false) => { if (index < 0) return; requestId.current++; abort.current?.abort(); targetElement.current = root.current ? essayParagraphs(root.current)[index] ?? null : null; setBusy(false); setAnalysis(null); setTarget(index); targetText.current = targetElement.current?.innerText.trim() ?? ""; onTargetChange?.(targetText.current); setSelection(passage); setError(""); if (inspect) void analyze(index, passage, question); };
  useImperativeHandle(ref, () => ({ exit, focusElement: (element) => { if (!root.current) return; const paras = essayParagraphs(root.current); const index = paras.findIndex((p) => p === element || p.contains(element)); if (index !== target || paras[index] !== targetElement.current) choose(index); }, focusRange: (range, question, inspect = false) => { if (!root.current) return; const paras = essayParagraphs(root.current); const index = paras.findIndex((p) => p.contains(range.startContainer)); choose(index, range.toString(), question, inspect); } }));
  useEffect(() => {
    if (previousDocument.current === documentVersion) return;
    previousDocument.current = documentVersion;
    // Runs on every keystroke, so only touch state that actually changes; no-op updates pile up React commits while typing fast.
    requestId.current++; abort.current?.abort(); if (busy) setBusy(false); if (analysis) setAnalysis(null); if (selection) setSelection("");
    if (!targetElement.current || !root.current) return;
    const index = essayParagraphs(root.current).indexOf(targetElement.current);
    if (index < 0) exit();
    else { if (index !== target) setTarget(index); const text = targetElement.current.innerText.trim(); if (text !== targetText.current) { targetText.current = text; onTargetChange?.(text); } }
  }, [documentVersion, draft, root]);
  useEffect(() => {
    const editor = root.current; if (!editor) return;
    const paras = essayParagraphs(editor);
    const currentTarget = targetElement.current ? paras.indexOf(targetElement.current) : -1;
    const connected = new Set(!stale ? analysis?.result.related.map((r) => r.paragraphId) : []);
    if ("highlights" in CSS) {
      // Hidden feedback paints nothing; the analysis is kept so showing it again repaints without a new request.
      const ranges = shown && currentTarget >= 0 && !stale ? (analysis?.result.related ?? []).flatMap((r) => {
        const p = paras[r.paragraphId]; const range = p && passageRange(p, r.quote); return range ? [range] : [];
      }) : [];
      CSS.highlights.set("essay-connections", new Highlight(...ranges));
      const selected = shown && currentTarget >= 0 && previousDocument.current === documentVersion && !stale && passageRange(paras[currentTarget], selection);
      CSS.highlights.set("essay-focus-selection", new Highlight(...(selected ? [selected] : [])));
    }
    if (currentTarget >= 0) { editor.dataset.focusMode = "on"; paras.forEach((p, index) => p.dataset.essayFocus = index === currentTarget ? "target" : connected.has(index) ? "related" : "dim"); }
    else { delete editor.dataset.focusMode; paras.forEach((p) => p.removeAttribute("data-essay-focus")); }
    return () => { delete editor.dataset.focusMode; paras.forEach((p) => p.removeAttribute("data-essay-focus")); if ("highlights" in CSS) { CSS.highlights.delete("essay-connections"); CSS.highlights.delete("essay-focus-selection"); } };
  }, [target, selection, analysis, stale, shown, draft, documentVersion, root]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) exit(); }; window.addEventListener("keydown", key); return () => { window.removeEventListener("keydown", key); abort.current?.abort(); }; }, []);
  const jump = (index: number) => { elements[index]?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  return <section className="paragraph-focus" aria-label="Paragraph focus">
    {target === null ? <p className="muted">Choose a paragraph from the outline to focus it.</p> : <>
      <div className="row focus-head"><h2>{label(target, true)}</h2><button onClick={exit}>Show full essay</button></div>
      {selection && <q className="focus-selection">{selection.slice(0, 180)}{selection.length > 180 ? "…" : ""}</q>}
      <div className="row">
        <button disabled={busy} onClick={() => void analyze(target, selection)}>Analyze connections</button>
        <button disabled={busy} onClick={() => void analyze(target, selection, SKEPTIC)}>Skeptical reader</button>
      </div>
      <div aria-live="polite">{busy && <p className="muted">Analyzing…</p>}{error && <p role="alert" className="error">{error}<KeyErrorLink error={error} /></p>}{stale && <p className="focus-stale">Draft changed. Analyze again.</p>}</div>
      {analysis && !stale && <div className="focus-result"><h3>{analysis.skeptic ? "Skeptical reader" : "Connections"}</h3><p>{analysis.result.summary}</p><ol>{analysis.result.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ol>{(analysis.result.related.length > 0 || !analysis.skeptic) && <h3>Connected passages</h3>}{!analysis.result.related.length && !analysis.skeptic && <p className="muted">None found.</p>}{analysis.result.related.map((r) => <div className="connection" key={r.paragraphId}><button onClick={() => jump(r.paragraphId)}>{label(r.paragraphId)} · {r.relationship}</button><q>{r.quote}</q><p>{r.reason}</p></div>)}</div>}
    </>}
  </section>;
});
