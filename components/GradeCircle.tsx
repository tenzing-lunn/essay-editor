
/** The grade estimate: the letter, large, with the percent beside it. Styles live in landing.css, with spacing set where it is used. */
export default function GradeCircle({ letter, percent }: { letter: string; percent: number }) {
  return <p className="grade-circle" aria-label={`Grade estimate ${letter}, ${percent} percent`}>
    <span aria-hidden="true">{letter}</span>
    <small aria-hidden="true">{percent}%</small>
  </p>;
}
