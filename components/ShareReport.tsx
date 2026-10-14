"use client";

import { useState } from "react";
import type { Grade } from "@/lib/essay-grade";
import "@/app/styles/share.css";

type Props = { grade: Grade; stale: boolean };

/** A link to this grade: letter, trait levels and the three steps, never the essay. The server signs it, so a link cannot be made up. */
export default function ShareReport({ grade, stale }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ grade: Grade; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const url = made?.grade === grade ? made.url : null; // a link belongs to the grade it was made from; a new grade starts over

  const share = async () => {
    setBusy(true); setError(null); setCopied(false);
    try {
      const response = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grade, title }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Could not make a link (${response.status}).`);
      setMade({ grade, url: data.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make a link.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url!); setCopied(true); }
    catch { setError("Could not copy. Select the link and copy it instead."); }
  };

  return (
    <div className="share-report">
      <h4 className="grade-heading">Share this report</h4>
      <div className="share-row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Title (optional)" aria-label="Report title" disabled={stale || busy} />
        <button disabled={stale || busy} onClick={() => void share()} title={stale ? "Grade again before sharing" : "A link with the grade, trait levels and the three fixes. The essay itself is never in it."}>
          {busy ? "Making link…" : "Share report"}
        </button>
      </div>
      {stale && <p className="muted">Grade again before sharing.</p>}
      <div aria-live="polite">
        {error && <p className="error">{error}</p>}
        {url && <div className="share-row">
          <input readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
          <button onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
        </div>}
      </div>
      {!stale && !url && <p className="muted">The link shows the grade and the three fixes, never the essay.</p>}
    </div>
  );
}
