"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/suggestions";

type Props = {
  suggestion: Suggestion; rect: DOMRect; canApply: boolean; autoFocus?: boolean;
  onAccept: () => void; onDismiss: () => void; onSuggestFixes: () => void; onClose: () => void;
};

/** Grammarly-style card at an underline; the same Accept/Dismiss as the panel card. */
export default function IssuePopover({ suggestion: s, rect, canApply, autoFocus, onAccept, onDismiss, onSuggestFixes, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const replaces = !!s.replacement && s.replacement !== s.quote;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: width, offsetHeight: height } = el;
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8 && rect.top - 6 - height >= 8) top = rect.top - 6 - height;
    setPos({ top, left: Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - width - 8)) });
  }, [rect, s.id]);
  useEffect(() => { if (autoFocus && pos) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }, [autoFocus, !!pos]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (ref.current?.contains(document.activeElement)) document.querySelector<HTMLElement>(".page")?.focus({ preventScroll: true });
      onClose();
    };
    const outside = (e: PointerEvent) => { if (!(e.target instanceof Node) || !ref.current?.contains(e.target)) onClose(); };
    // Close when the essay moves under the popover (window or editor scroll), not when the panel scrolls a card into view.
    const scrolled = (e: Event) => { const page = document.querySelector(".page"); if (e.target === document || (e.target instanceof Node && page && e.target.contains(page))) onClose(); };
    window.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("input", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("input", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [onClose]);

  return <div ref={ref} className="issue-popover" role="dialog" aria-label={`${s.category} suggestion`} data-category={s.category}
    style={pos ? { top: pos.top, left: pos.left } : { top: rect.bottom + 6, left: 8, visibility: "hidden" }} onMouseDown={(e) => e.preventDefault()}>
    <span className="issue-category">{s.category}</span>
    <p className="issue-popover-note">{s.note}</p>
    {replaces && <div className="suggestion-diff" aria-label="Suggested change"><del>{s.quote}</del>{" "}<ins>{s.replacement}</ins></div>}
    <div className="suggestion-actions">
      {replaces
        ? <button className="accept" disabled={!canApply} title={canApply ? undefined : "This passage changed. Check again."} onClick={onAccept}>Accept</button>
        : <button onClick={onSuggestFixes}>Suggest fixes</button>}
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  </div>;
}
