"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The page's first scholion: a pen line from the name in the headline, up over the line of type and across the pink rule,
 * to the note in the margin that says what the name means. Draws only when the margin sits beside the text (960px and up).
 */
export default function GlossLeader() {
  const svg = useRef<SVGSVGElement>(null);
  const [d, setD] = useState("");

  useLayoutEffect(() => {
    const layout = () => {
      const row = svg.current?.parentElement;
      const name = row?.querySelector(".hero-name");
      const gloss = row?.querySelector(".gloss");
      if (!row || !name || !gloss || !matchMedia("(min-width: 960px)").matches) { setD(""); return; }
      const box = row.getBoundingClientRect(), a = name.getClientRects()[0], b = gloss.getBoundingClientRect();
      const x1 = a.right - box.left - 6, y1 = a.top - box.top + 10;
      const x2 = b.left - box.left - 10, y2 = b.top - box.top + 16;
      const lift = Math.min(y1, y2) - 22;
      setD(`M${x1} ${y1} C${x1 + 30} ${lift}, ${x2 - 160} ${lift}, ${x2} ${y2}`);
    };
    layout();
    const ro = new ResizeObserver(layout);
    if (svg.current?.parentElement) ro.observe(svg.current.parentElement);
    document.fonts?.ready.then(layout);
    return () => ro.disconnect();
  }, []);

  return <svg ref={svg} className="annot-lines gloss-line" aria-hidden="true">{d && <path d={d} pathLength={1} />}</svg>;
}
