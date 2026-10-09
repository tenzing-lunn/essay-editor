"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { ACCEPT_PROMPT, extractFileText, fileKind } from "@/lib/file-text";

type Props = { label: string; hint: string; accept: string; multiple?: boolean; disabled?: boolean; busy?: string; onFiles: (files: File[]) => void };

export default function DropZone({ label, hint, accept, multiple, disabled, busy, onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);
  const allowed = accept.toLowerCase().split(",");
  const over = (e: DragEvent) => { e.preventDefault(); if (!disabled) setDragging(true); };
  const take = (files: File[]) => { setRejected(false); if (files.length) onFiles(multiple ? files : files.slice(0, 1)); };
  const drop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (disabled) return;
    const all = [...e.dataTransfer.files], files = all.filter((f) => fileKind(f.name) && allowed.some((ext) => f.name.toLowerCase().endsWith(ext)));
    take(files);
    setRejected(files.length < all.length);
  };
  return <label className="drop-zone" data-dragging={dragging || undefined} aria-disabled={disabled || undefined}
    onDragEnter={over} onDragOver={over} onDrop={drop}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}>
    <input type="file" accept={accept} multiple={multiple} disabled={disabled}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
      onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; take(files); }} />
    <span className="drop-zone-label">{label}</span>
    <span className={rejected && !busy ? "error" : "muted"} role={rejected && !busy ? "alert" : undefined}>{busy ?? (rejected ? `Use ${hint}` : hint)}</span>
  </label>;
}

/** Fills the assignment prompt from a file; used by the setup dialog and the Sources tab. */
export function PromptFileDrop({ label, compact, onText }: { label: string; compact?: boolean; onText: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = async ([file]: File[]) => {
    setBusy(true); setNote(null); setError(null);
    try {
      const text = (await extractFileText(file)).sections.map((s) => s.text).join("\n\n");
      onText(text.slice(0, 20000));
      if (text.length > 20000) setNote("Trimmed to 20,000 characters.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <div className={compact ? "prompt-drop compact" : "prompt-drop"}>
    <DropZone label={label} hint=".txt .md .pdf .docx" accept={ACCEPT_PROMPT} disabled={busy} busy={busy ? "Reading file…" : undefined} onFiles={(files) => void read(files)} />
    {note && <p className="muted">{note}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
