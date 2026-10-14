# Audit: why this would not sell, and what fixes it

Written 2026-10-12 against commit `6ea7275` plus the uncommitted prompt changes in `lib/claude.ts` and `lib/essay-fixes.ts`. Everything below was checked by reading the code and by running the app in a browser as a brand-new visitor.

## Verdict

The engineering is good. The product is not for sale. A stranger who gets the link sees a sign-in form with no explanation, and the only way to get any value is to go to a developer console, add a credit card, and paste an `sk-ant-` key into a three-step dialog. The buyer this was built for (a student with an essay due) cannot get past step one, and the people who can (developers who write essays) are not a market. Under that are a dozen smaller tells that this is one person's tool for one English class: a hard-wired copy of *Antigone* switched on for every new essay, `finals:` in every storage key, a 4-step setup wizard before you can type, fourteen AI actions with no hero, and no name.

None of this is hard to fix. The AI core, the grounding, the security and the editor are the expensive parts and they exist. What is missing is the product wrapper: a front door, a free first taste, one obvious thing to do, a name, and a reason to tell a friend.

## What exists and is worth keeping

Being fair about this matters, because the fix is to keep the core and change the wrapper, not to rebuild.

- **The feedback ethic is the differentiator.** The system prompt in `lib/claude.ts` says "never pad, never praise, never rewrite in a generic voice" and "the writer's voice must survive." The uncommitted changes push further: every note must name the exact words and a change the writer can make in minutes, and the model is told to drop anything it is not sure about. This is the opposite of ChatGPT's "here is a better version of your paragraph," and it is the only academic-integrity story in this category that teachers could endorse.
- **Everything the model says is grounded before it is shown.** `groundFixes`, `groundGrade`, `groundPredictions`, `groundArgumentMap`, `groundSourceCheck` and `groundFocus` all verify that quotes exist in the draft or the uploaded sources before anything reaches the screen. Invented quotations cannot appear. Most competitors do not do this.
- **The grade is computed in code, not by the model.** `lib/essay-grade.ts` has the model pick rubric levels with evidence first, then weights, caps and the letter scale are fixed. The same essay grades the same way twice. The rubric is adapted from AP and AAC&U rubrics.
- **The AI-pattern check defaults to "human."** `scorePredictability` is calibrated so formal academic prose is not flagged, and burstiness can only strengthen a flag the wording already earned. This is the ethical version of GPTZero.
- **Security is real.** CSP with `connect-src 'self'`, visitor keys never fall back to the server key, scrypt passwords, hashed session tokens, lockouts, sign-up throttles, same-origin checks, size limits on every mode.
- **The editor is a working Google Docs clone** with offline recovery, conflict detection, version history, keepalive saves on tab close, paste from Docs, and a paragraph outline.
- **70 tests, typecheck clean, CI runs tests and build.**

## The reasons it would not sell

Ordered by how much each one blocks a sale. P0 means no sale is possible until fixed.

### R1. There is no front door. (P0)

**Evidence.** `app/page.tsx:8` redirects every signed-out visitor to `/login`. The login page says "Essay editor. Sign in. Welcome back." The `<title>` is "Essay editor." There is no landing page, no screenshot, no sentence about what it does, no demo. The README is the only description of the product and it starts with "Fork this repository."

**Why it kills the sale.** You cannot sell what nobody can see. Every link shared, every search result, every "try this" from a friend lands on a form that asks for a password before saying what the product is. The conversion rate from that page for a stranger is approximately zero.

**Fix.** A public landing page at `/` for signed-out visitors: who it is for, the one promise, a demo they can click without an account, honest pricing, sign-up. Signed-in users still go straight to their essays. Effort: one day. This is workstream 1 in `docs/plan.md`.

### R2. Value is gated behind an API key the buyer does not have. (P0)

**Evidence.** `lib/ai-config.ts:24-28` throws "Connect your API key in AI settings to use AI tools" whenever no key is supplied, unless `AI_ALLOW_SERVER_KEY=true` (which the README says to leave off for any public instance). The AI settings dialog (`components/AiSettings.tsx`) is a three-step wizard: choose provider, paste key, choose quality, with "Step-by-step help" that sends the user to the Claude Platform console to "add a few dollars of API credit." The README adds: "A Claude or ChatGPT chat subscription does not include API credit."

**Why it kills the sale.** The target buyer is a student. Students have ChatGPT Plus, or Claude.ai, or nothing. Almost none have a developer console account, and getting one needs a credit card and an understanding of tokens. Bring-your-own-key (BYOK) is a fine power-user path and a genuinely good cost story. As the *only* path it caps the market at developers who happen to write essays.

