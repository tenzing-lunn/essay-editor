# Harness: the thesis

Written 2026-10-29. This replaces the framing in `docs/target.md`. It does not replace the three doors, the sixty-second loop, or the phase plan; those still stand and this document says what they build toward.

## The three decisions

| Question | Answer |
| --- | --- |
| Is "harness" the name? | No. The name stays **Scholia**. "Essay harness" is the thesis, the architecture, and the tagline: *Scholia, an essay harness for writing with AI.* Student-facing copy stays plain: "reads your essay the way your professor will." |
| Does "never writes the essay" survive? | Yes. It is the harness's first rule, not a limit on it. The harness makes the AI more useful without letting it write the essay. One stated exception, the fix revision (see "The rules"). |
| Who is it for? | Students writing graded essays, first. The harness framing is what reaches AI-literate writers and teachers; they are not a second product. |

## What a harness is

A model on its own produces text. A harness is everything around the model that makes the result trustworthy:

- **The loop** it runs in: what happens first, what happens next, when it stops.
- **Context**: what the model is shown on each call, and what it is not.
- **Tools**: what it can do besides talk.
- **Permissions**: what it may never do.
- **Verification**: code that checks the model's output before anyone sees it.
- **Checkpoints**: the places a human approves or rejects.
- **Memory**: what carries from one session to the next.

Claude Code is the reference. The model writes code; the harness is why you can trust the code: a project file it reads first, a plan it shows before acting, diffs you approve, tests that go red or green, memory across sessions.

## The inversion

In a coding harness the model writes and the human reviews. In an essay harness the human writes and the model reviews. The output is not text. It is a writer who thinks more clearly, and a draft that is visibly theirs.

> **Claude Code is the harness that lets a model write code you can trust. Scholia is the harness that lets you write with AI and still own every sentence.**

That is the one-line version for anyone who already knows what a harness is. For a student, the line is still the promise in `docs/target.md`.

## What Scholia already is

Scholia is a harness that has not said so yet.

- **Single-purpose calls, not a chatbot.** `app/api/ai/route.ts` dispatches eight modes (grade, fixes, review, live, sources, outline, aicheck, focus) plus the selection actions in `lib/claude.ts`. Each has its own schema, prompt and model tier.
- **Verifiers on every result.** `groundGrade`, `groundFixes`, `groundSourceCheck`, `groundArgumentMap` and `groundFocus` check the model's output against the draft and the sources and drop what they cannot find. A made-up quotation never reaches the screen.
- **The model judges, code scores.** The model picks a level per rubric trait and cites evidence; the weights, caps and letter scale are fixed in `lib/essay-grade.ts`. Same levels, same grade.
- **Context is assembled, not dumped.** `writingContext` and `essayContext` in `lib/essay-workflow.ts` build what each call sees from the writing profile, the pinned thesis, the brief and the sources.
- **A permission policy.** The system prompt forbids padding, praise and generic rewriting, and the model never types into the page.

What is missing: the loop, memory across essays, a planning stage before prose, more than one reader, and a record of how the essay was made.

## The map

| Harness part | Essay version | Today |
| --- | --- | --- |
| Project file (CLAUDE.md) | **The brief**: assignment prompt, rubric, course, citation style, thesis, sources. Read first by every call. | Partly: `WritingProfile`, brief, pinned thesis, sources |
| Plan mode | **Argue before prose**: thesis plus a claim-and-evidence map, attacked by the model before a paragraph exists. | Yes (milestone 2): the plan on the cover sheet above the essay (`lib/argument-plan.ts`), with a gate in code and a skeptic and source auditor on the plan. The argument map (`lib/argument-map.ts`) matches each paragraph to the planned claim it argues, for the Draft gate |
| Tools | Grounded quotes, the rubric grader, the argument map, the AI-pattern check | Yes |
| Tests and CI | **The rubric as a test suite**: each trait is a check that passes or fails, alongside "every claim has evidence" and "every quotation is real" | Yes (milestones 1 and 2): each trait passes at Proficient and each prompt requirement is a check; the full read adds "every planned claim has a paragraph" and "quotations check out against your sources" to the same list |
| Permissions | Nothing reaches the page unless the writer chooses it. Notes are proposals the writer acts on. | Yes, with the exceptions stated in "The rules" |
| Hooks | Finishing a paragraph runs the live check; marking a stage done runs that stage's gate | Partly: the live check |
| Subagents | **A reader panel**: the grader, the skeptic, the confused classmate, the source auditor | No |
| Long-term memory | **A writer profile across essays**: recurring patterns, what has been fixed, what keeps coming back | Yes (milestone 1): `essay_checks` per account and `lib/writer-memory.ts` |
| Trace | **A process record**: when each part was written, what the AI said, what the writer changed | Version history only |

