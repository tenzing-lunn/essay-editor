"use client";

import { useEffect, useRef, useState } from "react";
import { readVersion } from "@/lib/essay-store";
import type { Version, VersionInfo } from "@/lib/api-types";
import type { EssaySettings } from "@/lib/essay-document";
import { cleanHtml } from "@/lib/paste";

type Props = {
  essayId: string; open: boolean; onClose: () => void; versions: VersionInfo[];
  /** Resolves to null once restored, or to why nothing changed; the dialog stays open to show it. */
  onRestore: (version: { html: string; brief: string; settings: EssaySettings }) => Promise<string | null>;
};

/** "Today, 2:15 PM", "Yesterday, 9:02 AM", "Oct 9, 3:40 PM", with the year when it isn't this year. */
export function whenSaved(at: number, now = new Date()) {
  const d = new Date(at), time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) })}, ${time}`;
}

export default function VersionHistory({ essayId, open, onClose, versions, onRestore }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Version | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) { d.close(); setPreview(null); setError(null); }
  }, [open]);

  const show = async (id: string) => {
    setError(null);
    try { setPreview(await readVersion(essayId, id)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const restore = async () => {
    if (!preview) return;
    setRestoring(true); setError(null);
    try { const problem = await onRestore(preview); if (problem) setError(problem); else onClose(); }
    finally { setRestoring(false); }
  };
  const latest = versions.reduce<VersionInfo | null>((a, v) => !a || v.savedAt > a.savedAt ? v : a, null);

  return (
    <dialog ref={dialog} className="version-dialog" aria-labelledby="version-dialog-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="version-dialog-head">
        <h2 id="version-dialog-title">Version history</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="version-dialog-body">
        <div className="version-list">
          {!versions.length && <p className="muted">No versions yet. Use File › Save checkpoint to keep one.</p>}
          {versions.map((v) => (
            <button key={v.id} className="outline-item version-item" aria-current={preview?.id === v.id ? "true" : undefined} onClick={() => void show(v.id)}>
              <span className="version-when">{whenSaved(v.savedAt)}</span>
              <span className="version-meta muted">{v.id === latest?.id && <strong>Most recent · </strong>}{v.words.toLocaleString()} {v.words === 1 ? "word" : "words"}</span>
            </button>
          ))}
        </div>
        <div className="version-preview">
          {error && <p className="error" role="alert">{error}</p>}
          {preview ? <>
            <div className="version-document" dangerouslySetInnerHTML={{ __html: cleanHtml(preview.html) }} />
            <button disabled={restoring} onClick={() => void restore()}>{restoring ? "Restoring…" : "Restore this version"}</button>
          </> : versions.length > 0 && <p className="muted">Choose a version to preview it.</p>}
        </div>
      </div>
    </dialog>
  );
}