**Fix.** Keep "plug in your own AI" as a first-class door, and open a second door in front of it: a free monthly allowance of AI requests per signed-in account, served on the operator's key with the cheapest model, with an atomic per-account counter so it cannot be exceeded. When the allowance runs out, the message says what to do next: connect your own key (unlimited, your bill) or, later, subscribe. Effort: one to two days. Workstream 2.

### R3. No name, no brand, no voice. (P0)

**Evidence.** `app/layout.tsx:26` sets the title to "Essay editor." `components/LoginForm.tsx` shows "Essay editor" as the brand. The README heading is "# Essay editor."

**Why it kills the sale.** "Essay editor" is a category, not a product. It cannot be searched for, remembered, or told to a friend. Nothing on any screen says what makes this one different, even though the difference (it marks, it never writes for you, every quote is real) is sharp and easy to say.

**Fix.** A name in one constant (`lib/brand.ts`, added in this session with the working name "Margin" so it can be changed on one line), a one-line promise, and copy everywhere in the product's actual voice: blunt, specific, no padding. Workstream 4.

### R4. One-assignment residue is everywhere. (P1)

**Evidence.**
- `includeAntigone: true` is the default in `lib/essay-document.ts:39` and `lib/essay-workflow.ts:371`. Every new essay's setup wizard and Sources tab show "Sophocles, *Antigone* (built in)" already checked.
- `data/antigone.xml` ships inside every API function bundle (`next.config.ts` `outputFileTracingIncludes`), and `checkEssaySources` loads it into the prompt by default.
- The setup wizard's example thesis is "Creon, not Antigone, is the play's tragic protagonist."
- Every browser storage key starts with `finals:` (`finals:ai:v1`, `finals:essay-live-check:v1`, `finals:essay-grade:v1`). The first commit message is "Essay editor, split from the finals app."
- The home page showed a yellow "This browser has an essay saved from before accounts" banner on a brand-new account in a fresh browser during this audit.

**Why it hurts.** A buyer writing about *Hamlet* sees a tool built for someone else's Antigone assignment and concludes it will not work for theirs. The residue also signals "side project" to anyone evaluating whether to rely on it.

**Fix.** Antigone off by default and presented as a library item you can switch on; neutral placeholder text; `finals:` prefixes renamed (with the old keys read once and migrated so nobody loses a saved check); the legacy banner only when it has something real to import. Workstream 3 handles the defaults and placeholders.

### R5. Fourteen AI actions and no hero. (P0)

**Evidence.** On one screen the Suggestions tab offers: Check essay, Grammar only, Whole-essay review, a "Big issues only" switch, a collapsed Grade estimate, a collapsed AI-sounding writing check, "Check for AI patterns", category filter chips, a selection card, a "Big picture" block, and suggestion cards. Highlighting text adds Unclear?, Synonyms, Tighten, Evidence?, Set as thesis, Ask. The Paragraph tab adds Analyze connections and Skeptical reader. The Sources tab adds Check sources and Find a quote. The empty-state copy admits the problem: "No suggestions yet. Choose Check essay, or highlight any passage to ask about it. In the essay, press Alt+Enter (⌥↩ on Mac) on an underline to open it."

**Why it kills the sale.** Products spread when there is one sentence to tell a friend. "It grades your essay like your professor would and tells you the three things to fix" is that sentence. "It has fourteen AI features" is not. A new user with no idea what to click first clicks nothing.

**Fix.** One hero flow: paste, one button, and the result is a grade with the three biggest gains at the top and the marks in the essay underneath. Everything else stays, but secondary and progressive. The grade stops being a collapsed accordion (`components/EssayGrade.tsx` defaults `open` to false and hides the most shareable output in the product). Workstream 3.

### R6. Six steps and a credit card before the first "wow". (P0)

**Evidence.** The path to value today: create an account (username and password only, no Google) → home → Blank essay → a four-step setup wizard (`components/SetupWelcome.tsx` `STEPS`) → the AI key dialog → a trip to a developer console and billing page → paste the essay → Check essay.

**Why it kills the sale.** Each step loses a large share of the people who reach it. Multiply six of them and under five percent of visitors ever see feedback. Nobody shares a product they never saw work.

**Fix.** A sample essay one click away ("See it on a sample"), the wizard collapsed to a single optional field (the assignment prompt) with the rest reachable later, the free allowance from R2 so no key is needed at first, and the key dialog only when it is actually needed. Workstreams 1, 2 and 3 together.

### R7. The trust story answers the wrong questions. (P1)

**Evidence.** The README and the AI settings privacy section talk about session storage, scrypt, SHA-256, CSP and `X-Forwarded-For`. Nowhere does the product answer the questions a student, a parent or a teacher actually asks: Is using this cheating? Does it write my essay? Will my professor's AI detector flag me? Who can read my essay?

