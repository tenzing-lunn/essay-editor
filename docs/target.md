# Target: the product that sells

This is the end state the plan in `docs/plan.md` builds toward. It is written from the buyer's side first, then the system's.

## The promise

> **Margin reads your essay the way your professor will.** Paste a draft and get a grade estimate, the three fixes that matter most, and the exact lines to change. It never writes your essay for you. Free to try; plug in your own AI key for unlimited.

"Margin" is a working name held in `lib/brand.ts`; the rest of this document uses it so the copy reads as a product. Alternatives are listed in `docs/positioning.md`.

## Who buys

1. **Students writing graded essays** (high school and college English, history, humanities). They have a due date, a prompt, and fear of two things: a bad grade and being accused of using AI. They have ChatGPT or Claude.ai subscriptions, not API keys.
2. **Teachers and writing centers** who recommend tools. They say yes to a tool that marks and explains and never drafts, and no to anything that writes.
3. **Tinkerers and self-hosters** who already have an API key and want unlimited checks for cents. Small group, loud, and the source of the open-source goodwill and the "plug in your AI" story.

The first group is the market. The second is the distribution channel. The third is the retention and cost story.

## "Plug in your AI" done right

The phrase has to mean three doors, not one gate:

| Door | Who | How it works | Why it exists |
| --- | --- | --- | --- |
| **Free** | Everyone who signs up | A monthly allowance of AI requests served on the operator's key with the economy model. Counted atomically per account so it cannot be exceeded. | The first taste. Nothing is sold without it. |
| **Plus** (phase 1) | Students who want more | Hosted, the stronger model for reviews and grades, a monthly price. Stripe. | The revenue. |
| **Your own key** | Power users, self-hosters, the cost-conscious | Paste a Claude or OpenAI key. Unlimited. Billed by the provider, usually under a dollar a month. Works today. | The promise in the user's words: "just plug in your AI." Also the retention hook: a connected key never churns. |

A later fourth door, for the students who already pay twenty dollars a month to Claude.ai or ChatGPT: connect Margin as an app or MCP server inside the assistant they already have. That is the most literal "plug in your AI" and the largest pool of ready buyers, but it depends on those platforms' app programs and belongs in phase 3.

## The sixty-second loop

This is the whole product from the buyer's chair.

1. **Land.** A page that says the promise, shows a real essay with real marks, and has one button: *Try it on a sample*. No account.
2. **See it work.** The sample essay opens with a grade at the top (C, 75%), the three biggest gains, and underlines in the text. Click an underline, read the note, see the fix. Nothing is hidden behind a key.
3. **Try your own.** *Check my essay* asks for an account (name, username, password now; Google sign-in in phase 1). Paste from Google Docs. One button.
4. **Get the result.** Grade, three fixes, marks. The free allowance counter shows what is left.
5. **Tell someone.** *Share report* makes a link with the grade and the three fixes and no essay text. The link page has the promise and the button from step 1.
6. **Run out.** The allowance ends with a message that says exactly what to do: plug in your own key (unlimited, your bill) or, in phase 1, subscribe.

Every step is one click from the one before it.

## What makes it spread

- **The report card.** A grade estimate is screenshot-worthy and the share link carries the pitch.
- **"Check before your professor's detector does."** The AI-pattern check is the one feature students search for in a panic. Once the free allowance has abuse protection, it becomes a public tool on the landing page.
- **The integrity story teachers can repeat.** Marks, never drafts; every quotation from your own sources; defaults to "human." This is a sentence a writing center can put in a syllabus.
- **Referral credit** (phase 2). Invite a classmate, both get more free requests.
- **It is honest about cost.** Unlimited for cents with your own key is a story the tinkerer crowd tells for you.

## Principles that must survive every change

These are what the product is. Any plan that breaks one is wrong.

