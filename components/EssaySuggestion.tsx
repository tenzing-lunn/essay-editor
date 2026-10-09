"use client";

type Props = {
  original: string;
  replacement: string;
  available: boolean;
  onAccept: () => void;
  onDismiss: () => void;
};

export default function EssaySuggestion({ original, replacement, available, onAccept, onDismiss }: Props) {
  return <div className="essay-suggestion" onClick={(e) => e.stopPropagation()}>
    <div className="suggestion-diff" aria-label="Suggested change">
      <del>{original}</del>{" "}<ins>{replacement}</ins>
    </div>
    {!available && <p className="muted">Passage changed</p>}
    <div className="suggestion-actions">
      <button disabled={!available} title={available ? undefined : "This passage changed. Check again."} onClick={onAccept}>Accept</button>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  </div>;
}
