export const ESSAY_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th";
export function essayParagraphs(root: HTMLElement): HTMLElement[] {
  const blocks = [...root.querySelectorAll<HTMLElement>(ESSAY_BLOCKS)].filter((p) => !p.querySelector(ESSAY_BLOCKS) && p.innerText.trim());
  // Typing after Select All/Delete can produce plain text directly in the editor.
  return blocks.length ? blocks : root.innerText.trim() ? [root] : [];
}
/** Focus decoration belongs to the workspace, never the saved document. */
export function documentHtml(root: HTMLElement | null): string {
  if (!root) return "";
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-essay-focus]").forEach((p) => p.removeAttribute("data-essay-focus"));
  return copy.innerHTML;
}
export type EssaySettings = import("zod").infer<typeof import("./essay-workflow").EssaySettingsSchema>;
export const EMPTY_ESSAY_SETTINGS: EssaySettings = { targetWords: 0, checklist: {}, notes: [], sources: "", includeAntigone: true, tasks: [] };

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
export function downloadEssay(root: HTMLElement, format: "html" | "text") {
  const content = format === "text" ? root.innerText : `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Essay</title><style>body{max-width:6.5in;margin:1in auto;font:12pt "Times New Roman",serif;line-height:2}p{margin:0 0 1em}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}</style></head><body>${documentHtml(root)}</body></html>`;
  const url = URL.createObjectURL(new Blob([content], { type: format === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `essay.${format === "html" ? "html" : "txt"}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
