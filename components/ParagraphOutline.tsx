"use client";

type Props = {
  paragraphs: string[]; active: number; issueCounts: number[]; open: boolean;
  onToggle: () => void; onSelect: (index: number) => void; onShowAll: () => void;
};

/** Table of contents for the essay: one entry per paragraph, beside the page. */
export default function ParagraphOutline({ paragraphs, active, issueCounts, open, onToggle, onSelect, onShowAll }: Props) {
  return <nav className="doc-outline" data-open={open} aria-label="Paragraph outline">
    <div className="doc-outline-head">
      <button className="doc-outline-toggle" aria-expanded={open} aria-controls="doc-outline-list" title={open ? "Hide paragraph outline" : "Show paragraph outline"} onClick={onToggle}>{open ? "‹" : "☰"}</button>
      {open && <h2>Paragraphs</h2>}
      {open && active >= 0 && <button className="doc-outline-all" onClick={onShowAll}>Show all</button>}
    </div>
    {open && <ol id="doc-outline-list">
      {!paragraphs.length && <li className="muted">Paragraphs appear here as you write.</li>}
      {paragraphs.map((p, i) => <li key={i}>
        <button aria-current={i === active ? "true" : undefined} onClick={() => onSelect(i)}>
          <span className="doc-outline-n">{i + 1}</span>
          <span className="doc-outline-text">{p.slice(0, 140)}</span>
          {issueCounts[i] > 0 && <span className="count-badge" title={`${issueCounts[i]} open suggestion${issueCounts[i] === 1 ? "" : "s"}`}>{issueCounts[i]}</span>}
        </button>
      </li>)}
    </ol>}
  </nav>;
}
