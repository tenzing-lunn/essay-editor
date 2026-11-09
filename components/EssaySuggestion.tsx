"use client";

import { wordDiff } from "@/components/AnnotatedPassage";

type Props = {
  original: string;
  replacement: string;
  available: boolean;
  onAccept: () => void;
  onDismiss: () => void;
};

/** A fix as only the changed words: the old ones struck through, the new ones after them. */
export function SuggestionDiff({ original, replacement }: { original: string; replacement: string }) {
  const fix = wordDiff(original, replacement);
  return <div className="suggestion-diff" aria-label={!fix.ins ? `Delete ${fix.del}` : fix.del ? `Change ${fix.del} to ${fix.ins}` : `Add ${fix.ins}`}>
    {fix.del && <del>{fix.del}</del>}{fix.del && fix.ins && " "}{fix.ins && <ins>{fix.ins}</ins>}
  </div>;
}

export default function EssaySuggestion({ original, replacement, available, onAccept, onDismiss }: Props) {
  return <div className="essay-suggestion" onClick={(e) => e.stopPropagation()}>
    <SuggestionDiff original={original} replacement={replacement} />
    {!available && <p className="muted">Passage changed</p>}
    <div className="suggestion-actions">
      <button disabled={!available} title={available ? undefined : "This passage changed. Check again."} onClick={onAccept}>Accept</button>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  </div>;
}
