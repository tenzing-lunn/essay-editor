"use client";

type Props = {
  original: string;
  replacement: string;
  available: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export default function EssaySuggestion({ original, replacement, available, onAccept, onDecline }: Props) {
  return <div className="essay-suggestion" onClick={(e) => e.stopPropagation()}>
    <div className="suggestion-diff" aria-label="Suggested change">
      <del>{original}</del>{" "}<ins>{replacement}</ins>
    </div>
    {!available && <p className="muted">This passage has changed or appears more than once. Check again or select the exact passage.</p>}
    <div className="suggestion-actions">
      <button disabled={!available} onClick={onAccept}>Accept</button>
      <button onClick={onDecline}>Decline</button>
    </div>
  </div>;
}
