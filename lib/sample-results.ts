// SAMPLE FIXTURE. What a check of lib/sample-essay.ts produces, written by hand so the landing page and /sample are instant and never
// call the AI. Every quote is an exact substring of the sample and every flaw is one listed at the top of sample-essay.ts;
// scripts/check_sample.cjs holds it to that. The trait levels are a judgment; percent and letter come from computeGrade so this
// card cannot disagree with the real scale.
import { computeGrade, LEVEL_NAMES, TRAITS } from "./essay-grade.ts";
import type { Grade, TraitKey } from "./essay-grade.ts";
import type { EssayIssue } from "./essay-issues.ts";

/** In the order a reader meets them. paragraphId indexes SAMPLE_ESSAY_PARAGRAPHS. */
export const SAMPLE_ISSUES: EssayIssue[] = [
  { paragraphId: 0, category: "Analysis", quote: "both Victor and the creature are responsible in different ways, and that the novel is really about how society treats people who are different",
    note: "Two claims, and neither takes the side the prompt asks for. Choose Victor or the creature and say why that one bears more of the blame." },
  { paragraphId: 1, category: "Use of evidence", quote: "This quote is very important and shows the creature's feelings about Victor.",
    note: "Calling the quotation important is not analysis. Say what 'fallen angel' and 'for no misdeed' claim about what Victor owed the creature." },
  { paragraphId: 2, category: "Grammar", quote: "the creature has stopped asking for sympathy, he is making threats", replacement: "the creature has stopped asking for sympathy; he is making threats",
    note: "Two complete sentences joined by a comma. A semicolon after 'sympathy' keeps the turn from pleading to threatening in one line." },
  { paragraphId: 2, category: "Analysis", quote: "Society has always rejected what it does not understand",
    note: "'Always' claims all of history, and nothing here supports it. Say what the novel shows: the De Laceys drive him out before he can speak." },
  { paragraphId: 2, category: "Wrong word", quote: "His crimes effected everyone around Victor", replacement: "His crimes affected everyone around Victor",
    note: "'Effected' means brought about. The crimes changed the people around Victor, so the word is 'affected'." },
  { paragraphId: 2, category: "Analysis", quote: "which proves that the creature had become a monster",
    note: "A list of crimes does not prove he had become a monster; his own speech in chapter 10 says he was driven to them. Say which reading you hold and why." },
  { paragraphId: 3, category: "Structure", quote: "It is also interesting that Mary Shelley wrote the novel when she was only eighteen",
    note: "This paragraph is about Shelley's life and AI, not about who is to blame. Cut it, or end it with one sentence that ties her lost mother to Victor's abandonment." },
  { paragraphId: 4, category: "Structure", quote: "In conclusion, Victor is responsible for abandoning his creation and the creature is responsible for the murders he commits. The novel shows that both of them are to blame.",
    note: "This repeats the introduction. End on what your position means: if Victor bears more blame, say what the novel asks of anyone who creates." },
];

/** Rubric levels, 0-4, one per trait; the only numbers a grader would argue with. */
export const SAMPLE_LEVELS: Record<TraitKey, number> = { prompt: 2, thesis: 2, evidence: 2, organization: 2, sophistication: 1, language: 3 };

