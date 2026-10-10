"use client";

import type { Ref, RefObject } from "react";
import { ParagraphFocus } from "@/components/ParagraphFocus";
import type { FocusHandle } from "@/components/ParagraphFocus";
import EssayRevisionTasks from "@/components/EssayRevisionTasks";
import { bodyParagraphOf, essayParagraphs } from "@/lib/essay-document";
import type { EssaySettings } from "@/lib/essay-document";
import type { RevisionTask } from "@/lib/essay-workflow";
import type { FocusAnalysis } from "@/lib/essay-focus";

type Props = {
  focusRef: Ref<FocusHandle>; editorRef: RefObject<HTMLDivElement | null>;
  shown: boolean; draft: string; documentVersion: string; brief: string;
  settings: EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
  focusedParagraph: string; context: string;
  onTargetChange: (text: string) => void;
  onAnalysis: (result: FocusAnalysis, draft: string, brief: string, paragraphs: string[]) => void;
  onJumpTask: (task: RevisionTask, context?: string) => void;
};

export default function ParagraphTab({ focusRef, editorRef, shown, draft, documentVersion, brief, settings, updateSettings, focusedParagraph, context, onTargetChange, onAnalysis, onJumpTask }: Props) {
  const notes = settings.notes.filter((n) => n.note);
  return <>
    <ParagraphFocus ref={focusRef} root={editorRef} shown={shown} draft={draft} documentVersion={documentVersion} brief={brief} onTargetChange={onTargetChange} onAnalysis={onAnalysis} />
    {focusedParagraph && <label className="paragraph-note">Note on this paragraph<textarea maxLength={5000} value={settings.notes.find((n) => n.paragraph === focusedParagraph)?.note ?? ""}
      onChange={(e) => updateSettings((s) => ({ ...s, notes: [...s.notes.filter((n) => n.paragraph !== focusedParagraph), ...(e.target.value ? [{ paragraph: focusedParagraph, note: e.target.value }] : [])] }))} /></label>}
    <EssayRevisionTasks kind="revision" tasks={settings.tasks} context={context} onJump={(t) => onJumpTask(t)} paragraphOf={editorRef.current ? bodyParagraphOf(essayParagraphs(editorRef.current)) : undefined}
      onRemove={(task) => updateSettings((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== task.id) }))}
      onChange={(task) => updateSettings((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? task : t) }))} />
    {notes.length > 0 && <details className="paragraph-notes">
      <summary>Notes ({notes.length})</summary>
      {notes.map((n, i) => <div className="paragraph-saved-note" key={i}><q>{n.paragraph.slice(0, 160)}</q>{!draft.includes(n.paragraph) && <span className="muted"> · passage changed</span>}
        <button className="link" aria-label="Remove note" onClick={() => updateSettings((s) => ({ ...s, notes: s.notes.filter((x) => x.paragraph !== n.paragraph || x.note !== n.note) }))}>Remove</button><p>{n.note}</p></div>)}
    </details>}
  </>;
}
