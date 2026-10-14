# Plan: from here to the target

One goal, five workstreams run by subagents in parallel on disjoint files, one verification agent, and a scored loop until the result rates 9/10 or better. Progress and iteration scores are tracked in `docs/progress.md`.

## The one goal

> After this session, a stranger with the link can see what Margin is, try it on a sample without an account, get feedback on their own essay without an API key, see a grade with the three fixes that matter most as the first result, share that report with a link, and plug in their own key for unlimited use. Every existing principle in `docs/target.md` still holds, every existing test still passes, and nothing the owner did not ask for was rebuilt.

## Rules every subagent follows

1. **Read before writing.** This is a Next.js version that differs from training data: read the relevant guide under `node_modules/next/dist/docs/` before touching routes, layouts or metadata. Read `AGENTS.md`.
2. **Own only your files.** The file lists below are exclusive. Shared files were prepared before launch: `lib/brand.ts` (name, tagline, promise, integrity stance), `lib/sample-essay.ts` (sample draft, prompt, profile), and `.env.example` (new variables already named). Import from them; do not edit them.
3. **Preserve the uncommitted work.** `lib/claude.ts` and `lib/essay-fixes.ts` have uncommitted prompt changes that are intentional. Do not revert or reformat them. No workstream owns them.
4. **Match the house style.** Dense TypeScript, comments that say *why*, zod schemas for every request, grounding before display, no new dependencies, no new abstractions for single use. Read two or three neighbouring files before writing.
5. **Keep the principles.** Nothing writes prose for the student. Every quote shown is grounded. Visitor keys never reach the server key path. Copy is blunt and specific, never salesy.
6. **Finish green.** Run `npx tsc --noEmit` and `npm test` before reporting. Add tests under `scripts/check_*.cjs` for new server logic. Do not commit.
7. **Report precisely.** List every file changed, what a reviewer should check by hand, and anything you could not do and why.

## Workstream 1: the front door

**Goal.** A signed-out visitor at `/` sees the landing page; a signed-in one still sees their essays. The landing page shows the product working on the sample essay before asking for anything.

**Owns.** `app/page.tsx`, `app/layout.tsx` (metadata and one CSS import only), `components/Landing.tsx` (new), `app/styles/landing.css` (new), `lib/sample-results.ts` (new), `app/sample/page.tsx` (new), `components/SampleDemo.tsx` (new).

