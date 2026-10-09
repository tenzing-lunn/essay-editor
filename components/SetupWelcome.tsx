"use client";

import { useEffect, useRef } from "react";
import type { EssaySettings } from "@/lib/essay-document";
import { ACCEPT_SOURCES } from "@/lib/file-text";
import { useBooks } from "@/lib/use-books";
import DropZone, { PromptFileDrop } from "@/components/DropZone";
import { BookImports, bookMeta, clampWords } from "@/components/SourcesTab";

type Props = {
  open: boolean; onClose: () => void;
  brief: string; onBriefChange: (text: string) => void;
  settings: EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
};

/** Start-of-essay setup: the assignment prompt and sources. */
export default function SetupWelcome({ open, onClose, brief, onBriefChange, settings, updateSettings }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { books, imports, error, add, remove, dismissImport } = useBooks();
  useEffect(() => {
    const d = dialog.current;
    if (open && !d?.open) d?.showModal();
    else if (!open && d?.open) d.close();
  }, [open]);

  return <dialog ref={dialog} className="setup-dialog" aria-labelledby="setup-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <h2 id="setup-title">Start your essay</h2>
    <p className="muted">Everything stays in this browser.</p>
    <div className="setup-columns">
      <section aria-labelledby="setup-prompt">
        <h3 id="setup-prompt">Assignment prompt</h3>
        <textarea rows={6} maxLength={20000} value={brief} aria-labelledby="setup-prompt" placeholder="Paste the prompt or rubric" onChange={(e) => onBriefChange(e.target.value)} />
        <PromptFileDrop label="Drop the prompt file" onText={onBriefChange} />
      </section>
      <section aria-labelledby="setup-sources">
        <h3 id="setup-sources">Sources</h3>
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
      </section>
    </div>
    <label className="field-inline">Target length
      <input type="number" min={0} max={100000} step={50} value={settings.targetWords || ""} placeholder="Optional"
        onChange={(e) => updateSettings((s) => ({ ...s, targetWords: clampWords(e.target.value) }))} />
      <span className="muted">words</span>
    </label>
    <div className="setup-footer">
      <button className="link" onClick={onClose}>Skip</button>
      <button className="primary" onClick={onClose}>Start writing</button>
    </div>
  </dialog>;
}
