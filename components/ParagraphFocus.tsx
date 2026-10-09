"use client";

import { aiFetch } from "@/lib/ai-client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { RefObject } from "react";
import type { FocusAnalysis } from "@/lib/essay-focus";
import { essayParagraphs, passageRange } from "@/lib/essay-document";
export type FocusHandle = { focusRange: (range: Range, question?: string, analyze?: boolean) => void; focusElement: (element: Element) => void; exit: () => void };
type Props = { root: RefObject<HTMLDivElement | null>; draft: string; documentVersion: string; brief: string; onTargetChange?: (text: string) => void; onAnalysis?: (result: FocusAnalysis, draft: string, brief: string, paragraphs: string[]) => void };
export const ParagraphFocus = forwardRef<FocusHandle, Props>(function ParagraphFocus({ root, draft, documentVersion, brief, onTargetChange, onAnalysis }, ref) {
  const [target, setTarget] = useState<number | null>(null);
  const [selection, setSelection] = useState("");
  const [analysis, setAnalysis] = useState<{ result: FocusAnalysis; draft: string; brief: string; target: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const targetElement = useRef<HTMLElement | null>(null);
  const previousDocument = useRef(documentVersion);
  const elements = root.current ? essayParagraphs(root.current) : [];
  const stale = !!analysis && (analysis.draft !== draft || analysis.brief !== brief || analysis.target !== target);
  const exit = () => { requestId.current++; abort.current?.abort(); targetElement.current = null; setBusy(false); setTarget(null); setSelection(""); setAnalysis(null); onTargetChange?.(""); };
  const analyze = async (index: number, passage: string, question?: string) => {
    if (!root.current) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const ticket = ++requestId.current; const snapshot = root.current.innerText;
    const paras = essayParagraphs(root.current).map((p, id) => ({ id, text: p.innerText.trim() }));
    setBusy(true); setError(""); setAnalysis(null);
    try {
      const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ mode: "focus", paragraphs: paras, target: index, selection: passage.trim(), question, brief }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not analyze these connections.");
      if (requestId.current === ticket) { setAnalysis({ result, draft: snapshot, brief, target: index }); onAnalysis?.(result, snapshot, brief, paras.map((p) => p.text)); }
    } catch (e) { if (requestId.current === ticket && !controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (requestId.current === ticket) setBusy(false); }
  };
  const choose = (index: number, passage = "", question?: string, inspect = false) => { if (index < 0) return; requestId.current++; abort.current?.abort(); targetElement.current = root.current ? essayParagraphs(root.current)[index] ?? null : null; setBusy(false); setAnalysis(null); setTarget(index); onTargetChange?.(targetElement.current?.innerText.trim() ?? ""); setSelection(passage); setError(""); if (inspect) void analyze(index, passage, question); };
  useImperativeHandle(ref, () => ({ exit, focusElement: (element) => { if (!root.current) return; const paras = essayParagraphs(root.current); const index = paras.findIndex((p) => p === element || p.contains(element)); if (index !== target) choose(index); }, focusRange: (range, question, inspect = false) => { if (!root.current) return; const paras = essayParagraphs(root.current); const index = paras.findIndex((p) => p.contains(range.startContainer)); choose(index, range.toString(), question, inspect); } }));
  useEffect(() => {
    if (previousDocument.current === documentVersion) return;
    previousDocument.current = documentVersion;
    requestId.current++; abort.current?.abort(); setBusy(false); setAnalysis(null); setSelection("");
    if (!targetElement.current || !root.current) return;
    const index = essayParagraphs(root.current).indexOf(targetElement.current);
    if (index < 0) exit();
    else { setTarget(index); onTargetChange?.(targetElement.current.innerText.trim()); }
  }, [documentVersion, draft, root]);
  useEffect(() => {
    const editor = root.current; if (!editor) return;
    const paras = essayParagraphs(editor);
    const currentTarget = targetElement.current ? paras.indexOf(targetElement.current) : -1;
    const connected = new Set(!stale ? analysis?.result.related.map((r) => r.paragraphId) : []);
    if ("highlights" in CSS) {
      const ranges = currentTarget >= 0 && !stale ? (analysis?.result.related ?? []).flatMap((r) => {
        const p = paras[r.paragraphId]; const range = p && passageRange(p, r.quote); return range ? [range] : [];
      }) : [];
      CSS.highlights.set("essay-connections", new Highlight(...ranges));
      const selected = currentTarget >= 0 && previousDocument.current === documentVersion && !stale && passageRange(paras[currentTarget], selection);
      CSS.highlights.set("essay-focus-selection", new Highlight(...(selected ? [selected] : [])));
    }
    if (currentTarget >= 0) { editor.dataset.focusMode = "on"; paras.forEach((p, index) => p.dataset.essayFocus = index === currentTarget ? "target" : connected.has(index) ? "related" : "dim"); }
    else { delete editor.dataset.focusMode; paras.forEach((p) => p.removeAttribute("data-essay-focus")); }
    return () => { delete editor.dataset.focusMode; paras.forEach((p) => p.removeAttribute("data-essay-focus")); if ("highlights" in CSS) { CSS.highlights.delete("essay-connections"); CSS.highlights.delete("essay-focus-selection"); } };
  }, [target, selection, analysis, stale, draft, documentVersion, root]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape") exit(); }; window.addEventListener("keydown", key); return () => { window.removeEventListener("keydown", key); abort.current?.abort(); }; }, []);
  const jump = (index: number) => { elements[index]?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  return <section className="paragraph-focus" aria-label="Paragraph focus">
    <div className="row"><h2>Paragraph focus</h2>{target !== null && <button onClick={exit}>Show full essay</button>}</div>
    {target === null ? <p className="muted">Click a paragraph to focus. Ask about a passage to see where its argument connects to the rest of your essay.</p> : <>
      <p><b>Paragraph {target + 1}</b>{selection && <> · <q>{selection.slice(0, 180)}{selection.length > 180 ? "…" : ""}</q></>}</p>
      <button disabled={busy} onClick={() => void analyze(target, selection)}>{busy ? "Finding connections…" : "Analyze paragraph and connections"}</button>
      <div aria-live="polite">{error && <p role="alert" className="error">{error}</p>}{stale && <p className="warn">The draft or focus has changed. Analyze again to update connections and priorities.</p>}</div>
      {analysis && !stale && <><p>{analysis.result.summary}</p><ol>{analysis.result.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ol><h3>Connected passages</h3>{!analysis.result.related.length && <p className="muted">No substantial connections identified.</p>}{analysis.result.related.map((r) => <div className="connection" key={r.paragraphId}><button onClick={() => jump(r.paragraphId)}>Paragraph {r.paragraphId + 1} · {r.relationship}</button><q>{r.quote}</q><p>{r.reason}</p></div>)}</>}
    </>}
    <details><summary>Paragraph outline ({elements.length})</summary>{elements.map((p, i) => <button className="outline-item" key={i} onClick={() => { choose(i); jump(i); }}> {i + 1}. {p.innerText.trim().slice(0, 100)}{p.innerText.trim().length > 100 ? "…" : ""}</button>)}</details>
  </section>;
});
