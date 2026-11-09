// Turns a folder of labelled essays into the detector's features, using the same code the app runs (lib/ai-detector.ts).
// Usage: node --experimental-strip-types scripts/ai-detector/features.ts <ghostbuster essay dir> <out.jsonl> [extra dir label ...]
// Each output line is one essay: its label, split and source, and per sentence the n-gram counts, window and window style features.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitSentences } from "../../lib/ai-check.ts";
import { docNumeric, sentenceCounts, sentenceNgrams, windowNumeric, windowOf } from "../../lib/ai-detector.ts";

const [root, out, ...extra] = process.argv.slice(2);
const SOURCES: [string, 0 | 1][] = [["human", 0], ["gpt", 1], ["claude", 1], ["gpt_prompt1", 1], ["gpt_prompt2", 1], ["gpt_writing", 1], ["gpt_semantic", 1]];

/** Plain-text essay to paragraphs: one per line, stopping at the reference list. */
function textParagraphs(text: string): string[] {
  const lines = text.split(/\n+/).map((l) => l.trim());
  const end = lines.findIndex((l) => /^(references|works cited|bibliography|reference list)\s*:?$/i.test(l));
  return (end < 0 ? lines : lines.slice(0, end)).filter((l) => l && !/^(prompt|title|essay)\s*:/i.test(l));
}

// Split by prompt, so a human essay and the AI essays written to the same prompt always land together.
const split = (n: number) => { const h = (n * 2654435761) % 2 ** 32 % 20; return h < 14 ? "train" : h < 17 ? "val" : "test"; };

const lines: string[] = [];
const files: { path: string; label: 0 | 1; source: string; group: number }[] = [];
for (const [source, label] of SOURCES) {
  for (const name of readdirSync(join(root, source))) {
    const group = parseInt(name, 10);
    if (Number.isFinite(group)) files.push({ path: join(root, source, name), label, source, group: source === "claude" ? 100000 + group : group });
  }
}
for (let i = 0; i < extra.length; i += 2) {
  for (const name of readdirSync(extra[i])) files.push({ path: join(extra[i], name), label: Number(extra[i + 1]) as 0 | 1, source: `probe-${extra[i + 1]}`, group: -1 });
}

let skipped = 0;
for (const f of files) {
  const text = readFileSync(f.path, "utf8");
  if (/^\s*(of course|sure|certainly)[,!]/i.test(text)) { skipped++; continue; } // a chat preamble, not an essay
  const sentences = splitSentences(textParagraphs(text));
  if (sentences.length < 5) { skipped++; continue; }
  const counts = sentences.map((s) => sentenceCounts(s.text));
  lines.push(JSON.stringify({
    id: f.path.split("/").slice(-2).join("/"), label: f.label, source: f.source, split: f.group < 0 ? "probe" : split(f.group),
    doc: docNumeric(sentences, counts, []),
    sentences: sentences.map((s, i) => {
      const window = windowOf(sentences, i);
      return { win: window, tokens: window.reduce((n, j) => n + counts[j].tokens, 0), num: windowNumeric(counts, window, i), grams: Object.fromEntries(sentenceNgrams(s.text)) };
    }),
  }));
}
writeFileSync(out, lines.join("\n") + "\n");
console.log(`${lines.length} essays written, ${skipped} skipped`);
