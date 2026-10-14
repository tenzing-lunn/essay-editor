# Margin

**Margin reads your essay the way your professor will.** Paste a draft and get a grade estimate, the three fixes that matter most, and the exact lines to change. It never writes your essay for you.

Margin marks problems and shows you how to fix them in your own words. It will not draft paragraphs, pad your argument, or invent quotations: every quotation it suggests comes from a source you uploaded.

## Sixty seconds, start to finish

1. **Land.** The front page states the promise and shows a sample essay with real marks. *Try it on a sample* opens it; no account needed.
2. **See it work.** The sample opens with a grade at the top, the three biggest gains under it, and underlines in the text. Click an underline to read the note and the fix.
3. **Paste your own.** *Check my own essay* asks for an account: a name, a username and a password. Paste your draft from Google Docs or anywhere else, and the assignment prompt if you have one.
4. **Get the result.** *Check my essay* runs the check and the grade together: a letter and percent, rubric levels for six traits, the three biggest gains, and marks on the exact lines. The AI button in the corner shows how many free checks are left.
5. **Tell someone.** *Share report* makes a link that shows the grade, the trait levels and the three fixes, and never the essay text. The link is signed, so it cannot be forged.
6. **Run out.** When the month's free checks are used up, the message says what to do next: connect your own key for unlimited checks, billed by your provider.

## Three ways to run checks

| Door | What you get | What it costs |
| --- | --- | --- |
| **Free** | A monthly allowance of checks on the instance's own key, with the economy model. Nothing to set up. | Nothing. The operator sets the allowance with `AI_FREE_REQUESTS_PER_ACCOUNT`. |
| **Your own key** | Unlimited checks with your Claude or OpenAI API key, and your choice of economy or deeper feedback. | Your provider bills you per request, a fraction of a cent to a few cents each; usually under a dollar a month. |
| **Plus** | Hosted checks on the stronger model. | A monthly price. Not available yet. |

Writing, saving, version history, sources and the revision checklist never need a key.

## Is this allowed?

The four questions students and teachers ask, answered from what the code does:

- **Does it write my essay?** No. It marks problems and suggests the smallest change in your own words. There is no "rewrite this paragraph."
- **Is every quotation real?** Yes. Nothing reaches the screen unless it was found in your draft or in a source you uploaded; a quotation the model made up is dropped before display.
- **Will a detector flag me?** The built-in AI-pattern check is calibrated to read formal academic prose as human and flags only wording that earned it. It says so on screen: an estimate, not proof.
- **Who can read my essay?** Your account, and whoever runs the instance you use (see *Keys and personal data*). Your API key leaves your browser tab only inside the request you asked for.

The grade is an estimate, not your teacher's grade. The rubric is analytic, adapted from the AP English argument rubric and the AAC&U Written Communication rubric. The model picks a level for each trait and must cite evidence for it; the weights, caps and letter scale are fixed in code, so the same levels always give the same grade.

## What else is in the box

Grammar-only checks, a whole-essay review, paragraph focus with a skeptical-reader pass, actions on highlighted text (unclear?, synonyms, tighten, evidence?, ask), source checks against books you upload (`.txt`, `.md`, `.pdf`, `.docx`, `.epub`) with a quote finder, the AI-pattern check, a revision checklist, a paragraph outline, version history, offline recovery, and paste from Google Docs. Every AI action runs only when you ask for it, unless you switch on automatic re-reviews.

## Run your own copy

Margin is open source. A copy needs Node.js and a Postgres database, nothing else.

