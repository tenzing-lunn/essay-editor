"use client";

import { aiFetch } from "@/lib/ai-client";

import { useEffect, useRef, useState } from "react";
import KeyErrorLink from "@/components/KeyErrorLink";
import type { FixResult } from "@/lib/claude";

type Props = {
  issue: { quote: string; note: string };
  draft: string;
  brief: string;
  onJump: (issue: { quote: string; note: string }) => void;
  autoRun?: number;
  onAutoRun?: () => void;
};

export default function EssayFixes({ issue, draft, brief, onJump, autoRun, onAutoRun }: Props) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fixes: FixResult; draft: string; brief: string; note: string } | null>(null);
  const stale = !!result && (result.draft !== draft || result.brief !== brief || result.note !== issue.note);

  const suggest = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await aiFetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "fixes", draft, brief, issue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not suggest fixes.");
      setResult({ fixes: data, draft, brief, note: issue.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest fixes.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  // A nonce from the popover's "Suggest fixes"; the running ref stops a second request.
  useEffect(() => {
    if (!autoRun) return;
    onAutoRun?.();
    void suggest();
  }, [autoRun]);

  return (
    <div className="essay-fixes" onClick={(e) => e.stopPropagation()}>
      <button onClick={suggest} disabled={busy || !draft.trim()}>
        {busy ? "Finding fixes…" : result ? "Suggest fixes again" : "Suggest fixes"}
      </button>
      <div aria-live="polite" aria-busy={busy}>
        {error && <p className="error" role="alert">{error} Try again.<KeyErrorLink error={error} /></p>}
        {result && <div className="fix-guidance">
          {stale && <p className="muted">Feedback changed. Suggest again.</p>}
          <h4>Ways to fix this</h4>
          <ul>{result.fixes.steps.map((step, index) => <li key={index}>{step}</li>)}</ul>
          {result.fixes.elsewhere.length > 0 && <>
            <h4>Other places you could edit</h4>
            {result.fixes.elsewhere.map((place, index) => <div className="fix-place" key={index}>
              <q>{place.quote}</q>
              <p>{place.instruction}</p>
              <button disabled={!draft.includes(place.quote)} onClick={() => onJump({ quote: place.quote, note: place.instruction })}>
                {draft.includes(place.quote) ? "Show in essay" : "Passage has changed"}
              </button>
            </div>)}
          </>}
        </div>}
      </div>
    </div>
  );
}
