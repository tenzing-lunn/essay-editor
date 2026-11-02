"use client";

import type { ReactNode } from "react";
import type { EssaySettings } from "@/lib/essay-document";
import { useBooks } from "@/lib/use-books";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; settings: EssaySettings; brief: string; assignment: ReactNode; plan: ReactNode };

/** Everything the writer gives the AI, folded above the essay like an assignment stapled to the front. Its children stay mounted
 * while it is closed, so the source check and the plan keep working from the full read. */
export default function CoverSheet({ open, onOpenChange, settings, brief, assignment, plan }: Props) {
  const { books } = useBooks();
  const { kind, citation } = settings.profile;
  const claims = settings.plan.claims.filter((c) => c.claim.trim()).length;
  const facts = [
    kind || (brief.trim() ? "Assignment added" : "No assignment yet"),
    settings.targetWords > 0 && `${settings.targetWords.toLocaleString("en-US")} words`,
    citation && citation !== "None" && citation,
    books.length > 0 && `${books.length} book${books.length === 1 ? "" : "s"}`,
    settings.thesis.trim() ? (claims ? `thesis and ${claims} claim${claims === 1 ? "" : "s"}` : "thesis") : "no plan yet",
  ].filter(Boolean);
  return <details className="cover-sheet" open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)}>
    <summary>
      <span className="cover-sheet-title">Cover sheet</span>
      <span className="cover-sheet-facts">{facts.join(" · ")}</span>
      <span className="cover-sheet-open" aria-hidden="true">{open ? "Close" : "Open"}</span>
    </summary>
    <div className="cover-sheet-body">
      <div className="cover-sheet-col">{assignment}</div>
      <div className="cover-sheet-col">{plan}</div>
    </div>
  </details>;
}
