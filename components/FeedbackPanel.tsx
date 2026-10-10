"use client";

import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import AiAccount from "@/components/AiAccount";
import KeyErrorLink from "@/components/KeyErrorLink";

export type PanelTab = "suggestions" | "paragraph" | "sources";
const TABS: { id: PanelTab; label: string }[] = [{ id: "suggestions", label: "Suggestions" }, { id: "paragraph", label: "Paragraph" }, { id: "sources", label: "Sources" }];

type Props = {
  visible: boolean; onVisibleChange: (visible: boolean) => void;
  tab: PanelTab; onTabChange: (tab: PanelTab) => void;
  counts: Partial<Record<PanelTab, number>>; busy: boolean;
  error: string | null; onDismissError: () => void;
  suggestions: ReactNode; paragraph: ReactNode; sources: ReactNode;
};

/** The panel and every tab stay mounted while hidden: paragraph focus, AI-check highlights and open results live inside. */
export default function FeedbackPanel({ visible, onVisibleChange, tab, onTabChange, counts, busy, error, onDismissError, suggestions, paragraph, sources }: Props) {
  const tabs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});
  const content = { suggestions, paragraph, sources };
  const onKeyDown = (event: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const keys: Record<string, number | undefined> = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onTabChange(TABS[next].id);
    tabs.current[TABS[next].id]?.focus();
  };
  const suggestionCount = counts.suggestions ?? 0;
  // The AI key button lives above the panel, not in it: it stays put whether the panel is open or collapsed.
  return <div className="side-column">
    <div className="side-account"><AiAccount compact={!visible} /></div>
    {!visible && (
      <button className="side-rail" aria-expanded={false} aria-controls="feedback-panel" title="Show feedback panel" onClick={() => onVisibleChange(true)}>
        <span aria-hidden="true">‹</span>
        <span className="side-rail-label">Feedback</span>
        {suggestionCount > 0 && <span className="count-badge" aria-label={`${suggestionCount} open suggestions`}>{suggestionCount}</span>}
        {busy && <span className="side-rail-busy" role="img" aria-label="Working" />}
      </button>
    )}
    <aside className="side" id="feedback-panel" hidden={!visible}>
      <div className="side-head">
        <div className="panel-tabs" role="tablist" aria-label="Feedback" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button key={t.id} ref={(el) => { tabs.current[t.id] = el; }} role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`}
              aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => onTabChange(t.id)}>
              {t.label}{(counts[t.id] ?? 0) > 0 && <span className="count-badge">{counts[t.id]}</span>}
            </button>
          ))}
        </div>
        {busy && <span className="side-rail-busy" role="img" aria-label="Working" />}
        <button aria-expanded={true} aria-controls="feedback-panel" aria-label="Hide feedback panel" title="Hide panel" onClick={() => onVisibleChange(false)}>›</button>
      </div>
      {error && <div className="panel-error" role="alert"><p>{error}<KeyErrorLink error={error} /></p><button aria-label="Dismiss error" onClick={onDismissError}>×</button></div>}
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} tabIndex={0} hidden={tab !== t.id}>{content[t.id]}</div>
      ))}
    </aside>
  </div>;
}
