# Positioning

What the product is called, what it promises, who it is for, what it costs, and how it talks. The name and the strings that depend on it live in `lib/brand.ts`; this document is the reasoning behind them.

## The name

**Margin** stays as the working name. The margin is where a teacher writes: beside your text, never instead of it. One word, two syllables, easy to say and to spell, and it describes the behaviour that sets the product apart (marks, not rewrites). Risks: it is a common word, so search and a domain are harder, and it has a finance meaning (profit margin, margin call) that the essay context removes quickly.

Five alternatives, considered and set aside:

1. **Redline** — the editing term for marking a draft; says "marks, does not rewrite" even more directly. Set aside because red ink reads as punishment to a student, and the word belongs to lawyers and contracts.
2. **Marginalia** — more distinctive and more searchable than Margin. Set aside because it is four syllables most students have never said aloud; the product should not need explaining before its own name does.
3. **Second Reader** — the honest metaphor: a reader who sees the draft before your professor does. Set aside because two words are harder to own, and "second" sounds second-rate.
4. **Rubric** — names the differentiator (grades like your rubric). Set aside because a rubric is the sheet the teacher hands out; "open Rubric" is confusing, and the word is dry.
5. **Draft Reader** — plain and descriptive. Set aside because it is a category, not a name: unsearchable, unmemorable, and it sounds like a file viewer.

## The promise

**Margin reads your essay the way your professor will.** A grade estimate, the three fixes that matter most, and the exact lines to change. It never writes your essay for you.

## The three reasons

- **Grades like your rubric.** An analytic rubric adapted from the AP English argument rubric and the AAC&U Written Communication rubric (`lib/essay-grade.ts`). The model picks a level per trait and must cite evidence first; the weights, caps and letter scale are fixed in code, so the same levels always give the same grade.
- **Fixes, not rewrites.** The system prompt forbids padding, praise and rewriting in a generic voice (`lib/claude.ts`). Every note names the exact words and a change the writer can make in minutes, in the writer's own voice. There is no "rewrite this paragraph."
- **Real quotes only.** Every quotation is checked against the draft or the uploaded sources before it reaches the screen (`groundFixes`, `groundGrade`, `groundSourceCheck` and the rest). A quotation the model made up is dropped, not shown.

## The integrity stance

> Margin marks problems and shows you how to fix them in your own words. It will not draft paragraphs, pad your argument, or invent quotations: every quotation it suggests comes from a source you uploaded.

In the buyer's questions:

| Question | Answer |
| --- | --- |
| Is using this cheating? | It does what a writing-center tutor does: points at the problem and asks you to fix it. Nothing it produces goes into your essay unless you type it. |
| Does it write my essay? | No. Suggested changes are the smallest edit in your words, and only for problems the draft already has the ideas to fix. |
| Will my professor's AI detector flag me? | The built-in AI-pattern check reads formal academic prose as human by default and flags only wording that earned it. It is an estimate, not proof, and it says so. |
| Who can read my essay? | Your account and whoever runs the instance you use. Your API key stays in your browser tab. |

## Who it is for

- **Students writing graded essays**: high school and college English, history and the humanities. They have a due date, a prompt, and two fears: a bad grade and an AI accusation. They have a ChatGPT or Claude.ai subscription, or nothing; not an API key. This is the market.
- **Teachers and writing centers** who recommend tools. They say yes to a tool that marks and explains and never drafts. This is the distribution channel.
- **Tinkerers and self-hosters** with an API key who want unlimited checks for cents. Small, loud, and the source of the "plug in your AI" story. This is the retention and cost story.

## Who it is not for

- Anyone who wants the essay written, rewritten, lengthened or "made to sound better." Every one of those is refused by design.
- Writers of fiction, cover letters or marketing copy. The rubric, the prompt analysis and the source checks are built for argued, graded, cited prose.
- Phones. The layout stays readable for feedback; writing a draft on a phone is not a goal.
- Institutions wanting dashboards, class rosters or LMS integration. Not built, not planned for this phase.

## The three doors

| Door | Price | What you get |
| --- | --- | --- |
| **Free** | $0 | A monthly allowance of checks on the operator's key with the economy model, counted per account so it cannot be exceeded. The first taste; nothing sells without it. |
| **Your own key** | $0 to Margin; your provider bills you, usually under a dollar a month | Unlimited checks with a Claude or OpenAI API key, economy or deeper feedback. Works today. The literal "plug in your AI," and the door a connected user never leaves. |
| **Plus** | Coming. Suggested **$8 a month**, cancel any time | Hosted checks on the stronger model (Sonnet for reviews and grades), no key to manage. |

Why $8: a full check of a five-paragraph essay on Sonnet is roughly six requests at about 1.6¢ each, so around a dime; a grade is one more. A student checking three times a week all month costs about $1.50 in provider fees, and a heavy user ten times that. $8 covers the heavy case with room, sits under the "ask a parent" line, and is well under Grammarly Premium (about $12 a month on an annual plan) and the $20 a month of ChatGPT Plus or Claude Pro, neither of which grades to a rubric or refuses to write. Pair it with a fair-use cap of about 150 full checks a month so one account cannot run the plan at a loss. The own-key door stays free forever so the cheap path is always visible; Plus is for the student who wants the better model and no setup.

## The voice

Blunt, specific, plain words, no padding, no praise. Say the thing, then stop.

- Name the words and the change. "Comma splice after *sympathy*" beats "watch your punctuation."
- Plain words: key, check, grade, fix. Not solution, experience, journey, leverage.
- No "revolutionary," no "powered by AI," no "seamless," no "effortless."
- No exclamation marks. No welcome, no congratulations.
- Honest about limits in the same breath: "an estimate, not your teacher's grade."
- Numbers over adjectives: "about $0.001 a request" beats "incredibly cheap."

### Five before and after examples from the current UI

1. Sign-in lede (`components/LoginForm.tsx`)
   - Before: "Welcome back. Sign in to see your essays."
   - After: "Sign in to open your essays."

2. Sign-up lede (`components/LoginForm.tsx`)
   - Before: "Your username and password are how you get back to your essays from any device. There's no email and no password reset, so pick something you'll remember."
   - After: "An account gives you free checks every month, when this instance offers them, and keeps your essays on every device you sign in on. There is no email and no password reset, so pick a username and password you will remember."

3. AI settings lede (`components/AiSettings.tsx`)
   - Before: "Use your own API key. Your provider bills you directly for what you use, usually a few cents per check. No subscription."
   - After: "An API key is a password that lets Margin bill AI requests to your own Claude or OpenAI account. Unlimited checks; each request costs a fraction of a cent to a few cents, so a month is usually under a dollar. A Claude.ai subscription is not an API key: API credit is bought separately, a few dollars at a time."

4. Key help, step 2 (`components/AiSettings.tsx`)
   - Before: "Add a few dollars of API credit in billing. A Claude.ai subscription does not include API credit."
   - After: "Sign in to the Claude Platform (or create an account there) and add a few dollars of API credit in billing." The subscription warning moves up into the lede, where a student reads it before trying their Claude.ai password.

5. Empty suggestions panel (`components/SuggestionsTab.tsx`; owned by the first-run workstream, so the rewrite is a recommendation, not applied here)
   - Before: "No suggestions yet. Choose Check essay, or highlight any passage to ask about it. In the essay, press Alt+Enter (⌥↩ on Mac) on an underline to open it."
   - After: "Nothing yet. Choose Check my essay."

## Store listing

Ten words: **Grades your draft like your rubric. Marks fixes, never rewrites.**