## How to write with AI

This is the method the harness enforces. Each rule says what the harness does about it.

1. **Think before the model does.** The MIT Media Lab study *Your Brain on ChatGPT* (Kosmyna et al., 2025) found that people who wrote with an LLM from the start were less engaged, and many could not quote their own essay afterward; people who drafted first and brought the LLM in later did better. It is a small preprint, and it agrees with this product's first rule. *Harness:* the first stages ask the writer for a thesis and claims in their own words before any feedback runs.
2. **The model is an opponent, not an author.** Generating prose is cheap. Judgment, argument and evidence are the work. *Harness:* the strongest calls attack the argument (the skeptic, the evidence check); none produce paragraphs.
3. **Write the spec first.** A thesis, the claims, and the rubric targets are to an essay what tests are to code. *Harness:* the brief and the argument map are saved and every later call is checked against them.
4. **Keep the loops short.** Feedback on one paragraph while it is fresh beats a whole-essay dump at 2am. *Harness:* the live check runs per paragraph; the full grade is a gate, not the only signal.
5. **Ground everything.** Every quotation traces to the draft or an uploaded source. *Harness:* the `ground*` verifiers, already in place.
6. **Retype, do not paste.** The friction is where the learning happens, and it is what makes the draft provably the writer's. *Harness:* notes are shown beside the text; the only one-click inserts are the exceptions in "The rules".
7. **Let it compound.** The real gain is across essays, not within one. *Harness:* the writer profile.

## The loop

The product becomes a sequence of stages with a gate at the end of each. A writer can skip a gate, and the skip is recorded; nothing is locked.

| Stage | The writer does | The harness does | Gate |
| --- | --- | --- | --- |
| **Brief** | Pastes the prompt and rubric, picks the kind of essay, uploads sources | Reads the prompt for what it asks; flags missing pieces | A prompt or a stated purpose exists |
| **Argue** | Writes the thesis and one line per claim, with the evidence each will use | The skeptic attacks the thesis; the source auditor checks the evidence exists | Thesis stated; every claim has named evidence |
| **Draft** | Writes paragraphs | Live check per paragraph against the thesis | Every planned claim has a paragraph |
| **Check** | Runs the full read | Grade as a test suite, three biggest gains, argument map against the plan, source check | The writer has seen every failing check |
| **Revise** | Fixes in their own words | Re-runs only the checks that failed; shows what moved | The writer decides it is done |
| **Submit** | Copies the essay out | Writes the process record; offers the share report | None |

Most of the calls exist. What is new is the order, the gates, and the Argue stage coming before the draft instead of after it.

## Where it goes

In the order to build them.

