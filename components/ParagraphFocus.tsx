"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { RefObject } from "react";
import { essayParagraphs, passageRange } from "@/lib/essay-document";
export type FocusHandle = { focusRange: (range: Range) => void; focusElement: (element: Element) => void; exit: () => void };
type Props = { root: RefObject<HTMLDivElement | null>; documentVersion: string; onTargetChange?: (text: string) => void };

/** Dims every paragraph but one: Review uses it to hold the paragraph a note is about. Draws nothing of its own. */
export const ParagraphFocus = forwardRef<FocusHandle, Props>(function ParagraphFocus({ root, documentVersion, onTargetChange }, ref) {
  const [target, setTarget] = useState<number | null>(null);
  const [selection, setSelection] = useState("");
  const targetElement = useRef<HTMLElement | null>(null);
  const targetText = useRef("");
  const previousDocument = useRef(documentVersion);
  const exit = () => { targetElement.current = null; setTarget(null); setSelection(""); targetText.current = ""; onTargetChange?.(""); };
  const choose = (index: number, passage = "") => {
    if (index < 0) return;
    targetElement.current = root.current ? essayParagraphs(root.current)[index] ?? null : null;
    setTarget(index); targetText.current = targetElement.current?.innerText.trim() ?? ""; onTargetChange?.(targetText.current); setSelection(passage);
  };
  useImperativeHandle(ref, () => ({
    exit,
    focusElement: (element) => { if (!root.current) return; const paras = essayParagraphs(root.current); const index = paras.findIndex((p) => p === element || p.contains(element)); if (index !== target || paras[index] !== targetElement.current) choose(index); },
    focusRange: (range) => { if (!root.current) return; const index = essayParagraphs(root.current).findIndex((p) => p.contains(range.startContainer)); choose(index, range.toString()); },
  }));
  useEffect(() => {
    if (previousDocument.current === documentVersion) return;
    previousDocument.current = documentVersion;
    // Runs on every keystroke, so only touch state that actually changes; no-op updates pile up React commits while typing fast.
    if (selection) setSelection("");
    if (!targetElement.current || !root.current) return;
    const index = essayParagraphs(root.current).indexOf(targetElement.current);
    if (index < 0) exit();
    else { if (index !== target) setTarget(index); const text = targetElement.current.innerText.trim(); if (text !== targetText.current) { targetText.current = text; onTargetChange?.(text); } }
  }, [documentVersion, root]);
  useEffect(() => {
    const editor = root.current; if (!editor) return;
    const paras = essayParagraphs(editor);
    const currentTarget = targetElement.current ? paras.indexOf(targetElement.current) : -1;
    if ("highlights" in CSS) {
      const selected = currentTarget >= 0 && previousDocument.current === documentVersion && passageRange(paras[currentTarget], selection);
      CSS.highlights.set("essay-focus-selection", new Highlight(...(selected ? [selected] : [])));
    }
    if (currentTarget >= 0) { editor.dataset.focusMode = "on"; paras.forEach((p, index) => p.dataset.essayFocus = index === currentTarget ? "target" : "dim"); }
    else { delete editor.dataset.focusMode; paras.forEach((p) => p.removeAttribute("data-essay-focus")); }
    return () => { delete editor.dataset.focusMode; paras.forEach((p) => p.removeAttribute("data-essay-focus")); if ("highlights" in CSS) CSS.highlights.delete("essay-focus-selection"); };
  }, [target, selection, documentVersion, root]);
  return null;
});