1. Fork this repository on GitHub, then clone your fork (copy its clone URL from **Code**).
2. Install Node.js **22.20 or later**.
3. Create a Postgres database. A free [Neon](https://neon.com) project works; on Vercel, add Neon from the Storage tab and run `vercel env pull .env.local`. Otherwise copy `.env.example` to `.env.local` and set `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`, the direct connection, if your provider gives you a pooled one).
4. Run these commands inside the cloned folder. `npm run db:migrate` creates the tables; it is safe to run again after pulling changes.

   ```sh
   npm ci
   npm run db:migrate
   npm run dev -- --hostname 127.0.0.1
   ```

5. Open [your copy](http://127.0.0.1:3000) and create an account with a name, username and password. There is no email address and no password reset, so keep your password somewhere safe.
6. Give it a way to run checks. Either open **AI settings**, choose Claude or OpenAI, paste your API key and **Connect** (a small billable request verifies access; economy mode is on by default for Claude), or set `AI_FREE_REQUESTS_PER_ACCOUNT` and a server key in `.env.local` so every account gets free checks (see the comments in `.env.example`).
7. Paste your draft and assignment prompt, then **Check my essay**. Selected-text actions and paragraph focus give feedback on one part at a time.

Sharing grade reports needs `SHARE_SECRET` in `.env.local` (any long random string); without it the share button says sharing is not set up on this instance. To rename the product, change `APP_NAME` in `lib/brand.ts`; the tagline, promise and integrity line live there too.

### Getting an API key

1. Open the API keys page for [Claude Platform](https://platform.claude.com/settings/keys) or [OpenAI](https://platform.openai.com/api-keys) and sign in or create an account.
2. Add a few dollars of API credit in the billing settings. A Claude or ChatGPT chat subscription does not include API credit.
3. Create a key and copy it straight away; it is shown only once. Claude keys start with `sk-ant-`, OpenAI keys with `sk-`.
4. In the app, open **AI settings**, choose the matching provider, paste the key, then **Connect**. The app refuses a key that doesn't match the chosen provider, so it is never sent to the wrong company.

Set a monthly spending limit with your provider. Never share your key; if it leaks, delete it on the same page and create a new one. Other providers are not implemented yet.

A new account starts with no essays. Supply source excerpts in the editor for source checks. The optional Antigone lookup uses the bundled Perseus edition in `data/antigone.xml` (CC BY-SA 4.0; see [data/antigone-source.md](data/antigone-source.md)).

## What your own key costs

Unlimited checks for cents. A request costs **fractions of a cent to a few cents**, and a month of steady use on the economy model is usually under a dollar. The math, so you can check it; these are examples, not measured bills or a guaranteed price per essay:

| Model | Input / 1M tokens | Output / 1M tokens | Example: 3,000 input + 1,000 output |
| --- | ---: | ---: | ---: |
| GPT-4.1 mini | $0.40 | $1.60 | $0.0028 (0.28¢) |
| Claude Haiku 5.5 | $0.10 ($0.50 above 100K) | $0.50 ($2.50 above 100K) | $0.0008 (0.08¢) |
| Claude Sonnet 5.5 | $2 | $10 | $0.016 (1.6¢) |

Standard USD rates checked October 9, 2026: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [GPT-4.1 mini pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Providers may change rates or require a minimum credit purchase. Your actual bill depends on both input and output tokens, including instructions, draft context, and supplied sources.

At the example size above, 100 requests would cost about **$0.28 / $0.08 / $1.60** respectively. Claude Haiku 5.5 switches to the higher rates for any request whose prompt (including cached tokens) exceeds 100,000 tokens. A full essay check can send multiple requests, one per paragraph. Automatic whole-essay reviews are off by default; enabling them can charge for a changed essay every three minutes while the tab is visible. Long drafts, source texts, and repeated reviews increase the bill. Claude economy mode uses Haiku for everything; turning it off uses Sonnet for deeper feedback and Haiku for quick checks. OpenAI uses GPT-4.1 mini throughout. Configure spending controls with your provider and watch its usage dashboard; this app does not enforce a dollar cap.

### Cost counter

The **AI settings** button shows an estimated running USD total. Open it to see request count, input/output tokens, and the last request's model and cost. Usage is counted for all AI tools, including connection tests and enabled automatic reviews. Counts are scoped to this tab, persist across reloads, and combine providers until you choose **Reset counter**. Resetting does not affect provider billing.

Costs use provider-reported token usage and the standard rates above, including cache reads and writes. Refused or invalid responses still count when the provider reports usage. Requests with unavailable usage or prices are marked unknown, so the displayed amount is a partial total. Disconnected or interrupted requests may never deliver usage to the browser. This is an estimate, not your provider invoice, remaining credit, or a spending limit; check the provider's usage dashboard for billing.

## Keys and personal data

The app keeps the key in this browser tab's session storage, with an in-memory fallback if storage is blocked. **Disconnect** removes it. Closing the tab normally ends the session, though browser session restore can restore session storage. Keys never go into essay saves, version history, URLs, or GitHub. For each AI request the app server receives the key and forwards the submitted context to the selected provider. Use your own instance or a host you trust; use HTTPS for any remote instance. Avoid configuring request-header logging on your host.

Each request uses its own credentials. An invalid visitor key never falls back to the owner's key. Unlimited server billing is disabled unless `AI_ALLOW_SERVER_KEY=true` is explicitly configured. For a private personal instance, copy `.env.example` to `.env.local`, opt in, set `AI_PROVIDER` and the corresponding API key, and restart the server. Keep `.env.local` out of Git; never put secrets in `NEXT_PUBLIC_` variables.

**Essays are stored in your account.** Each essay, its assignment brief, notes, checklist and version history (the newest 100 versions), and the books you upload for source checks are saved in the instance's Postgres database under your account, so they follow you to any device or browser where you sign in. Other accounts can't see them. Whoever runs the instance (and its database host) can read the database, so use your own instance or one you trust. Essays moved to the trash are deleted for good after 30 days; deleting your account deletes everything it owns immediately. Drafts written before accounts existed stay in that browser's IndexedDB until you sign in there and import them.

Passwords are stored only as salted scrypt hashes, and sessions as SHA-256 hashes of a random token in an HTTP-only cookie. You stay signed in for 30 days; using the app extends it. Ten sign-in attempts without a correct password lock that username for 15 minutes, even against the right password and even when the attempts arrive at once. The lock is per username, not per device, so anyone can lock a username for 15 minutes by guessing wrong ten times; that is the price of making password guessing slow. Each network (IP address) can create 5 accounts an hour (`SIGNUP_LIMIT_PER_HOUR`; `0` turns it off; local loopback requests are exempt). An account holds up to 1,000 essays (archived and trashed ones included) and 12 sources of up to 4,000,000 characters and 50,000 sections each. AI keys and AI usage counts never go into the database.

## Running a production instance

```sh
npm ci
npm test
npm run db:migrate
npm run build
npm start -- --hostname 127.0.0.1
```

All state lives in Postgres (`DATABASE_URL`), so any Node.js or serverless host works, including Vercel with Neon: the app uses the pooled `DATABASE_URL` and `npm run db:migrate` the direct `DATABASE_URL_UNPOOLED` when set. Serve it over HTTPS (the session cookie is marked `Secure` in production) and leave `AI_ALLOW_SERVER_KEY` off for a public deployment. The sign-up limit keys on the first `X-Forwarded-For` address, which Vercel sets itself. Behind your own reverse proxy, overwrite that header with the client address (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`): appending lets clients choose the first address, and without the header every request looks like loopback, which is exempt.

`node scripts/smoke-api.mjs` checks every account, essay and book endpoint against a running server (`BASE_URL`, default `http://localhost:3000`) using throwaway `test_` accounts that it deletes afterwards. It reads `DATABASE_URL` from `.env.local` (the same database the server uses) to set up cheap limit checks and remove the throttle rows it creates, and sends made-up `X-Forwarded-For` addresses so it never uses up your own sign-up allowance.

Dependency versions are pinned and `package-lock.json` is committed; use `npm ci` to reproduce the installed versions. CI runs the tests, the typecheck and the build on every push. `.env.local` is ignored by Git, and essays live in the database, never the repository, so you can share the code without including your essay or key.

## Free tier

Set `AI_FREE_CHECKS_PER_ACCOUNT` and `AI_FREE_BUDGET_USD` above 0 and configure a server key for `AI_PROVIDER` (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) in `.env.local`, then run `npm run db:migrate` (it adds the `ai_quota` and `ai_free_spend` tables). Every signed-in account then gets that many checks per calendar month (UTC) on the server key, always with the economy model, without connecting a key of its own. A check is one click: every request an account makes within two minutes of the first, up to forty, counts once, so *Check my essay* (a request per paragraph plus the grade) is one check however long the essay is. Each request is reserved in the database before the provider is called, so parallel requests cannot go over the allowance; a check whose every request the provider could not serve (busy, out of credit, the server key failing) is given back, a refusal or a bad answer is not. What each free request cost is added to the month's total, and once the total reaches `AI_FREE_BUDGET_USD` free checks pause for every account until the 1st, so no number of new accounts can spend more than that. It can be passed only by requests already running when it is reached, a few cents at most; set a spend limit on the key in your provider's console as well. The AI button shows how many checks are left, every response that ran on the allowance carries the count in an `x-ai-free` header, and a used-up allowance or a spent budget returns `402` with a message pointing to AI settings. A visitor who connects their own key is never counted and never falls back to the server key. `AI_ALLOW_SERVER_KEY=true` still means unlimited use of the server key for everyone and switches the counting off; leave it `false` on a public instance and use the allowance instead.
