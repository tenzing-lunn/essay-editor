// Uploaded books and readings are stored in the signed-in account (all of its essays share them), separate from essay drafts.
import type { FileKind } from "./file-text";
import type { Section } from "./sources";

export type BookMeta = { id: string; title: string; fileName: string; kind: FileKind; sections: number; chars: number; addedAt: number };
export const MAX_BOOKS = 12;
const STORAGE_ERROR = "Could not save this source to your account. Check your connection and try again.";
const LOAD_ERROR = "Could not load your sources. Check your connection and try again.";
const LIMIT_ERROR = `You can keep up to ${MAX_BOOKS} sources. Remove one first.`;
// Vercel rejects request bodies over 4.5 MB. A piece of PIECE_CHARS is at most 6 bytes a character once JSON-escaped, so it always fits a batch.
const BATCH_BYTES = 3_000_000;
const PIECE_CHARS = 400_000;

type Part = Section & { continued?: true };
type Page = { sections: Section[]; next: { position: number; offset: number } | null };

// Errors carry the server's message; a missing book resolves through `missing`, as IndexedDB treated absent keys.
async function call<T>(path: string, init: { method?: string; body?: unknown } | undefined, fallback: string, missing?: () => T): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: init?.method ?? "GET", cache: "no-store", credentials: "same-origin",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch { throw new Error(fallback); }
  const data = await r.json().catch(() => ({}));
  if (r.ok) return data as T;
  if (data.code === "limit") throw new Error(LIMIT_ERROR);
  if (data.code === "not_found" && missing) return missing();
  throw new Error(typeof data.error === "string" ? data.error : fallback);
}

// Long sections are split into pieces; a piece with continued: true is appended to the section before it on the server.
function batches(sections: Section[]): Part[][] {
  const encoder = new TextEncoder();
  const out: Part[][] = [[]];
  let size = 0;
  for (const { location, text } of sections) {
    let i = 0;
    do {
      let end = Math.min(text.length, i + PIECE_CHARS);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--; // keep surrogate pairs together
      const part: Part = i ? { location, text: text.slice(i, end), continued: true } : { location, text: text.slice(i, end) };
      const bytes = encoder.encode(JSON.stringify(part)).length + 1;
      if (size + bytes > BATCH_BYTES && out[out.length - 1].length) { out.push([]); size = 0; }
      out[out.length - 1].push(part);
      size += bytes;
      i = end;
    } while (i < text.length);
  }
  return out;
}

export const listBooks = () => call<{ books: BookMeta[] }>("/api/books", undefined, LOAD_ERROR).then((d) => d.books);

export async function addBook(meta: BookMeta, sections: Section[]) {
  const [first, ...rest] = batches(sections);
  const { book } = await call<{ book: BookMeta }>("/api/books", { method: "POST", body: { title: meta.title, fileName: meta.fileName, kind: meta.kind, parts: first, done: !rest.length } }, STORAGE_ERROR);
  const count = (parts: Part[]) => parts.filter((p) => !p.continued).length;
  try {
    let start = count(first);
    for (const [i, parts] of rest.entries()) {
      await call(`/api/books/${encodeURIComponent(book.id)}/sections`, { method: "POST", body: { start, parts, done: i === rest.length - 1 } }, STORAGE_ERROR);
      start += count(parts);
    }
  } catch (e) {
    void call(`/api/books/${encodeURIComponent(book.id)}`, { method: "DELETE" }, STORAGE_ERROR).catch(() => {}); // the server also purges abandoned uploads after a day
    throw e;
  }
}

export const renameBook = (id: string, title: string) =>
  call(`/api/books/${encodeURIComponent(id)}`, { method: "PATCH", body: { title } }, STORAGE_ERROR, () => null).then(() => {});

export const removeBook = (id: string) =>
  call(`/api/books/${encodeURIComponent(id)}`, { method: "DELETE" }, STORAGE_ERROR, () => null).then(() => {});

export async function readSections(id: string): Promise<Section[]> {
  const out: Section[] = [];
  let cursor = { position: 0, offset: 0 };
  for (;;) {
    const page = await call<Page | null>(`/api/books/${encodeURIComponent(id)}/sections?position=${cursor.position}&offset=${cursor.offset}`, undefined, LOAD_ERROR, () => null);
    if (!page) return [];
    page.sections.forEach((s, i) => { if (i === 0 && cursor.offset > 0 && out.length) out[out.length - 1].text += s.text; else out.push(s); });
    if (!page.next) return out;
    cursor = page.next;
  }
}
