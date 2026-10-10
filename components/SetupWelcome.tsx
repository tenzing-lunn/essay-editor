"use client";

import { useEffect, useRef, useState } from "react";
import { clampWords } from "@/lib/essay-document";
import type { EssaySettings } from "@/lib/essay-document";
import { CITATION_STYLES, WRITING_KINDS, type WritingProfile } from "@/lib/essay-workflow";
import { ACCEPT_SOURCES } from "@/lib/file-text";
import { readAiSettings } from "@/lib/ai-client";
import { useBooks } from "@/lib/use-books";
import { openAiSettings } from "@/components/AiAccount";
import DropZone, { PromptFileDrop } from "@/components/DropZone";
import { BookImports, bookMeta } from "@/components/SourcesTab";

type Props = {
  open: boolean; onClose: () => void; editing?: boolean; // reopened to edit, not a first run
  brief: string; onBriefChange: (text: string) => void;
  settings: EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
};

const STEPS = ["What you’re writing", "Assignment", "Sources", "Notes for the AI"];
const NOTE_IDEAS = [
  "Point out problems; don’t rewrite my sentences.",
  "My instructor marks down passive voice and vague words like “society”.",
  "Hold me to the rubric in the prompt above all else.",
  "Be direct; I’d rather hear the hard truth now.",
  "Use British spelling.",
];

