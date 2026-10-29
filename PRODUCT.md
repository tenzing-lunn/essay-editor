# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Students writing graded essays** (high school and college English, history, humanities). They have a due date, a prompt, and two fears: a bad grade and being accused of using AI. They usually have a ChatGPT or Claude.ai subscription, not an API key. They draft in Google Docs and hand in typed Times 12pt. This is the market.
2. **Teachers and writing centers** who recommend tools. They say yes to a tool that marks and explains and never drafts. This is the distribution channel.
3. **Tinkerers and self-hosters** with an API key who want unlimited checks for cents. Small, loud, the source of the "plug in your AI" story.

## Product Purpose

Scholia reads a student's essay the way their professor will: a grade estimate against a rubric, the three fixes that matter most, and marks on the exact lines to change. It never writes the essay. Success is a student who sees feedback on their own draft within a minute, fixes it in their own words, and shares the report.

## Positioning

**An essay harness for writing with AI** (`docs/harness.md`, 2026-10-29). In a coding harness the model writes and the human reviews; in Scholia the human writes and the model reviews. Claude Code is the harness that lets a model write code you can trust; Scholia is the harness that lets you write with AI and still own every sentence. "Harness" is the thesis and the line under the name, not the name; student-facing copy stays plain ("reads your essay the way your professor will").

Notes beside your text, never instead of it. Every competitor that "improves" writing rewrites it; Scholia only marks, explains, and points at the smallest change in the writer's own words. Every quotation it shows was found in the draft or in a source the writer uploaded. The grade comes from a fixed analytic rubric (adapted from the AP English argument rubric and the AAC&U Written Communication rubric) with weights and caps fixed in code.

## Operating Context

- Students paste drafts from Google Docs, often late at night before a deadline, on a laptop.
- The editor is a two-column workspace: the essay page and a side panel of results (grade, three biggest gains, suggestion cards, AI-pattern check, sources, revision checklist, outline, version history).
- Public front door: landing page at `/` (signed out), sample essay at `/sample` with precomputed results (no account, no cost), share report at `/r?d=…` (grade, trait levels, three fixes, never essay text).
- Three doors for AI: Free monthly allowance on the operator's key, Your own key (Claude or OpenAI, unlimited, billed by the provider), Plus (coming, suggested $8/month).

## Capabilities and Constraints

- Next.js 16 App Router, React 19, plain CSS files in `app/styles/` plus `app/globals.css`; no CSS framework.
- Accounts are name, username, password; no email, no password reset. Google sign-in is planned (phase 1).
- Writing, saving, version history, sources, and the revision checklist never need a key.
- Phones are for reading feedback, not drafting.
- Non-goals: collaboration, teacher dashboards, LMS integration, any feature that writes prose for the student.

## Brand Commitments

- **Name: Scholia** (σχόλια, the notes Greek scholars wrote in the margins of manuscripts; said SKOH-lee-uh). Chosen 2026-10-13, replacing the working name "Margin". The name lives in `lib/brand.ts`.
- **Look: neutral tool (owner, 2026-10-29).** Serious and quiet: a white page on a light gray desk, one sans-serif interface face, gray borders instead of decoration, color only where it carries meaning (issue categories, errors). This replaces the notebook-and-highlighter brief of 2026-10-13, which is kept in git history (commit 10547e4).
- **Essay page:** a plain white page in a document font (Literata by default), so it still reads like what the student will hand in. Scholia's notes are set in the interface face, never a handwriting face.
- **Theme:** light only for now; tokens structured so a night theme can be added later.
- **Voice:** blunt, specific, plain words, no padding, no praise, no exclamation marks, no "powered by AI", "seamless", "revolutionary". Numbers over adjectives. Honest about limits in the same breath ("an estimate, not your teacher's grade").

## Evidence on Hand

- The sample essay: a first-year Frankenstein draft with known flaws and precomputed results (`lib/sample-essay.ts`, rendered by `components/SampleDemo.tsx`), labelled as a sample.
- Strategy docs: `docs/target.md`, `docs/positioning.md`, `docs/audit.md`, `docs/plan.md`, `docs/progress.md`.
- No testimonials, user counts, school logos, or press exist. Do not invent them.

## Product Principles

1. **It never writes the essay.** Suggested revisions are the smallest change in the writer's own words.
2. **Every quotation is real.** Nothing reaches the screen unless it was found in the draft or the writer's sources.
3. **Blunt and specific.** Notes name the words and the change.
4. **Honest about what it is.** A grade is an estimate; an AI check is an estimate, not proof.
5. **The key stays in the tab.** Visitor keys are never stored server-side.

## Accessibility & Inclusion

WCAG 2.2 AA. Marks in the essay must not rely on color alone (category is also named in the note). Every text color must pass 4.5:1 on its background.
