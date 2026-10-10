# Essay editor

Revise an essay with paragraph checks, whole-draft feedback, source checks, and a revision checklist. Connect **your own Claude or OpenAI API key** and pay the provider directly for your usage. There is no app subscription. AI feedback runs when you request it (or opt into automatic reviews); writing and saving do not require a key.

## Run your own copy from GitHub

1. Fork this repository on GitHub, then clone your fork (copy its clone URL from **Code**).
2. Install Node.js **22.20 or later**.
3. Create a Postgres database. A free [Neon](https://neon.com) project works; on Vercel, add Neon from the Storage tab and run `vercel env pull .env.local`. Otherwise copy `.env.example` to `.env.local` and set `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`, the direct connection, if your provider gives you a pooled one).
4. Run these commands inside the cloned folder. `npm run db:migrate` creates the tables; it is safe to run again after pulling changes.

   ```sh
   npm ci
   npm run db:migrate
   npm run dev -- --hostname 127.0.0.1
   ```

5. Open [the essay editor](http://127.0.0.1:3000) and create an account with a name, username and password. There is no email address and no password reset, so keep your password somewhere safe.
6. Open **AI settings · add your key**, choose Claude or OpenAI, paste your API key, and save it. **Test connection** makes a small billable request to verify access. Economy mode is on by default for Claude.
7. Paste your draft and assignment brief. Use **Check essay**, selected-text actions, or paragraph focus when you want feedback.

### Getting an API key

1. Open the API keys page for [Claude Platform](https://platform.claude.com/settings/keys) or [OpenAI](https://platform.openai.com/api-keys) and sign in or create an account.
2. Add a few dollars of API credit in the billing settings. A Claude or ChatGPT chat subscription does not include API credit.
3. Create a key and copy it straight away; it is shown only once. Claude keys start with `sk-ant-`, OpenAI keys with `sk-`.
4. In the app, open **AI settings**, choose the matching provider, paste the key, then **Save key** and **Test connection**. The app refuses a key that doesn't match the chosen provider, so it is never sent to the wrong company.

Set a monthly spending limit with your provider. Never share your key; if it leaks, delete it on the same page and create a new one. Other providers are not implemented yet.

A new account starts with no essays. Supply source excerpts in the editor for source checks. The optional Antigone lookup uses the bundled Perseus edition in `data/antigone.xml` (CC BY-SA 4.0; see [data/antigone-source.md](data/antigone-source.md)).

## How cheap is it?

Small feedback requests can cost **fractions of a cent to a few cents**. These are examples, not measured bills or a guaranteed price per essay:

| Model | Input / 1M tokens | Output / 1M tokens | Example: 3,000 input + 1,000 output |
| --- | ---: | ---: | ---: |
| GPT-4.1 mini | $0.40 | $1.60 | $0.0028 (0.28¢) |
| Claude Haiku 5.5 | $0.10 ($0.50 above 100K) | $0.50 ($2.50 above 100K) | $0.0008 (0.08¢) |
| Claude Sonnet 5.5 | $2 | $10 | $0.016 (1.6¢) |

Standard USD rates checked October 9, 2026: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [GPT-4.1 mini pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Providers may change rates or require a minimum credit purchase. Your actual bill depends on both input and output tokens, including instructions, draft context, and supplied sources.

At the example size above, 100 requests would cost about **$0.28 / $0.08 / $1.60** respectively. Claude Haiku 5.5 switches to the higher rates for any request whose prompt (including cached tokens) exceeds 100,000 tokens. A full essay check can send multiple requests, one per paragraph. Automatic whole-essay reviews are off by default; enabling them can charge for a changed essay every three minutes while the tab is visible. Long drafts, source texts, and repeated reviews increase the bill. Claude economy mode uses Haiku for everything; turning it off uses Sonnet for deeper feedback and Haiku for quick checks. OpenAI uses GPT-4.1 mini throughout. Configure spending controls with your provider and watch its usage dashboard; this app does not enforce a dollar cap.

## Cost counter

The **AI settings** button shows an estimated running USD total. Open it to see request count, input/output tokens, and the last request's model and cost. Usage is counted for all AI tools, including connection tests and enabled automatic reviews. Counts are scoped to this tab, persist across reloads, and combine providers until you choose **Reset counter**. Resetting does not affect provider billing.

Costs use provider-reported token usage and the standard rates above, including cache reads and writes. Refused or invalid responses still count when the provider reports usage. Requests with unavailable usage or prices are marked unknown, so the displayed amount is a partial total. Disconnected or interrupted requests may never deliver usage to the browser. This is an estimate, not your provider invoice, remaining credit, or a spending limit; check the provider's usage dashboard for billing.

## Keys and personal data

The app keeps the key in this browser tab's session storage, with an in-memory fallback if storage is blocked. **Forget key** removes it. Closing the tab normally ends the session, though browser session restore can restore session storage. Keys never go into essay saves, version history, URLs, or GitHub. For each AI request the app server receives the key and forwards the submitted context to the selected provider. Use your own instance or a host you trust; use HTTPS for any remote instance. Avoid configuring request-header logging on your host.

Each request uses its own credentials. An invalid visitor key never falls back to the owner's key. Server billing is disabled unless `AI_ALLOW_SERVER_KEY=true` is explicitly configured. For a private personal instance, copy `.env.example` to `.env.local`, opt in, set `AI_PROVIDER` and the corresponding API key, and restart the server. Keep `.env.local` out of Git; never put secrets in `NEXT_PUBLIC_` variables.

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

Dependency versions are pinned and `package-lock.json` is committed; use `npm ci` to reproduce the installed versions. `.env.local` is ignored by Git, and essays live in the database, never the repository, so you can share the code without including your essay or key.
