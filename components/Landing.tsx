import Link from "next/link";
import AnnotatedPassage from "@/components/AnnotatedPassage";
import GlossLeader from "@/components/GlossLeader";
import Wordmark from "@/components/Wordmark";
import { APP_NAME, INTEGRITY, NAME_GLOSS, NAME_GREEK, PROMISE } from "@/lib/brand";
import { SAMPLE_ESSAY_PARAGRAPHS } from "@/lib/sample-essay";
import { SAMPLE_GRADE, SAMPLE_ISSUES } from "@/lib/sample-results";

// Paragraph three of the sample carries three of its flaws in four sentences, so the marks read without the rest of the essay.
const DEMO_PARAGRAPH = 2;
const DEMO_ISSUES = SAMPLE_ISSUES.filter((s) => s.paragraphId === DEMO_PARAGRAPH).slice(0, 3);
// The open note is the one with a drop-in fix: the most concrete thing the product does, and the clearest proof it does not rewrite.
const OPEN = Math.max(0, DEMO_ISSUES.findIndex((s) => s.replacement));
const REPO = "https://github.com/tenzing-lunn/essay-editor";

/** A note in the page's own margin, in Scholia's pen. */
const Aside = ({ children }: { children: React.ReactNode }) => <p className="aside">{children}</p>;

/** What a signed-out visitor sees at /: one notebook page. The essay column on the left, Scholia's notes in the margin on the right. */
export default function Landing() {
  return <main className="landing ruled">
    <header className="sheet-row landing-bar">
      <div className="cell-text"><Wordmark /></div>
      <nav className="cell-margin" aria-label="Site"><Link href="/sample">Sample essay</Link><Link href="/login">Sign in</Link></nav>
    </header>

    <section className="sheet-row landing-hero">
      <div className="cell-text">
        <h1><span className="hero-name">{APP_NAME}</span> reads your essay <span className="hl hero-swipe">the way your professor will.</span></h1>
        <p className="landing-promise">{PROMISE}</p>
        <p className="landing-actions">
          <Link className="btn btn-ink" href="/sample">Try it on a sample</Link>
        </p>
      </div>
      <div className="cell-margin">
        <p className="aside gloss"><span lang="el" className="greek">{NAME_GREEK}</span>: {NAME_GLOSS}</p>
      </div>
      <GlossLeader />
    </section>

    <AnnotatedPassage paragraph={SAMPLE_ESSAY_PARAGRAPHS[DEMO_PARAGRAPH]} issues={DEMO_ISSUES} initial={OPEN}
      label="From the sample essay, paragraph three, as Scholia checked it. Point at a mark." />

    <section className="sheet-row landing-grade">
      <div className="cell-text">
        <p>The whole draft grades {SAMPLE_GRADE.letter}, {SAMPLE_GRADE.percent}%: an estimate against a rubric, not your teacher’s grade. <Link href="/sample">See the full result</Link></p>
      </div>
      <div className="cell-margin">
        <p className="grade-circle" aria-label={`Grade estimate ${SAMPLE_GRADE.letter}, ${SAMPLE_GRADE.percent} percent`}>
          <span aria-hidden="true">{SAMPLE_GRADE.letter}</span>
          <svg viewBox="0 0 120 92" aria-hidden="true"><path d="M70 9C38 3 9 22 11 50c2 26 34 37 62 32 27-5 41-25 34-47C101 17 84 9 62 9 50 9 40 12 33 17" /></svg>
          <small aria-hidden="true">{SAMPLE_GRADE.percent}%</small>
        </p>
      </div>
    </section>

    <section className="sheet-row landing-section" aria-labelledby="does">
      <div className="cell-text"><h2 id="does">What it does</h2></div>
    </section>
    <section className="sheet-row landing-point">
      <div className="cell-text"><h3><span className="hl">Grades like your rubric</span></h3>
        <p>Six traits, weighted the way an English rubric weights them: evidence counts three times as much as mechanics. You get a letter, a percent, the level on each trait, and the three changes that would raise it most.</p></div>
      <div className="cell-margin"><Aside>Adapted from the AP English argument rubric and AAC&amp;U’s. Weights fixed in code, so the same levels always give the same grade.</Aside></div>
    </section>
    <section className="sheet-row landing-point">
      <div className="cell-text"><h3><span className="hl">Fixes, not rewrites</span></h3>
        <p>Each note names the words and the change. A comma or a wrong word gets the exact replacement. A thin argument gets what to add, in your own words, not a paragraph written for you.</p></div>
      <div className="cell-margin"><Aside>There is no “rewrite this paragraph” button. There never will be.</Aside></div>
    </section>
    <section className="sheet-row landing-point">
      <div className="cell-text"><h3><span className="hl">Real quotes only</span></h3>
        <p>Every line it points at is in your draft, and every quotation it suggests comes from a source you uploaded. If it cannot find it, it does not show it.</p></div>
      <div className="cell-margin"><Aside>A quotation the model made up is dropped before you see it.</Aside></div>
    </section>

    <section className="sheet-row landing-section" aria-labelledby="allowed">
      <div className="cell-text">
        <h2 id="allowed">Is this allowed?</h2>
        <p>{INTEGRITY} Treat it like a writing center: it reads and points, you write. If your course asks about AI use, say you used it to check your draft.</p>
      </div>
      <div className="cell-margin"><Aside>A tutor, not a ghostwriter.</Aside></div>
    </section>

    <section className="sheet-row landing-section" aria-labelledby="pricing">
      <div className="cell-text">
        <h2 id="pricing">Three ways to run checks</h2>
        <dl className="doors">
          <div><dt>Free</dt><dd>A monthly allowance of checks on every account, when this instance offers them. A copy you host yourself runs on your own key.</dd></div>
          <div><dt>Your own key</dt><dd>Unlimited. Paste a Claude or OpenAI key; your provider bills you, usually under a dollar a month.</dd></div>
          <div><dt>Plus</dt><dd>Coming.</dd></div>
        </dl>
      </div>
      <div className="cell-margin"><Aside>Writing, saving, version history and sources never need a key.</Aside></div>
    </section>

    <section className="sheet-row landing-close">
      <div className="cell-text">
        <p className="close-line">Read the sample the way your professor would, then check your own.</p>
        <p className="landing-actions"><Link className="btn btn-ink" href="/sample">Try it on a sample</Link></p>
      </div>
    </section>

    <footer className="sheet-row landing-footer">
      <div className="cell-text"><p>{APP_NAME} is open source. <a href={REPO}>Run your own copy</a>.</p></div>
    </footer>
  </main>;
}
