export const ESSAY_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th";
export function essayParagraphs(root: HTMLElement): HTMLElement[] {
  const blocks = [...root.querySelectorAll<HTMLElement>(ESSAY_BLOCKS)].filter((p) => !p.querySelector(ESSAY_BLOCKS) && p.innerText.trim());
  // Typing after Select All/Delete can produce plain text directly in the editor.
  return blocks.length ? blocks : root.innerText.trim() ? [root] : [];
}
/**
 * Which body paragraph each block belongs to, as the index of the block that starts it (-1 = heading, title, Works Cited).
 * A body paragraph starts at a first-line indent; block quotes and unindented continuations after it stay part of it.
 * Without any indents in the document, a block of two or more sentences starts a paragraph.
 */
export function bodyParagraphOf(blocks: HTMLElement[]): number[] {
  const info = blocks.map((el) => {
    const style = getComputedStyle(el), text = el.innerText.trim();
    return { text, centered: style.textAlign === "center", indented: parseFloat(style.textIndent) > 0 || /^\t/.test(el.innerText) };
  });
  const indents = info.some((b) => b.indented && !b.centered);
  const sentences = (t: string) => t.split(/[.!?]+["”’)]*\s+(?=["“‘(]?[A-Z])/).filter((s) => s.trim().split(/\s+/).length >= 3).length;
  const starts = (b: (typeof info)[number]) => !b.centered && (indents ? b.indented : sentences(b.text) >= 2);
  let current = -1, ended = false;
  return info.map((b, i) => {
    if (ended || /^(works cited|references|bibliography)\b/i.test(b.text)) { ended = true; return -1; }
    if (starts(b)) current = i;
    else if (b.centered) current = -1;
    return current;
  });
}
/** 1-based body paragraph number for block i, as the outline's P{n}; 0 for a heading, title or Works Cited. */
export const bodyParagraphNumber = (of: number[], i: number) => of[i] < 0 ? 0 : of.filter((start, j) => start === j && j <= of[i]).length;
/** Focus decoration belongs to the workspace, never the saved document. */
export function documentHtml(root: HTMLElement | null): string {
  if (!root) return "";
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-essay-focus]").forEach((p) => p.removeAttribute("data-essay-focus"));
  return copy.innerHTML;
}
export type EssaySettings = import("zod").infer<typeof import("./essay-workflow").EssaySettingsSchema>;
/** The saved schema takes a whole number 0–100000; anything else would make every autosave fail. */
export const clampWords = (n: unknown) => Math.min(100000, Math.max(0, Math.round(Number(n)) || 0));
export const EMPTY_ESSAY_SETTINGS: EssaySettings = { targetWords: 0, checklist: {}, notes: [], sources: "", includeAntigone: true, tasks: [], thesis: "", profile: { kind: "", course: "", citation: "", instructions: "" } };

/** Locate a unique exact passage across formatting spans without changing the document. */
export function passageRange(scope: HTMLElement, quote: string): Range | null {
  if (!quote.trim()) return null;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let full = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) { nodes.push(node as Text); full += node.textContent ?? ""; }
  const start = full.indexOf(quote), end = start + quote.length;
  if (start < 0 || full.indexOf(quote, start + 1) >= 0) return null;
  const range = document.createRange();
  let offset = 0;
  for (const node of nodes) {
    const next = offset + node.length;
    if (start >= offset && start < next) range.setStart(node, start - offset);
    if (end > offset && end <= next) { range.setEnd(node, end - offset); return range; }
    offset = next;
  }
  return null;
}
export const essaySlug = (text: string) => (text.split("\n").find((l) => l.trim()) ?? "").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/^-+|-+$/g, "") || "essay";
export function downloadEssay(root: HTMLElement, format: "html" | "text") {
  const content = format === "text" ? root.innerText : `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Essay</title><style>body{max-width:6.5in;margin:1in auto;font:12pt "Times New Roman",serif;line-height:2}p{margin:0 0 1em}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}</style></head><body>${documentHtml(root)}</body></html>`;
  const url = URL.createObjectURL(new Blob([content], { type: format === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${essaySlug(root.innerText)}.${format === "html" ? "html" : "txt"}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