**Why it hurts.** Those are the buying questions. Teachers recommend tools on those answers. The product's real behaviour (marks problems, never drafts, every quote from your own sources, an AI-pattern check that errs toward "human") is the best possible answer and it is invisible.

**Fix.** An "Is this allowed?" section on the landing page and a one-line integrity promise in the app, written in plain words. The engineering details stay in the README for people running their own copy. Workstreams 1 and 4.

### R8. No distribution mechanics at all. (P1)

**Evidence.** There is no sharing, no public page, no referral, no embed, no browser extension, no Google Docs add-on, no export with comments. The essay lives in a custom `contentEditable` editor (`components/EssayEditor.tsx`, 1,155 lines), so the student has to leave Google Docs to use it.

**Why it hurts.** "Viral" needs an artifact that travels or presence where the writer already is. A grade report is screenshot-worthy; the AI-pattern check ("check before your professor's detector does") is a search-worthy free tool; neither can be shared today.

**Fix, in order of cost.** (1) A shareable grade-report link that reveals the grade, the trait levels and the three fixes but never the essay text, signed so it cannot be forged and needing no database. (2) Referral credit added to the free allowance. (3) The AI-pattern check as a public free tool on the landing page once the free allowance has abuse protection. (4) Later: a Chrome extension or Docs add-on, and connecting through Claude.ai or ChatGPT apps for students who already pay for those. Workstream 5 does (1).

### R9. The account system repels sign-ups. (P1)

**Evidence.** `components/LoginForm.tsx`: "There's no email and no password reset, so pick something you'll remember." No Google sign-in.

**Why it hurts.** Every school is on Google Workspace; "Continue with Google" is table stakes. "No password reset" is a promise to lose someone's work. (`.env.local` already contains `NEON_AUTH_BASE_URL`, so Neon Auth is provisioned and unused.)

**Fix.** Google sign-in via Neon Auth, keeping username and password for self-hosted copies; optional email for recovery. Not in this session's workstreams because it needs an OAuth client registered by the owner; it is the first item of the next phase in `docs/target.md`.

### R10. There is no business model, by design. (P1)

**Evidence.** README: "There is no app subscription." `.env.example`: "Visitors must fund their own requests."

**Why it hurts.** A product with no price cannot be sold, and BYOK alone means the most engaged users pay the provider and never the product.

**Fix.** Three doors: Free (a monthly allowance on the hosted key), Plus (hosted, better model, a monthly price), and Your own key (unlimited, your bill, free forever). BYOK stays as the "plug in your AI" promise and as the retention hook for power users. Payments need Stripe and are phase 1 in `docs/target.md`; the free door and the BYOK door are built in this session.

### R11. Self-hosting is the primary distribution. (P2)

**Evidence.** README step 1: "Fork this repository on GitHub."

**Why it hurts.** Correct for an open-source project, wrong for a product. Only developers can follow it.

**Fix.** The README leads with the hosted product and the promise; "Run your own copy" becomes a section. Workstream 4.

### R12. Nothing is measured. (P1)

**Evidence.** No analytics, no event logging, no feedback control, no error reporting.

**Why it hurts.** The funnel in R6 cannot be improved if nobody can see where people drop. Fix: a handful of privacy-respecting events (landing view, sign-up, first essay, first check, key connected, share) with no essay text. Phase 1 in `docs/target.md`.

### R13. Cost is framed defensively instead of as a benefit. (P2)

**Evidence.** README "How cheap is it?" is a per-token price table. AI settings says "about $0.001 a request."

**Why it hurts.** Students do not think in tokens. The real benefit is "unlimited checks for about a dollar a month with your own key, versus twelve dollars a month elsewhere."

**Fix.** Lead with the benefit; keep the math one click away. Workstream 4.

### R14. The free experience would run on the cheapest model. (P2)

Economy mode defaults to Haiku for everything. That is right for the free allowance (cost) and wrong for the first impression of "deep" feedback. The paid door should run reviews and grades on Sonnet. Already supported by `economy: false`; just a pricing decision.

### R15. Velocity risk. (note, not a reason)

`components/EssayEditor.tsx` holds the whole editor in one 1,155-line component. It is not why the product would not sell, but it makes every change above slower and riskier. Leave it alone this session; split it when the funnel exists and is measured.

## The one-sentence diagnosis

The product has an expensive, well-built engine and no car around it: no door to get in, no key you can use, no name on the badge, and nothing to tell your friends.

## What this audit does not say

- It does not say the AI feedback is bad. It is unusually honest and well-grounded, and the uncommitted prompt changes make it better.
- It does not say to remove BYOK. BYOK is the "plug in your AI" promise and the cost story. It should be a door, not the gate.
- It does not say to rebuild. Every fix above is a wrapper around what exists.
