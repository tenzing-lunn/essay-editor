"use client";

import { useEffect, useRef, useState } from "react";
import { readVersion } from "@/lib/draft-store";
import type { Version, VersionInfo } from "@/lib/draft-store";
import type { EssaySettings } from "@/lib/essay-document";
import { cleanHtml } from "@/lib/paste";

type Props = {
  open: boolean; onClose: () => void; versions: VersionInfo[];
  onRestore: (version: { html: string; brief: string; settings: EssaySettings }) => void | Promise<void>;
};

export default function VersionHistory({ open, onClose, versions, onRestore }: Props) {
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
    try { setPreview(await readVersion(id)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const restore = async () => {
    if (!preview) return;
    setRestoring(true);
    try { await onRestore(preview); onClose(); }
    finally { setRestoring(false); }
  };

  return (
    <dialog ref={dialog} className="version-dialog" aria-labelledby="version-dialog-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="version-dialog-head">
        <h2 id="version-dialog-title">Version history</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="version-dialog-body">
        <div className="version-list">
          {!versions.length && <p className="muted">No versions yet.</p>}
          {versions.map((v) => (
            <button key={v.id} className="outline-item" aria-current={preview?.id === v.id ? "true" : undefined} onClick={() => void show(v.id)}>
              {`${new Date(v.savedAt).toLocaleString()} · ${v.words} words`}
            </button>
          ))}
        </div>
        <div className="version-preview">
          {error && <p className="error" role="alert">{error}</p>}
          {preview && <>
            <div className="version-document" dangerouslySetInnerHTML={{ __html: cleanHtml(preview.html) }} />
            <button disabled={restoring} onClick={() => void restore()}>Restore this version</button>
          </>}
        </div>
      </div>
    </dialog>
  );
}