1. **It never writes the essay.** No "rewrite my paragraph." Suggested revisions are the smallest change in the writer's own words, and only for problems the draft already contains the ideas to fix.
2. **Every quotation is real.** Nothing reaches the screen unless it was found in the draft or the writer's uploaded sources.
3. **Blunt and specific.** Notes name the words and the change. No padding, no praise, no editing jargon.
4. **Honest about what it is.** A grade is "an estimate, not your teacher's grade." An AI check is "an estimate, not proof."
5. **The key stays in the tab.** Visitor keys are never stored, never fall back to the server key, never leave for another host.
6. **Cheap by default.** The economy model unless the user chooses otherwise.

## The experience, screen by screen

### Landing (`/`, signed out)

Headline: the promise. Under it, a rendering of a real paragraph with three underlines and one open note, so the visitor sees the product before reading about it. Three short reasons: *Grades like your rubric*, *Fixes, not rewrites*, *Real quotes only*. A section titled *Is this allowed?* with the integrity stance in four sentences. Pricing in three lines: Free, Your own key, Plus (coming). Two buttons: *Try it on a sample* and *Sign in*. Footer: run your own copy (GitHub).

### Sample essay (`/sample` or the landing demo)

The sample essay (`lib/sample-essay.ts`, a first-year Frankenstein draft with known flaws) shown in the real editor layout with pre-computed results, so the demo is instant and costs nothing. The results are a fixture, labelled as a sample. One button: *Check my own essay*.

### Home (signed in)

*Start a new essay* and *Start with the sample*. The essay list. No legacy banner unless there is something real to import.

### Editor

The right panel leads with one primary action. The grade card sits at the top of results, open. Under it the three biggest gains, then the suggestion cards, then the AI-pattern check. The other tools (grammar only, whole-essay review, selection actions, paragraph focus, sources) are present and one level down. The AI button in the corner reads "12 free checks left" or "Claude key connected · ≈ $0.04".

### AI settings

Three doors, in this order: *Free checks* (what is left, when it resets), *Your own key* (the existing dialog, with copy for students: what a key is, that it costs cents, that a Claude.ai subscription is not the same thing), *Plus* (coming). The privacy details stay but move under a disclosure.

### Share page (`/r?d=…`)

The report: grade, percent, trait levels, three fixes, "Checked with Margin on <date>". No essay text, no name unless the sharer adds one. The promise and *Try it on your essay*.

## Non-goals for now

- Writing on a phone. The phone layout stays usable for reading feedback, nothing more.
- Collaboration, comments between people, teacher dashboards.
- LMS integration.
- Any feature that writes prose for the student.

## From here to there

| Phase | What | Why first | Owner |
| --- | --- | --- | --- |
| **0 (this session)** | Landing page with sample demo · free monthly allowance on the server key · first-run with sample essay, one-field setup, grade as hero · brand, copy, README · shareable grade report | Removes every P0 in the audit. After this a stranger can see it, try it, get value, and share it. | Subagents, see `docs/plan.md` |
| **1 (next)** | Google sign-in via Neon Auth · Stripe "Plus" plan · six analytics events · deploy with a server key and the allowance on | Turns the funnel into a business and makes it measurable. Needs owner-registered OAuth and Stripe accounts. | Owner |
| **2** | Public AI-pattern check on the landing page (with firewall rate limits) · referral credit · rename `finals:` storage keys with migration | The two cheapest growth loops once abuse protection exists. | Owner or subagents |
| **3** | Chrome extension or Google Docs add-on · Margin as a Claude.ai / ChatGPT app (MCP) · split `EssayEditor.tsx` | Meets students where they already write and where their AI already lives. | Owner |

## How we know it worked

| Metric | Today | Target after phase 1 |
| --- | --- | --- |
| Visitors who see what the product does | 0% (login wall) | 100% |
| Visitors who see feedback on an essay without a key | 0% | > 40% (sample demo) |
| Sign-ups who get feedback on their own essay | ≈ 0% (key wall) | > 60% |
| Users who return for a second essay | unknown | > 30% |
| Reports shared per 100 grades | 0 | > 10 |
| Free users who plug in a key or subscribe when the allowance ends | 0 | > 15% |
