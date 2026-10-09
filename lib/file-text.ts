// Text extraction for prompt and source files, entirely in the browser. Heavy parsers load only when needed.
import type { Section } from "./sources";

export const ACCEPT_PROMPT = ".txt,.md,.markdown,.pdf,.docx";
export const ACCEPT_SOURCES = ".txt,.md,.markdown,.pdf,.docx,.epub";
export type FileKind = "txt" | "md" | "pdf" | "docx" | "epub";
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
export const MAX_TEXT_CHARS = 4_000_000;

const KINDS: Record<string, FileKind> = { txt: "txt", md: "md", markdown: "md", pdf: "pdf", docx: "docx", epub: "epub" };
export const fileKind = (name: string): FileKind | null => KINDS[name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""] ?? null;

export function stripMarkdown(md: string): string {
  return md.replace(/\r\n?/g, "\n")
    .replace(/^\uFEFF?---\n[\s\S]*?\n---(?:\n|$)/, "")
    .replace(/^[ \t]*(?:```|~~~).*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(?<![\w*])\*(?!\s)(.+?)\*(?![\w*])|(?<!\w)_(?!\s)(.+?)_(?!\w)/g, "$1$2");
}

/** One section per paragraph, so every quote is cited by the paragraph it comes from. */
export function splitParagraphSections(text: string): Section[] {
  const t = text.replace(/\r\n?/g, "\n");
  let paragraphs = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) paragraphs = t.split("\n").map((p) => p.trim()).filter(Boolean);
  return paragraphs.map((p, i) => ({ location: `para. ${i + 1}`, text: p }));
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
const resolvePath = (path: string) => path.split("/").reduce<string[]>((out, part) => (part === ".." ? out.pop() : part && part !== "." && out.push(part), out), []).join("/");

/** Reading order of an EPUB's (x)html files, resolved to zip paths. */
export function epubSpine(containerXml: string, opfXml: string): { opfPath: string; hrefs: string[] } {
  const opfPath = [...containerXml.matchAll(/<(?:\w+:)?rootfile\b[^>]*>/gi)].map((m) => attr(m[0], "full-path")).find(Boolean) ?? "";
  const dir = opfPath.slice(0, opfPath.lastIndexOf("/") + 1);
  const manifest = new Map<string, string>();
  for (const [tag] of opfXml.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)) {
    const id = attr(tag, "id"), href = attr(tag, "href"), type = attr(tag, "media-type") ?? "";
    if (!id || !href || !(/html/i.test(type) || /\.x?html?(?:#|$)/i.test(href))) continue;
    let path = href.split("#")[0];
    try { path = decodeURIComponent(path); } catch {}
    manifest.set(id, resolvePath(dir + path));
  }
  const hrefs = [...opfXml.matchAll(/<(?:\w+:)?itemref\b[^>]*>/gi)].flatMap(([tag]) => manifest.get(attr(tag, "idref") ?? "") ?? []);
  return { opfPath, hrefs };
}

async function epubSections(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<Section[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const container = await zip.file("META-INF/container.xml")?.async("string") ?? "";
  const { opfPath } = epubSpine(container, "");
  const opf = opfPath ? await zip.file(opfPath)?.async("string") ?? "" : "";
  const { hrefs } = epubSpine(container, opf);
  const sections: Section[] = [];
  for (const [i, href] of hrefs.entries()) {
    const html = await zip.file(href)?.async("string");
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script, style").forEach((e) => e.remove());
      doc.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, br, tr").forEach((e) => e.after("\n\n"));
      const text = (doc.body?.textContent ?? "").replace(/[ \t ]+/g, " ").replace(/\s*\n\s*\n\s*/g, "\n\n").trim();
      if (text) sections.push({ location: `ch. ${sections.length + 1}`, text });
    }
    onProgress?.(i + 1, hrefs.length);
  }
  return sections;
}

export async function extractFileText(file: File, onProgress?: (done: number, total: number) => void): Promise<{ kind: FileKind; sections: Section[]; chars: number; truncated: boolean }> {
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is larger than 60 MB.");
  const kind = fileKind(file.name);
  if (!kind) throw new Error("Use a .txt, .md, .pdf, .docx or .epub file.");
  let sections: Section[];
  if (kind === "txt" || kind === "md") {
    const text = await file.text();
    sections = splitParagraphSections(kind === "md" ? stripMarkdown(text) : text);
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    sections = splitParagraphSections((await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value);
  } else if (kind === "epub") sections = await epubSections(await file.arrayBuffer(), onProgress);
  else sections = await (await import("./pdf-text.ts")).pdfSections(await file.arrayBuffer(), onProgress);
  const kept: Section[] = [];
  let chars = 0, truncated = false;
  for (const { location, text: raw } of sections) {
    const text = raw.trim();
    if (!text) continue;
    if (chars + text.length > MAX_TEXT_CHARS) {
      truncated = true;
      if (MAX_TEXT_CHARS > chars) { kept.push({ location, text: text.slice(0, MAX_TEXT_CHARS - chars) }); chars = MAX_TEXT_CHARS; }
      break;
    }
    kept.push({ location, text });
    chars += text.length;
  }
  if (!kept.length) throw new Error("No text found in this file. Scanned PDFs need OCR first.");
  return { kind, sections: kept, chars, truncated };
}
