"use client";

type Props = { words: number; target: number; onClick: () => void };
const R = 8, C = 2 * Math.PI * R;

export default function WordGoal({ words, target, onClick }: Props) {
  if (!target) return <button className="word-goal" title="Set a word goal" onClick={onClick}>{words} words</button>;
  const done = Math.min(1, words / target);
  return (
    <button className="word-goal" data-done={words >= target} title={`${words} of ${target} words`} onClick={onClick}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle className="word-goal-track" cx="10" cy="10" r={R} />
        <circle className="word-goal-fill" cx="10" cy="10" r={R} strokeDasharray={`${done * C} ${C}`} transform="rotate(-90 10 10)" />
      </svg>
      {words} / {target}
    </button>
  );
}
