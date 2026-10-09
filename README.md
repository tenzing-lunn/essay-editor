# Essay editor

Revise an essay with paragraph checks, whole-draft feedback, source checks, and a revision checklist. Connect **your own Claude or OpenAI API key** and pay the provider directly for your usage. There is no app subscription. AI feedback runs when you request it (or opt into automatic reviews); writing and saving do not require a key.

## Run your own copy from GitHub

1. Fork this repository on GitHub, then clone your fork (copy its clone URL from **Code**).
2. Install Node.js **22.20 or later** and run these commands inside the cloned folder:

   ```sh
   npm ci
   npm run dev -- --hostname 127.0.0.1
   ```

3. Open [the essay editor](http://127.0.0.1:3000).
4. Open **AI settings · add your key**, choose Claude or OpenAI, paste your API key, and save it. **Test connection** makes a small billable request to verify access. Economy mode is on by default for Claude.
5. Paste your draft and assignment brief. Use **Check essay**, selected-text actions, or paragraph focus when you want feedback.

### Getting an API key

1. Open the API keys page for [Claude Platform](https://platform.claude.com/settings/keys) or [OpenAI](https://platform.openai.com/api-keys) and sign in or create an account.
2. Add a few dollars of API credit in the billing settings. A Claude or ChatGPT chat subscription does not include API credit.
3. Create a key and copy it straight away; it is shown only once. Claude keys start with `sk-ant-`, OpenAI keys with `sk-`.
4. In the app, open **AI settings**, choose the matching provider, paste the key, then **Save key** and **Test connection**. The app refuses a key that doesn't match the chosen provider, so it is never sent to the wrong company.

Set a monthly spending limit with your provider. Never share your key; if it leaks, delete it on the same page and create a new one. Other providers are not implemented yet.

A new browser starts with a blank essay. Supply source excerpts in the editor for source checks. The optional Antigone lookup uses the bundled Perseus edition in `data/antigone.xml` (CC BY-SA 4.0; see [data/antigone-source.md](data/antigone-source.md)).

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

**Drafts stay in your browser.** The essay, assignment brief, notes and version history are saved in this browser's IndexedDB on this device, never on the server, so a shared deployment gives each visitor a private workspace. Clearing site data or using a private window removes them, and they do not sync between devices or browsers: use **Download formatted essay** to keep a copy or move a draft, then paste it into the editor elsewhere. Only the text you send with an AI request passes through the server, on its way to your provider.

## Running a production instance

```sh
npm ci
npm test
npm run build
npm start -- --hostname 127.0.0.1
```

The server keeps no state, so any Node.js or serverless host works, including Vercel. Serve it over HTTPS and leave `AI_ALLOW_SERVER_KEY` off for a public deployment.

Dependency versions are pinned and `package-lock.json` is committed; use `npm ci` to reproduce the installed versions. `.env.local` is ignored by Git, and drafts never touch the repository, so you can share the code without including your essay or key.
