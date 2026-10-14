# Progress

Tracks the plan in `docs/plan.md`. Scores are the verification agent's, out of 10, on the ten criteria in the plan. Target: 9 or above.

## Checklist

### Groundwork
- [x] Read the whole codebase, run tsc and tests (70 pass), open the app as a stranger
- [x] `docs/audit.md`: why it would not sell, and the fix for each reason
- [x] `docs/target.md`: the product that sells, and the path from here
- [x] `docs/plan.md`: one goal, five workstreams, verification agent, scored loop
- [x] Shared scaffolding: `lib/brand.ts`, `lib/sample-essay.ts`, `.env.example` variables

### Workstreams (subagents)
- [x] WS1 Front door: landing at `/`, `/sample` demo, fixture + test
- [x] WS2 Free door: monthly allowance on the server key, atomic counter, 402 + header, AI button count
- [x] WS3 First run and hero: sample tile, one-step setup, grade on top, Antigone off, legacy banner fixed
- [x] WS4 Name and voice: positioning doc, login copy, three-door settings, README
- [x] WS5 Shareable report: signed link, `/r` page, share button, tests

### Verification loop
- [x] Iteration 1: tsc + tests + build green (93 tests); verification agent scored 9.0/10
- [x] Score ≥ 9 reached at iteration 1
- [x] Iteration 2: the four gaps the verifier named fixed; tsc + tests + build green (94 tests); verification agent scored 10/10
- [x] Post-verification cleanup of the verifier's non-scoring notes on iteration 2's own code (stale sentence, prime after disconnect, one test, one record entry); tsc + tests + build re-run, not re-scored
- [x] Iteration 3: five owner flags and the misconfigured-server-key note fixed; tsc + tests (95) + build green, not re-scored

### Orchestrator edits outside the workstream lists

The plan's loop (step 2) has the orchestrator fix anything red before verification and record it. These are the edits that were not on any workstream's list, and why:

| File | Edit | Why |
| --- | --- | --- |
| `components/EssayEditor.tsx` | Document title reads `<essay> – Margin` instead of `– Essay editor` | Criterion 5: no "Essay editor" where a user sees it. Workstream 4 flagged it; nobody owned the file. |
| `components/AccountMenu.tsx` | Sign-out calls `clearAiFree()` | The free count belongs to the account that left. Workstream 2 wrote the function but did not own the file. |
| `scripts/check_essay_workflow.cjs:11` | `includeAntigone` default in the test flipped `true` to `false` | Workstream 3 changed the schema default (criterion 4); the test asserts that default. This is the one test changed in the session, and it changed to track an intended behaviour change, not to make a failure pass. |
| `docs/target.md` | Sample grade corrected to C, 75% | The fixture honestly grades C; the sketch had guessed B−. |
| `app/r/not-found.tsx` | Created by workstream 5, outside its literal list | Next.js needs it for the `/r` 404 boundary that `notFound()` throws into; both verifiers judged it justified. |
| `lib/ai-usage.ts` | One export, `aiReceipts()` | The free door charges each request's billed cost to the monthly budget; the receipts live in this module's request scope. |
| `app/styles/sources.css` | `.source-name input` rules scoped to `:not([type="checkbox"])` | Workstream 3 reused `.source-name` for the Antigone row; the title-editing rule gave its checkbox `width: 100%` and the label wrapped one character per line. Found in the live run. |

## Iterations