const DETAIL: Record<TraitKey, { evidence: string[]; strengths: string; weaknesses: string }> = {
  prompt: { evidence: ["both Victor and the creature are responsible in different ways"],
    strengths: "Three quotations from the novel, each cited by chapter, as the prompt asks.",
    weaknesses: "The prompt asks who bears the greater responsibility; the essay says both, and at 442 words it is short of the 600-word minimum." },
  thesis: { evidence: ["both Victor and the creature are responsible in different ways", "the novel is really about how society treats people who are different"],
    strengths: "The claim is stated in one place, at the end of the introduction.",
    weaknesses: "Two claims at once, and 'both are responsible' takes no side, so nothing in the body has to be proved." },
  evidence: { evidence: ["for the sole purpose of infusing life into an inanimate body", "This quote is very important and shows the creature's feelings about Victor."],
    strengths: "The chapter 5 quotation is tied to a specific claim: Victor abandons what he spent two years making.",
    weaknesses: "The chapter 10 quotation is called important instead of explained, and the chapter 20 line gets one sentence." },
  organization: { evidence: ["It is also interesting that Mary Shelley wrote the novel when she was only eighteen", "The novel shows that both of them are to blame."],
    strengths: "One paragraph on Victor, one on the creature, in the order the thesis names them.",
    weaknesses: "The fourth paragraph leaves the question of blame for biography and AI, and the conclusion repeats the introduction." },
  sophistication: { evidence: ["Society has always rejected what it does not understand", "The creature is not innocent either."],
    strengths: "'The creature is not innocent either' opens the other side of the case.",
    weaknesses: "'Society has always rejected what it does not understand' stands in for the harder question of whether rejection excuses murder." },
  language: { evidence: ["stopped asking for sympathy, he is making threats", "His crimes effected everyone around Victor"],
    strengths: "Sentences are clear, and the quotations are punctuated and cited correctly.",
    weaknesses: "A comma joins two sentences in paragraph three, and 'effected' should be 'affected'." },
};

export const SAMPLE_GRADE: Grade = {
  ...computeGrade(SAMPLE_LEVELS, true),
  promptScored: true,
  thesis: "In this essay I will show that both Victor and the creature are responsible in different ways, and that the novel is really about how society treats people who are different.",
  traits: TRAITS.map((t) => ({ key: t.key, name: t.name, weight: t.weight, level: SAMPLE_LEVELS[t.key], label: LEVEL_NAMES[SAMPLE_LEVELS[t.key]], ...DETAIL[t.key] })),
  requirements: [
    { requirement: "600–800 words", evidence: "", status: "missed", note: "442 words, 158 short of the minimum." },
    { requirement: "Argue who bears the greater moral responsibility: Victor or the creature", evidence: "both Victor and the creature are responsible in different ways", status: "partial", note: "Names both instead of choosing one." },
    { requirement: "Take a clear position", evidence: "", status: "missed", note: "'Both are responsible in different ways' is not a position." },
    { requirement: "At least three quotations from the novel", evidence: "Beware; for I am fearless, and therefore powerful", status: "met", note: "" },
    { requirement: "Each quotation cited by chapter", evidence: "(Shelley ch. 10)", status: "met", note: "" },
    { requirement: "Explain how each quotation supports the claim", evidence: "This quote is very important and shows the creature's feelings about Victor.", status: "partial", note: "The chapter 10 quotation is labelled important, not explained." },
    { requirement: "MLA format", evidence: "", status: "partial", note: "In-text citations follow MLA; there is no Works Cited entry." },
  ],
  nextSteps: [
    { trait: "thesis", step: "Pick a side. Replace 'both Victor and the creature are responsible in different ways' with a claim that Victor bears more blame, or that the creature does." },
    { trait: "evidence", step: "Replace 'This quote is very important and shows the creature's feelings about Victor' with what 'fallen angel' and 'for no misdeed' say Victor owed him." },
    { trait: "organization", step: "Cut the paragraph on Shelley's life and AI; spend those words weighing 'the creature is not innocent either' against Victor's abandonment." },
  ],
};

/** A paragraph as plain runs and underlined runs, in order, so static pages can draw the editor's marks without the Highlight API. `issue` indexes the array passed in. */
export function markSegments(paragraph: string, issues: readonly EssayIssue[]): { text: string; issue?: number }[] {
  const hits = issues.map((s, issue) => ({ at: paragraph.indexOf(s.quote), end: paragraph.indexOf(s.quote) + s.quote.length, issue })).filter((h) => h.at >= 0).sort((a, b) => a.at - b.at);
  const out: { text: string; issue?: number }[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.at < pos) continue; // overlapping quotes: the first one wins, the test forbids them anyway
    if (h.at > pos) out.push({ text: paragraph.slice(pos, h.at) });
    out.push({ text: paragraph.slice(h.at, h.end), issue: h.issue });
    pos = h.end;
  }
  if (pos < paragraph.length) out.push({ text: paragraph.slice(pos) });
  return out;
}
