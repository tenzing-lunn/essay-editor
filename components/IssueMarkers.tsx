"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Suggestion } from "@/lib/suggestions";

type Props = {
  editorRef: RefObject<HTMLDivElement | null>; suggestions: Suggestion[]; draft: string;
  rangeOf: (s: Suggestion) => Range | null; onOpen: (s: Suggestion) => void;
};

/** A tick at the start of each underline, joining it like a bracket: hover names the kind of edit, click opens its card and fix in the panel.
 *  The ticks sit in a layer over the page, never inside the editable text. */
export default function IssueMarkers({ editorRef, suggestions, draft, rangeOf, onOpen }: Props) {
  const [markers, setMarkers] = useState<{ s: Suggestion; top: number; left: number; height: number }[]>([]);
  const measure = useRef(() => {});
  measure.current = () => {
    const layer = editorRef.current?.parentElement;
    if (!layer) return;
    const origin = layer.getBoundingClientRect();
    setMarkers(suggestions.flatMap((s) => {
      const first = rangeOf(s)?.getClientRects()[0];
      // From x-height down to the underline, which sits just above the bottom of the line box.
      return first ? [{ s, top: first.top + first.height * 0.25 - origin.top, left: first.left - origin.left, height: first.height * 0.75 - 1 }] : [];
    }));
  };
  // Like the underlines, a new set of suggestions redraws the ticks at once and typing redraws them after a pause.
  const measured = useRef("");
  useEffect(() => {
    const key = suggestions.map((s) => s.id).join("|");
    if (key !== measured.current) { measured.current = key; measure.current(); return; }
    const timer = setTimeout(() => measure.current(), 120);
    return () => clearTimeout(timer);
  }, [suggestions, draft]);
  useEffect(() => {
    const root = editorRef.current;
    if (!root?.parentElement) return;
    const resized = new ResizeObserver(() => measure.current()); // zoom, panel width, font size
    resized.observe(root);
    resized.observe(root.parentElement); // a page zoom change resizes the layer, not the page's own box
    return () => resized.disconnect();
  }, [editorRef]);

  // Keyboard and screen-reader users reach the same card with Alt+Enter on an underline, so the ticks stay out of the tab order.
  return <div className="issue-markers" aria-hidden="true">
    {markers.map(({ s, top, left, height }) => <button key={s.id} type="button" tabIndex={-1} className="issue-marker" data-category={s.category}
      style={{ top, left, height }} onMouseDown={(e) => e.preventDefault()} onClick={() => onOpen(s)}>
      <span className="issue-marker-label">{s.category} <span>· see the fix</span></span>
    </button>)}
  </div>;
}