**Must.**
- `app/page.tsx`: no account → render the landing page (status 200, no redirect); account → `EssayHome` as today.
- `Landing.tsx`: the promise from `lib/brand.ts`; a rendered paragraph of the sample essay with three underlines and one open note (static markup styled like the editor's real marks, so it is honest about what the product looks like); three reasons (*Grades like your rubric*, *Fixes, not rewrites*, *Real quotes only*); an *Is this allowed?* section using `INTEGRITY`; pricing as three lines (Free: a monthly allowance of checks; Your own key: unlimited, your provider bills you, usually under a dollar a month; Plus: coming); buttons *Try it on a sample* (→ `/sample`) and *Sign in* (→ `/login`); footer link to run your own copy.
- `lib/sample-results.ts`: a hand-written fixture of what a check of the sample essay produces, consistent with the deliberate flaws listed at the top of `lib/sample-essay.ts`: a `Grade` object shaped exactly like `lib/essay-grade.ts` exports (use `computeGrade` for the percent and letter so the fixture cannot disagree with the real scale), 6 to 8 `EssayIssue`-shaped suggestions whose `quote` strings are exact substrings of `SAMPLE_ESSAY_TEXT` (write a test in `scripts/check_sample.cjs` that asserts every quote is found), and three next steps. Label it in code as a sample fixture.
- `app/sample/page.tsx` + `SampleDemo.tsx`: the sample essay laid out as paper with the fixture's suggestions underlined, a side panel with the grade card open on top (letter, percent, trait pips, three biggest gains) and the suggestion cards below; clicking an underline or a card highlights the other. Reuse existing CSS classes (`.page`, `.issue`, `.grade-*`, `.ai-check`) rather than inventing a second look. A clear line that this is a sample with pre-computed results, and one button *Check my own essay* → `/login?next=/` for signed-out visitors. Public, no account needed.
- `app/layout.tsx`: title from `APP_NAME`, a `description` from `TAGLINE`, and the landing CSS import. Change nothing else there.
- Works at phone width (16px gutters, no horizontal scroll).

**Must not.** Touch `EssayEditor.tsx`, `EssayHome.tsx`, the login page, or any API route. Call the AI.

**Done when.** `curl -sI http://localhost:3000/` without a cookie returns 200; the page shows the promise, demo, reasons, integrity, pricing and both buttons; `/sample` renders the fixture; `scripts/check_sample.cjs` passes; tsc and tests green.

## Workstream 2: the free door

**Goal.** A signed-in account without its own key gets a monthly allowance of AI requests on the server's key, counted so it cannot be exceeded, and always sees how many are left.

**Owns.** `lib/ai-config.ts`, `lib/server/ai-quota.ts` (new), `app/api/ai/route.ts`, `app/api/ai/connection/route.ts`, `db/schema.sql`, `lib/ai-client.ts`, `components/AiAccount.tsx`, `components/KeyErrorLink.tsx`, `scripts/check_ai.cjs`, `scripts/check_ai_quota.cjs` (new), `README.md` section "Free tier" only (append one short section; workstream 4 owns the rest of the README and will not touch that section).

**Must.**
- `AI_FREE_REQUESTS_PER_ACCOUNT` (already in `.env.example`): when greater than 0 and a server key for `AI_PROVIDER` is configured, a signed-in account that sends no `x-ai-key` gets up to that many requests per calendar month on the server key, always with the economy model. Independent of `AI_ALLOW_SERVER_KEY`, which keeps its current meaning (unlimited private instance).
- A visitor-supplied key is never checked against the quota and never falls back to the server key, exactly as today (`scripts/check_ai.cjs` already asserts this; keep those tests passing).
- The counter is atomic and reserved before the provider is called: one `INSERT … ON CONFLICT DO UPDATE … RETURNING` in a new `ai_quota` table (`user_id`, `month`, `used`), following the pattern of `signup_throttle` in `lib/server/auth.ts`. Parallel requests cannot exceed the allowance. A failed provider call (5xx, network) refunds the reservation; a refused or invalid-key response does not.
- Both `/api/ai` and `/api/ai/connection` go through the same gate. The connection test with no key reports `{ ok: true, model, free: { used, limit, resetsAt } }` when the allowance applies.
- Every AI response carries an `x-ai-free` header with `{ used, limit, resetsAt }` when the request ran on the allowance; `lib/ai-client.ts` reads it, keeps it in memory (and `sessionStorage`), and dispatches an `ai-free-change` event. Export `readAiFree()`.
- When the allowance is exhausted the error is a 402 with a message that says what to do: "You've used this month's N free checks. Connect your own API key for unlimited checks, billed by your provider." `KeyErrorLink` must match that message too so the inline link to AI settings appears.
- `AiAccount.tsx` label: with a saved key as today; without one, "N free checks left" (or "Free checks used up · connect a key"); when the server offers no allowance, the current "Connect your AI key".
- `README.md`: one short appended section "Free tier" explaining the variable and the monthly reset.
- Tests: quota reservation, refund on provider failure only, monthly reset, no quota path when a visitor key is supplied, 402 message and header shape. Mock `sql` the way existing tests mock things; do not hit a real database in tests.

**Must not.** Change the model selection for visitor keys. Store visitor keys. Touch `lib/claude.ts` (it calls `resolveAiCredentials(headers, env, fast)`; keep that signature working, adding optional parameters only).

**Done when.** With `AI_FREE_REQUESTS_PER_ACCOUNT=3` and a server key set in a local `.env.local`, a new account can run three requests without a key, the fourth returns the 402 message, the AI button shows the count, and all tests pass. If no server key is available locally, prove the gate with tests and say so.

## Workstream 3: the first run and the hero

**Goal.** A new account reaches real feedback in two clicks, the grade is the first thing it sees, and nothing from the Antigone assignment is on by default.

**Owns.** `components/EssayHome.tsx`, `components/SetupWelcome.tsx`, `components/SuggestionsTab.tsx`, `components/EssayGrade.tsx` (default-open behaviour and placement only), `lib/essay-document.ts` (defaults only), `lib/essay-workflow.ts` (schema defaults only), `components/SourcesTab.tsx` (Antigone row only), `app/styles/home.css`, `app/styles/setup.css`, `app/styles/panel.css`, `lib/legacy-import.ts` (the banner's trigger only).

**Must.**
- Home: next to *Blank essay*, a second tile *Start with the sample* that creates an essay from `lib/sample-essay.ts` (title, text converted with `textToHtml` from `lib/paste.ts`, the prompt as the brief, `SAMPLE_PROFILE` and `SAMPLE_TARGET_WORDS` in settings, `includeAntigone: false`) and opens it. The setup wizard must not open for it (it already has a brief).
- Setup wizard: one step. The assignment prompt (textarea plus file drop) and the working thesis, then *Start writing*. A single line underneath: "Writing type, course, citation style, sources and notes for the AI are under Sources → Writing setup." Keep the full four-step dialog reachable from *Edit* in the Sources tab (the `editing` prop) so nothing is lost; only the first-run path shrinks. Remove the "Connect AI key" nudge from the wizard: the nudge belongs where a check is attempted without access, and that path already exists.
- Antigone off by default: `includeAntigone` defaults to `false` in `EMPTY_ESSAY_SETTINGS` and the schema. In the Sources tab, the built-in Antigone row stays as an opt-in library item with a one-line explanation ("Built-in text for Sophocles' *Antigone*; switch on if you are writing about it"). Existing saved essays keep whatever they have. Replace the Antigone example thesis in the wizard with a neutral one.
- Hero: in `SuggestionsTab.tsx`, the primary action becomes one button *Check my essay* that runs the live check and the grade together (call `onCheck()` and request the grade; `EssayGrade.tsx` exposes a way to trigger its run, for example a `runSignal` prop, without moving its state). The grade card renders at the top of the results and is open by default after a run; its *Biggest gains* list sits directly under the letter. *Grammar only*, *Whole-essay review*, *Big issues only* and the AI-pattern check move under a single *More checks* disclosure. Keep every existing handler; only the arrangement and defaults change.
- Legacy banner: show only when `findLegacy` returns at least one essay or book with non-empty content (inspect `lib/legacy-import.ts` and tighten the trigger; the banner appeared on a brand-new account in a fresh browser during the audit).
- Copy in your files uses `APP_NAME` where the product is named.

**Must not.** Touch `EssayEditor.tsx` (the props it passes to `SuggestionsTab` and `EssayGrade` are the contract; add optional props only). Change any AI prompt. Remove a feature.

**Done when.** A new account can click *Start with the sample*, then *Check my essay*, and see the grade open at the top with marks in the text (with a key or the free allowance from workstream 2; without either, the existing "connect your key" error shows with its link). A blank essay opens with the one-step wizard. The Antigone box is unchecked on a new essay. tsc and tests green.

## Workstream 4: name, voice, and the README

**Goal.** The product has a name, a promise, and copy in its own voice everywhere a buyer reads; the README sells before it instructs.

**Owns.** `README.md` (everything except the "Free tier" section workstream 2 appends), `components/LoginForm.tsx`, `components/AiSettings.tsx`, `app/login/page.tsx` (metadata only), `docs/positioning.md` (new), `app/styles/ai-check.css` (only if the settings dialog needs it).

**Must.**
- `docs/positioning.md`: the name decision (keep "Margin" as working name; list five alternatives with one line each on why or why not), the one-line promise, the three reasons, the integrity stance, who it is for and who it is not for, the three doors with prices (Free, Your own key, Plus coming), a short voice guide with five before/after copy examples taken from the current UI, and the ten-word description for a store listing.
- `LoginForm.tsx`: brand from `APP_NAME`; sign-up lede that says what you get (free checks every month, your essays saved) before the username rules; keep every validation rule and the security behaviour. A one-line link back to the landing page.
- `AiSettings.tsx`: reorganise as three doors in this order: *Free checks* (reads `readAiFree()` from `lib/ai-client.ts` if that export exists at build time; if it does not yet, render the section from a small `free` prop defaulting to null so the file compiles either way), *Your own key* (the current form, with the lede rewritten for a student: what an API key is in one sentence, that it costs cents, that a Claude.ai or ChatGPT subscription is not the same thing, and the exact three steps), *Plus* (one line, coming). Cost and privacy details move under disclosures. Keep every handler, validation and security property.
- `README.md`: lead with the name, the promise, a sixty-second description of the loop, the three doors, and the integrity stance; then "Run your own copy" with the existing instructions intact; then the existing cost, keys, data and production sections condensed where they repeat. Keep every operational fact that is true. Do not touch the "Free tier" section if it is present.

**Must not.** Change any security behaviour in the settings dialog or login. Invent features. Use marketing filler ("revolutionary", "powered by AI").

**Done when.** No screen says "Essay editor"; a reader of the README knows what the product is before the first command; the settings dialog shows the three doors; tsc and tests green.

## Workstream 5: the shareable report

**Goal.** A graded essay can be shared as a link that shows the grade, trait levels and the three fixes, never the essay text, cannot be forged, and needs no database.

**Owns.** `lib/server/share.ts` (new), `app/api/share/route.ts` (new), `app/r/page.tsx` (new), `components/ShareReport.tsx` (new), `app/styles/share.css` (new, imported from `app/r/page.tsx`), `components/EssayGrade.tsx` (add one *Share report* button and the resulting link UI; workstream 3 owns its open-by-default and placement, so coordinate by adding a self-contained `ShareReport` component rendered below the next steps and touching nothing else in that file), `scripts/check_share.cjs` (new).

**Must.**
- Payload: `{ v: 1, letter, percent, traits: [{ key, level }], steps: [string×3], at: ISO date, title?: string }` with a 300-character cap on each step and an optional 80-character title the sharer types (no essay text, no username, no essay id). Encode as base64url JSON, sign with HMAC-SHA256 under `SHARE_SECRET` (already in `.env.example`), and put both in the URL as `/r?d=<payload>.<signature>`. Verify with a constant-time comparison. If `SHARE_SECRET` is unset, the API returns a clear 503 and the UI says sharing is not set up on this instance.
- `POST /api/share` takes the current `Grade` (validated with zod against the shape `lib/essay-grade.ts` exports, trait keys restricted to `TRAITS`), requires a signed-in account, and returns the URL. Same-origin check like the other routes.
- `/r` is public, server-rendered, renders the report with the existing `.grade-*` styling, "Checked with Margin on <date>", the promise from `lib/brand.ts`, and *Try it on your essay* → `/`. A bad or tampered link shows "This link is not valid" with the same button, status 404. `noindex` on the page.
- `ShareReport.tsx`: a *Share report* button under the grade; on success shows the link with *Copy*; optional title field. Disabled when the grade is stale ("Grade again before sharing").
- Tests: sign and verify round trip, tamper detection (payload, signature, truncated), length caps, missing secret, zod rejection of essay text or unknown trait keys.

**Must not.** Add a table. Include essay text, username or essay id in the payload. Touch anything in `EssayGrade.tsx` beyond rendering `ShareReport`.

**Done when.** With `SHARE_SECRET` set locally, sharing a grade produces a link that opens signed-out and shows the report; editing one character of the URL shows the invalid page; tests pass.

## The verification agent

Runs after all five workstreams report. Fresh context. It gets this file, `docs/audit.md`, `docs/target.md`, the full `git diff` and `git status`, and the reports from the five workstreams. It must:

1. Run `npx tsc --noEmit`, `npm test`, and `npm run build` itself and record the results.
2. Walk the sixty-second loop in `docs/target.md` in a browser against the dev server as a signed-out visitor, then as a new account, and record what it saw at each step.
3. Check every principle in `docs/target.md` against the diff, especially: no code path writes prose for the student beyond what existed; every new quote shown is grounded; visitor keys never reach the server-key path; the free counter cannot be exceeded; share links cannot be forged.
4. Check the rules above: files touched outside each workstream's list, reverted uncommitted work in `lib/claude.ts` or `lib/essay-fixes.ts`, new dependencies, removed features, salesy copy, "Essay editor" left anywhere a user sees.
5. Score the ten criteria below, one point each (half points allowed), with evidence for every score, and list the concrete gaps that cost points, each with the file and the fix.

### The ten criteria

1. A signed-out visitor at `/` sees what the product is and can start in one click.
2. A signed-in account can get AI feedback without an API key when the free allowance is configured, and always sees how many requests are left.
3. The obvious first action in the editor produces a grade with the three biggest gains at the top and marks in the text.
4. Nothing from the Antigone assignment or the `finals` app is on by default or shown first-run; a blank essay opens with a one-step setup.
5. The product has a name and consistent copy in its own voice; the integrity stance is stated where a buyer reads.
6. Bring-your-own-key still works end to end and is presented as a benefit, not a requirement.
7. A grade report can be shared by a link that shows the grade and fixes, reveals no essay text, and rejects tampering.
8. `tsc`, `npm test` and `npm run build` pass with no existing test changed to make it pass.
9. Security properties hold: visitor keys never fall back to the server key, the free counter is atomic, share links are signed, no new data leaves the tab.
10. The change is surgical: no file outside the ownership lists, no reverted uncommitted work, no new dependencies, no removed feature, house style kept.

## The loop

1. Launch workstreams 1 to 5 in parallel.
2. When all have reported: run tsc, tests and build. Fix anything red myself before verification, and record the fix.
3. Launch the verification agent. Record its score and gap list in `docs/progress.md` as iteration N.
4. If the score is below 9: for each gap, either fix it directly (small) or send a follow-up to the owning workstream with the exact gap (large). Then go to step 2 with N+1.
5. Stop at 9 or above, or when an iteration changes nothing, in which case `docs/progress.md` says exactly what is still short and why.