| # | What changed since last | tsc | tests | build | Score | Gaps that cost points |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Baseline before any change | pass | 70 pass | not run | 2/10 (my estimate: criteria 6 and 8 only) | Everything in `docs/audit.md` |
| 1 | All five workstreams landed; orchestrator fixed the document-title string in `EssayEditor.tsx`, wired `clearAiFree` into sign-out, corrected the sample grade in `docs/target.md` | pass | 93 pass | pass | **9.0/10** (criteria 1, 3–9 full; 2 and 10 half) | C2: the free count is invisible until the first AI response, and a network failure to the provider kept the check. C10: `check_essay_workflow.cjs:11` edited outside every list without a recorded sanction; `AiSettings.tsx` probed `lib/ai-client` through a namespace cast and kept a duplicate `Free` type. |
| 2 | `GET /api/ai/connection` returns this month's count without spending a check (`peekFree`, `freeStatus`); the AI button asks once per page load (`primeAiFree`). `freeGate` refunds a check when the error carries no provider status (network failure, SDK connection error, empty answer), with three new assertions. `AiSettings.tsx` imports `readAiFree` and `AiFree` directly. Sanctioned edits recorded above. | pass | 94 pass | pass | **10/10** (criteria 2, 6, 8, 9, 10 re-scored from scratch; 1, 3, 4, 5, 7 carried after confirming their files were untouched) | None. Non-scoring notes: the settings sentence "the count shows here after your first check" went stale once the count is primed on load; `primeAiFree` ran only on mount, so after Disconnect the button stayed on "Connect your AI key" until the next check; the saved-key early return had no test; `app/r/not-found.tsx` was unrecorded. |
| 4 | **First live run of the free door**, on the owner's key with `AI_FREE_REQUESTS_PER_ACCOUNT=12` after the owner ran the migration: the button read "12 free checks left" on load from the GET with no row written; one *Check my essay* ran six provider requests (five paragraph `live` checks plus `grade`), the grade card showed C 75% with twelve suggestions, and `ai_quota` held `used=6`. Three things fixed from it: the button had said "8 left" because the last of six parallel answers to arrive carried an older count, so `aiFetch` now ignores a smaller count for the same month, and the page-load GET runs even when a count is stored, since a reload or another tab can be behind (`lib/ai-client.ts`, assertions added); the reset date read "October 31" for a reset at midnight UTC on November 1, so it is formatted in UTC (`AiSettings.tsx`); the Antigone row CSS above. | pass | 95 pass | pass | not scored | — |
| 5 | **Free door made safe to publish.** A check is now one click: every free request within two minutes of the first, up to forty, counts once, so five checks are five *Check my essay* runs (`ai_quota.window_*`). `AI_FREE_BUDGET_USD` is a hard monthly ceiling across every account: each free request's billed cost is added to `ai_free_spend`, an unknown cost counts five cents, and at the ceiling free checks pause for everyone, open checks included. The door no longer opens without a budget. `AI_FREE_REQUESTS_PER_ACCOUNT` renamed `AI_FREE_CHECKS_PER_ACCOUNT`. The SQL was run against real Postgres on temporary copies of both tables inside a rolled-back transaction. Vercel now has `SHARE_SECRET`, `AI_FREE_CHECKS_PER_ACCOUNT=5` and `AI_FREE_BUDGET_USD=10` for Production and Preview. | pass | 98 pass | pass | not scored | — |
| 2b | The four notes above fixed: sentence replaced, `primeAiFree` moved into the button's `refresh` (runs again on `ai-settings-change`), one assertion added, `not-found.tsx` recorded. No verifier run for this; the diff is four lines of copy, one moved call, and a test. | pass | 94 pass | pass | not scored | — |
| 3 | Owner flags fixed, each a small diff: (1) sign-out lands on `/`, not `/login` (`AccountMenu.tsx`). (2) Landing pricing: Free now reads "when this instance offers them; a copy you host yourself runs on your own key" (`Landing.tsx`). (3) The hero's no-key (401) or used-up (402) error shows once, in the panel; the grade card stays quiet when the hero ran it, and still shows errors from its own button (`EssayGrade.tsx`). (4) The connection test on the allowance answers with the economy model and the count from `peekFree` without calling the provider or spending a check, 402 when used up (`freeConnection` in `ai-quota.ts`, used by `POST /api/ai/connection`). (5) `freeLimit` also requires `keyProblem(provider, key) === null`, and `freeGate` refunds a granted check on a 400 or 401, which on a free check is the operator's key; the old "rejected key: kept" assertion now expects a refund. (6) File → New essay from the sample starts with the blank profile instead of ENGL 101 / MLA (`EssayEditor.tsx`). New assertions in `check_ai_quota.cjs` for (4) and both halves of (5). Build run on a scratch copy because a dev server owned `.next`. | pass | 95 pass | pass | not scored | — |

## Flags for the owner (from the iteration-1 verifier, not scored)

- **"Check again to retry" after a 402.** When the allowance runs out mid-hero, `EssayEditor.tsx` wraps the reason as "Part of the essay couldn't be checked (You've used this month's 12 free checks…). Check again to retry." Retrying cannot help; the `ai()` helper would need to keep the HTTP status on the error so the suffix can be dropped on a 402.
- **Live run, 2026-10-12, 12 checks on the owner's key:** button 12 → 6 → 1 → "used up" across three hero clicks (6, 5, 1 requests granted); five parallel requests with one check left produced exactly one 200 and four 402s; `ai_quota` ended at `used=12`, never past the limit.
- **Resolved in iteration 5: the allowance unit.** A check is one click, and a dollar budget caps the month. Multi-account abuse can now drain the free pool early for everyone, but never spend more than `AI_FREE_BUDGET_USD`. Raising the cost of new accounts (Google sign-in, Vercel BotID on sign-up) is phase 1.

- The landing pricing says Free without qualification; it is only true where `AI_FREE_REQUESTS_PER_ACCOUNT` is set with a server key. Fixed in iteration 3.
- Sign-out lands on `/login`; now that `/` is the landing page, `/` would be the natural destination. Fixed in iteration 3.
- File → New essay from the sample inherits the sample's ENGL 101 / MLA profile. Fixed in iteration 3.
- With no key and no allowance, the no-key error shows in both the panel and the grade card. Fixed in iteration 3.
- The connection test in AI settings spends a free check when it runs on the allowance. Fixed in iteration 3.
- The `finals:` prefix on storage keys persists (phase 2 in `docs/target.md`).
- `ai_quota` was migrated on 2026-10-12 (`npm run db:migrate`, run by the owner). Iteration 5's two columns and the `ai_free_spend` table were migrated by the owner on 2026-10-13. `ANTHROPIC_API_KEY` was added to Vercel by the owner the same day, so every variable the free door needs is in place.
