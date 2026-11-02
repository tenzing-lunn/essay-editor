// Browser only. The worker and character maps are served from this origin (scripts/copy-pdf-worker.cjs).
// pdf.js 6 never evaluates generated code, so it runs under a CSP without 'unsafe-eval'.
import type { Section } from "./sources";

// Citations need the page number printed in the book's running header or footer ("11", "Chapter 1 | 11", "44 | Title"), not the PDF's page index.
const PRINTED = /^(\d{1,4})(?:\s*\|.*)?$|^.*\|\s*(\d{1,4})$/;
const printedPage = (strings: string[]) => {
  for (const s of [strings[0], strings[strings.length - 1]]) { const m = s?.match(PRINTED); if (m) return m[1] ?? m[2]; }
};

export async function pdfSections(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<Section[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true });
  try {
    const doc = await task.promise;
    const sections: Section[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const printed = printedPage(content.items.flatMap((item) => "str" in item && item.str.trim() ? [item.str.trim()] : []));
      sections.push({ location: printed ? `p. ${printed}` : `PDF p. ${i}`, text: content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") });
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
    return sections;
  } finally { await task.destroy(); }
}