/** Start-of-essay setup: everything the AI should know before it helps, one step at a time. */
export default function SetupWelcome({ open, onClose, editing, brief, onBriefChange, settings, updateSettings }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(new Set([0]));
  const [customKind, setCustomKind] = useState(false);
  const notes = useRef<HTMLTextAreaElement>(null);
  const moved = useRef(false);
  const [connected, setConnected] = useState(false);
  const { books, imports, error, add, remove, dismissImport } = useBooks();
  const profile = settings.profile;
  const setProfile = (patch: Partial<WritingProfile>) => updateSettings((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  useEffect(() => {
    const d = dialog.current;
    if (open && !d?.open) { setStep(0); setVisited(new Set([0])); setCustomKind(!!profile.kind && !(WRITING_KINDS as readonly string[]).includes(profile.kind)); moved.current = false; d?.showModal(); }
    else if (!open && d?.open) d.close();
  }, [open]);
  useEffect(() => {
    const refresh = () => setConnected(Boolean(readAiSettings()));
    refresh();
    window.addEventListener("ai-settings-change", refresh);
    return () => window.removeEventListener("ai-settings-change", refresh);
  }, []);
  // Move focus to the new step's heading once it has rendered; the old step's controls are gone by then.
  useEffect(() => {
    if (!moved.current) return;
    body.current?.scrollTo({ top: 0 }); body.current?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }, [step]);
  const go = (next: number) => { moved.current = true; setStep(next); setVisited((v) => new Set(v).add(next)); };
  const addNote = (idea: string) => { setProfile({ instructions: [profile.instructions.trim(), idea].filter(Boolean).join("\n").slice(0, 4000) }); notes.current?.focus(); };
  const sourceCount = books.length + (settings.includeAntigone ? 1 : 0);
  const known = [
    profile.kind && profile.kind,
    profile.course && profile.course,
    profile.citation && profile.citation !== "None" && `${profile.citation} citations`,
    settings.targetWords > 0 && `about ${settings.targetWords} words`,
    brief.trim() && "assignment prompt",
    settings.thesis.trim() && "working thesis",
    sourceCount > 0 && `${sourceCount} source${sourceCount === 1 ? "" : "s"}`,
    profile.instructions.trim() && "your notes",
  ].filter(Boolean) as string[];
  const last = step === STEPS.length - 1;

  return <dialog ref={dialog} className="setup-dialog" aria-labelledby="setup-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <header className="setup-head">
      <div>
        <h2 id="setup-title">Set up your essay</h2>
        <p className="muted">Tell the AI what it is helping with. Every answer is optional and editable later under Sources → Writing setup.</p>
      </div>
      <ol className="setup-steps" aria-label="Setup steps">
        {STEPS.map((label, i) => <li key={label}>
          <button type="button" aria-current={i === step ? "step" : undefined} data-done={i !== step && visited.has(i)} onClick={() => go(i)}>
            <span className="setup-step-n" aria-hidden="true">{i !== step && visited.has(i) ? "✓" : i + 1}</span><span className="setup-step-label">{label}</span>
          </button>
        </li>)}
      </ol>
    </header>

    <div className="setup-body" ref={body}>
      {step === 0 && <section aria-labelledby="setup-kind">
        <h3 id="setup-kind" tabIndex={-1}>What are you writing?</h3>
        <div className="setup-choices" role="radiogroup" aria-labelledby="setup-kind">
          {WRITING_KINDS.map((kind) => <label key={kind} className="setup-choice">
            <input type="radio" name="setup-kind" checked={!customKind && profile.kind === kind} onChange={() => { setCustomKind(false); setProfile({ kind }); }} />{kind}
          </label>)}
        </div>
        <label className="setup-field">Something else? Describe it
          <input value={customKind ? profile.kind : ""} maxLength={100} placeholder="e.g. Close reading of one scene, 2 pages" onChange={(e) => { setCustomKind(!!e.target.value); setProfile({ kind: e.target.value }); }} />
        </label>
        <label className="setup-field">Course and level
          <input value={profile.course} maxLength={200} placeholder="e.g. ENGL 2000, first-year undergraduate" onChange={(e) => setProfile({ course: e.target.value })} />
        </label>
        <div className="setup-row">
          <div className="setup-field" role="group" aria-labelledby="setup-citation">
            <span id="setup-citation">Citation style</span>
            <div className="setup-choices">
              {CITATION_STYLES.map((style) => <label key={style} className="setup-choice">
                <input type="radio" name="setup-citation" checked={profile.citation === style} onChange={() => setProfile({ citation: style })} />{style}
              </label>)}
            </div>
          </div>
          <label className="setup-field setup-length">Target length
            <span><input type="number" min={0} max={100000} step={50} value={settings.targetWords || ""} placeholder="Optional"
              onChange={(e) => updateSettings((s) => ({ ...s, targetWords: clampWords(e.target.value) }))} /> words</span>
          </label>
        </div>
      </section>}

      {step === 1 && <section aria-labelledby="setup-prompt">
        <h3 id="setup-prompt" tabIndex={-1}>The assignment</h3>
        <p className="muted small">Paste the prompt and rubric. The AI reviews your draft the way this grader would.</p>
        <textarea rows={7} maxLength={20000} value={brief} aria-labelledby="setup-prompt" placeholder="Paste the prompt or rubric" onChange={(e) => onBriefChange(e.target.value)} />
        <PromptFileDrop label="Or drop the prompt file" onText={onBriefChange} />
        <label className="setup-field"><span>Working thesis <span className="muted small">(optional)</span></span>
          <textarea rows={2} maxLength={2000} value={settings.thesis} placeholder="e.g. Creon, not Antigone, is the play’s tragic protagonist."
            onChange={(e) => updateSettings((s) => ({ ...s, thesis: e.target.value }))} />
          <span className="muted small">Pinned in the outline. Feedback checks each paragraph against it.</span>
        </label>
      </section>}

      {step === 2 && <section aria-labelledby="setup-sources">
        <h3 id="setup-sources" tabIndex={-1}>Sources</h3>
        <p className="muted small">The texts you’ll quote. The AI checks your quotations and claims against them.</p>
        <label className="checklist-item"><input type="checkbox" checked={settings.includeAntigone} onChange={(e) => updateSettings((s) => ({ ...s, includeAntigone: e.target.checked }))} />Sophocles, <i>Antigone</i> (built in)</label>
        {books.length > 0 && <ul className="source-list">
          {books.map((book) => <li className="source-row" key={book.id}>
            <div className="source-name"><span>{book.title}</span><span className="muted">{bookMeta(book)}</span></div>
            <button className="link" aria-label={`Remove ${book.title}`} onClick={() => void remove(book.id)}>Remove</button>
          </li>)}
        </ul>}
        {error && <p className="error" role="alert">{error}</p>}
        <BookImports imports={imports} onDismiss={dismissImport} />
        <DropZone label="Drop books or readings" hint=".pdf .epub .docx .txt .md" accept={ACCEPT_SOURCES} multiple onFiles={(files) => void add(files)} />
      </section>}

      {step === 3 && <section aria-labelledby="setup-notes">
        <h3 id="setup-notes" tabIndex={-1}>Anything the AI should know?</h3>
        <p className="muted small">Standing instructions for every suggestion, review and check: what your instructor cares about, how you want help, habits to watch for.</p>
        <textarea ref={notes} rows={6} maxLength={4000} value={profile.instructions} aria-labelledby="setup-notes"
          placeholder={"e.g. My professor wants every quotation followed by two sentences of analysis.\nI overuse “however”; flag it."}
          onChange={(e) => setProfile({ instructions: e.target.value })} />
        <div className="setup-ideas" aria-label="Add a common note">
          {NOTE_IDEAS.map((idea) => { const added = profile.instructions.includes(idea); return <button type="button" key={idea} disabled={added} aria-pressed={added} onClick={() => addNote(idea)}>{added ? "✓" : "+"} {idea}</button>; })}
        </div>
        <div className="setup-summary">
          <strong>The AI will know</strong>
          <p>{known.length ? known.join(" · ") : "Nothing yet. That’s fine; it will give general feedback."}</p>
        </div>
        {!connected && <div className="setup-connect">
          <p><strong>Connect an AI key to get feedback.</strong> You pay your provider directly, usually a few cents per check.</p>
          <button type="button" onClick={openAiSettings}>Connect AI key</button>
        </div>}
      </section>}
    </div>

    <footer className="setup-footer">
      {editing ? <button className="link" onClick={onClose}>Close</button> : !last && <button className="link" onClick={onClose}>Skip setup</button>}
      <span className="grow" />
      {step > 0 && <button onClick={() => go(step - 1)}>Back</button>}
      {last ? <button className="primary" onClick={onClose}>{editing ? "Done" : "Start writing"}</button> : <button className="primary" onClick={() => go(step + 1)}>Next</button>}
    </footer>
  </dialog>;
}