1. **Writer memory.** A profile built from every check across every essay: "Third essay in a row where your body paragraphs open with plot summary." The harness reads it into each call and shows it at the start of a new essay. This is the strongest reason to stay; a fresh ChatGPT chat cannot do it. *Depends on:* results stored per account on the server. Grades are cached in the browser today (`gradeKey` in `lib/essay-grade.ts`, read by `components/EssayGrade.tsx`), so nothing carries between devices or essays yet.
2. **The stage loop.** The table above, as the editor's spine. *Depends on:* the Argue stage, which is the argument map run on a plan instead of a draft. The editor now has the surfaces for it: Argue on the cover sheet, drafting in Write, Check as "Check my essay", Revise as Review (every open note in one queue, biggest first, in the margin), and the result in the end comment.
3. **The reader panel.** Several readers, each with one job and one voice, instead of one block of feedback. The grader and the source auditor already exist as calls; the skeptic and the confused classmate are new prompts on the same pattern.
4. **The process record.** A shareable record of how the essay was built: stages, timestamps, what the AI flagged, what the writer changed, and that no AI text was inserted. It answers "will I be accused of using AI" better than a detector does, and the AI-pattern check is the weakest claim the product makes today. *Depends on:* version history plus a log of AI calls per essay. The log exists in the browser (`lib/ai-activity.ts`, shown in the end comment with what each call read); it needs to move to the server to be shareable.
5. **The harness inside the assistant students already pay for.** Scholia as an MCP server or app in Claude.ai and ChatGPT: the assistant gets Scholia's tools and rules. It can grade, check quotations and attack an argument; it cannot write into the essay. The most literal "plug in your AI", and phase 3 in `docs/target.md` already names it.
6. **Teacher-authored harness settings.** An assignment's AI policy as settings: brainstorming and critique allowed, drafting off, these sources only. The student writes inside it and the process record shows it was followed. This pushes against the non-goal on teacher dashboards in `PRODUCT.md`; a settings file is not a dashboard, but the owner should decide before it is built.

## The rules

The harness's permission policy. These are the principles in `docs/target.md`, restated as rules the code enforces.

1. **Nothing reaches the page unless the writer chooses it.** The model never edits the essay on its own; every insert is a click or keystrokes by the writer.
2. **The model never writes new prose for the essay**, with the exceptions below. It names the problem, the words, and the smallest change in the writer's own words.
3. **Nothing ungrounded reaches the screen.** Every quotation is verified against the draft or the sources.
4. **The model judges; code scores.** Grades come from fixed weights and caps, never from the model's own number.
5. **Every estimate says it is one.** A grade is an estimate, not the teacher's grade. An AI check is an estimate, not proof.
6. **The key stays in the tab.**

**Resolved 2026-10-29.** The selection actions in `lib/claude.ts` no longer return rewritten text. `tighten` marks the words that can be cut and says why; `ask` answers a rewrite request with what to change, where and why. The `rewrite` field is gone from `AiResult` and from the selection card.

**Exceptions to rule 2.** These are the only places the model's own wording can go into the essay. Each is shown as a before-and-after the writer reads first, and each goes in only on the writer's click.

- **Grammar and Wrong word corrections.** The corrected version of the exact flagged words (`Issue.replacement` in `lib/claude.ts`). It must differ from the original; one that changes nothing is dropped.
- **The fix revision.** Kept by owner decision, 2026-10-29. When a suggestion card can apply its fix, `suggestFixes` (`lib/claude.ts`, called from `components/EssayFixes.tsx` with `revise: true`) returns two rewrites of the flagged passage (`options`), each taking a different approach, in the writer's academic register, with citations kept. `groundFixes` (`lib/essay-fixes.ts`) drops a rewrite that only repeats the original, duplicates the other, or quotes anything not found in the draft or the sources, and keeps at most two. They exist because some notes are only clear when the writer can see the fixed sentence. They never cover more than the flagged passage, and they are never offered on their own, only under the one-line advice that names the fix (changed 2026-11-09 from one revision after a list of steps).

The advice line ("Try…") can name the move with a short example. It is guidance, not finished prose, and falls under rule 2. Quotations from the writer's sources appear only when the writer asks for them ("Find quotes I could use"), and each is verified against its source.

Anything new that would put model wording on the page needs the same: a stated reason, a scope no larger than the flagged words, a grounding check, and an entry in this list.

## What else has to change

Done 2026-10-29, in harness milestone 1 (`docs/plan.md`):

- `PRODUCT.md` "Positioning": the harness line and the inversion.
- `lib/brand.ts`: `THESIS`, shown under the name on the landing page and in the page description.
- `docs/positioning.md`: the harness framing and who it reaches.
- `docs/plan.md`: the milestone 1 workstreams, with the stage loop next.

## How we know it works

| Metric | Why |
| --- | --- |
| Essays that reach Argue before Draft | The method is being followed, not skipped |
| Failing checks that pass on the next run | The loop produces revision, not just feedback |
| Repeat patterns that drop across a writer's essays | Memory is teaching, not just reporting |
| Writers who start a second essay within 30 days | The compounding reason to stay is real |
| Process records shared or exported | The integrity story is worth something to students |
