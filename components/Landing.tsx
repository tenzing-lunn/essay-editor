import { Fragment } from "react";
import Link from "next/link";
import { APP_NAME, INTEGRITY, PROMISE, TAGLINE } from "@/lib/brand";
import { SAMPLE_ESSAY_PARAGRAPHS } from "@/lib/sample-essay";
import { SAMPLE_GRADE, SAMPLE_ISSUES, markSegments } from "@/lib/sample-results";

// Paragraph three of the sample carries three of its flaws in four sentences, so the marks read without the rest of the essay.
const DEMO_PARAGRAPH = 2;
const DEMO_ISSUES = SAMPLE_ISSUES.filter((s) => s.paragraphId === DEMO_PARAGRAPH).slice(0, 3);
// The open note is the one with a drop-in fix: the most concrete thing the product does, and the clearest proof it does not rewrite.
const OPEN = DEMO_ISSUES.findIndex((s) => s.replacement);
const REPO = "https://github.com/tenzing-lunn/essay-editor";

/** What a signed-out visitor sees at /: the promise, the product working on the sample, three reasons, the integrity stance, pricing. */
export default function Landing() {
  const open = DEMO_ISSUES[OPEN];
  return <main className="landing">
    <header className="landing-bar">
      <span className="home-brand">{APP_NAME}</span>
      <nav aria-label="Site"><Link href="/sample">Sample</Link><Link href="/login">Sign in</Link></nav>
    </header>

    <section className="landing-hero">
      {/* TAGLINE stands alone elsewhere; here the name is its subject. */}
      <h1>{APP_NAME} {TAGLINE.charAt(0).toLowerCase()}{TAGLINE.slice(1)}</h1>
      <p className="landing-promise">{PROMISE} Free to try; plug in your own AI key for unlimited.</p>
      <p className="landing-actions">
        <Link className="button primary" href="/sample">Try it on a sample</Link>
        <Link className="button" href="/login">Sign in</Link>
      </p>
    </section>

    <section className="landing-demo" aria-label="What a check looks like">
      <div className="landing-paper" lang="en">
        <p>{markSegments(SAMPLE_ESSAY_PARAGRAPHS[DEMO_PARAGRAPH], DEMO_ISSUES).map((seg, i) => seg.issue === undefined ? <Fragment key={i}>{seg.text}</Fragment>
          : <mark key={i} className="sample-mark" data-category={DEMO_ISSUES[seg.issue].category} data-active={seg.issue === OPEN || undefined}>{seg.text}</mark>)}</p>
      </div>
      <div className="issue landing-note" data-category={open.category} aria-label={`${open.category} suggestion`}>
        <span className="issue-category">{open.category}</span>
        <p className="issue-note">{open.note}</p>
        <div className="suggestion-diff" aria-label="Suggested change"><del>{open.quote}</del> <ins>{open.replacement}</ins></div>
      </div>
      <p className="landing-caption muted">Paragraph three of the sample essay, as checked. The whole draft grades {SAMPLE_GRADE.letter} ({SAMPLE_GRADE.percent}%). <Link href="/sample">See the full result</Link>.</p>
    </section>

    <section className="landing-reasons" aria-label="Why">
      <div><h2>Grades like your rubric</h2><p>Six traits, weighted the way an English rubric weights them: evidence counts three times as much as mechanics. You get a letter, a percent, the level on each trait, and the three changes that would raise it most.</p></div>
      <div><h2>Fixes, not rewrites</h2><p>Each note names the words and the change. A comma or a wrong word gets the exact replacement. A thin argument gets what to add, in your own words, not a paragraph written for you.</p></div>
      <div><h2>Real quotes only</h2><p>Every line it points at is in your draft, and every quotation it suggests comes from a source you uploaded. If it cannot find it, it does not show it.</p></div>
    </section>

    <section className="landing-integrity">
      <h2>Is this allowed?</h2>
      <p>{INTEGRITY} Treat it like a writing center: it reads and points, you write. If your course asks about AI use, say you used it to check your draft.</p>
    </section>

    <section className="landing-pricing" aria-label="Pricing">
      <h2>Pricing</h2>
      <dl className="landing-doors">
        <div><dt>Free</dt><dd>A monthly allowance of checks on every account, when this instance offers them; a copy you host yourself runs on your own key.</dd></div>
        <div><dt>Your own key</dt><dd>Unlimited. Your provider bills you, usually under a dollar a month.</dd></div>
        <div><dt>Plus</dt><dd>Coming.</dd></div>
      </dl>
      <p className="landing-actions"><Link className="button primary" href="/sample">Try it on a sample</Link></p>
    </section>

    <footer className="landing-footer muted">
      {APP_NAME} is open source. <a href={REPO}>Run your own copy</a>.
    </footer>
  </main>;
}
