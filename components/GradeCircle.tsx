/** The grade letter in Scholia's pen inside an open, overlapping pen loop, the percent beside it. Styles live in landing.css. */
export default function GradeCircle({ letter, percent }: { letter: string; percent: number }) {
  return <p className="grade-circle" aria-label={`Grade estimate ${letter}, ${percent} percent`}>
    <span aria-hidden="true">{letter}</span>
    <svg viewBox="0 0 120 92" aria-hidden="true"><path d="M70 9C38 3 9 22 11 50c2 26 34 37 62 32 27-5 41-25 34-47C101 17 84 9 62 9 50 9 40 12 33 17" /></svg>
    <small aria-hidden="true">{percent}%</small>
  </p>;
}
