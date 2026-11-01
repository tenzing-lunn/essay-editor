import Link from "next/link";
import AnnotatedPassage from "@/components/AnnotatedPassage";
import Wordmark from "@/components/Wordmark";
import { APP_NAME, INTEGRITY, NAME_GLOSS, NAME_GREEK, PROMISE, THESIS } from "@/lib/brand";
import { SAMPLE_ESSAY_PARAGRAPHS } from "@/lib/sample-essay";
import { SAMPLE_GRADE, SAMPLE_ISSUES } from "@/lib/sample-results";

// Paragraph three of the sample carries three of its flaws in four sentences, so the marks read without the rest of the essay.
const DEMO_PARAGRAPH = 2;
const DEMO_ISSUES = SAMPLE_ISSUES.filter((s) => s.paragraphId === DEMO_PARAGRAPH).slice(0, 3);
// The open note is the one with a drop-in fix: the most concrete thing the product does, and the clearest proof it does not rewrite.
const OPEN = Math.max(0, DEMO_ISSUES.findIndex((s) => s.replacement));
const REPO = "https://github.com/tenzing-lunn/essay-editor";

const REASONS = [
  { title: "Grades like your rubric",
    body: "Six traits, weighted the way an English rubric weights them: evidence counts three times as much as mechanics. You get a letter, a percent, the level on each trait, and the three changes that would raise it most.",
    aside: "Adapted from the AP English argument rubric and AAC&U’s. Weights fixed in code, so the same levels always give the same grade." },
  { title: "Fixes, not rewrites",
    body: "Each note names the words and the change. A comma or a wrong word gets the exact replacement. A thin argument gets what to add, in your own words, not a paragraph written for you.",
    aside: "There is no “rewrite this paragraph” button. There never will be." },
  { title: "Real quotes only",
    body: "Every line it points at is in your draft, and every quotation it suggests comes from a source you uploaded. If it cannot find it, it does not show it.",
    aside: "A quotation the model made up is dropped before you see it." },
];

const DOORS = [
  { name: "Free", body: "A monthly allowance of checks on every account, when this instance offers them. A copy you host yourself runs on your own key." },
  { name: "Your own key", body: "Unlimited. Paste a Claude or OpenAI key; your provider bills you, usually under a dollar a month." },
  { name: "Plus", body: "Coming." },
];

/** What a signed-out visitor sees at /: a plain product page. The headline, an example of the tool at work, then the terms. */
export default function Landing() {
  return <div className="landing">
    <header className="landing-bar">
      <div className="landing-brand"><Wordmark /><span className="landing-thesis">{THESIS}</span></div>
      <nav aria-label="Site"><Link href="/sample">Try it on a sample</Link><Link href="/login">Sign in</Link></nav>
    </header>

    <main className="landing-main">
      <section className="landing-hero">
        <h1>{APP_NAME} reads your essay the way your professor will.</h1>
        <p className="landing-lede">{PROMISE}</p>
        <p className="landing-actions">
          <Link className="btn btn-ink" href="/sample">Try it on a sample</Link>
          <Link className="btn" href="/login">Sign in</Link>
        </p>
      </section>

      <section className="landing-example" aria-label="An example">
        <AnnotatedPassage paragraph={SAMPLE_ESSAY_PARAGRAPHS[DEMO_PARAGRAPH]} issues={DEMO_ISSUES} initial={OPEN}
          label="From the sample essay, paragraph three, as Scholia checked it. Select a mark or a note." />
        <p className="landing-grade">The whole draft grades {SAMPLE_GRADE.letter}, {SAMPLE_GRADE.percent}%: an estimate against a rubric, not your teacher’s grade. <Link href="/sample">See the full result</Link></p>
      </section>

      <section className="landing-section" aria-labelledby="does">
        <h2 id="does">What it does</h2>
        <div className="reasons">
          {REASONS.map((r) => <div key={r.title} className="reason">
            <h3>{r.title}</h3>
            <p>{r.body}</p>
            <p className="reason-aside">{r.aside}</p>
          </div>)}
        </div>
      </section>

      <section className="landing-section landing-prose" aria-labelledby="allowed">
        <h2 id="allowed">Is this allowed?</h2>
        <p>{INTEGRITY}</p>
        <p>Treat it like a writing center: it reads and points, you write. If your course asks about AI use, say you used it to check your draft.</p>
      </section>

      <section className="landing-section" aria-labelledby="pricing">
        <h2 id="pricing">Three ways to run checks</h2>
        <dl className="doors">
          {DOORS.map((d) => <div key={d.name}><dt>{d.name}</dt><dd>{d.body}</dd></div>)}
        </dl>
        <p className="doors-note">Writing, saving, version history and sources never need a key.</p>
      </section>
    </main>

    <footer className="landing-footer">
      <p>{APP_NAME} is open source. <a href={REPO}>Run your own copy</a>.</p>
      <p>{APP_NAME}, from the Greek <span lang="el">{NAME_GREEK}</span>: {NAME_GLOSS}</p>
    </footer>
  </div>;
}
