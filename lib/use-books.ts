"use client";
// One shared, browser-only view of the uploaded books. IndexedDB is touched only after a component subscribes.
import { useSyncExternalStore } from "react";
import { addBook, listBooks, readSections, removeBook, renameBook } from "./book-store.ts";
import type { BookMeta } from "./book-store";
import { extractFileText } from "./file-text.ts";
import { chunkSections, indexPassages } from "./sources.ts";
import type { Passage, PassageIndex, Section } from "./sources";

export type BookImport = { key: string; name: string; done: number; total: number; error?: string };
type State = { books: BookMeta[]; imports: BookImport[]; loaded: boolean; error?: string };

const EMPTY: State = { books: [], imports: [], loaded: false };
let state = EMPTY;
let started = false;
let queue = Promise.resolve();
const listeners = new Set<() => void>();
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach((listener) => listener()); };
const patchImport = (key: string, next: Partial<BookImport> | null) =>
  set({ imports: next ? state.imports.map((i) => i.key === key ? { ...i, ...next } : i) : state.imports.filter((i) => i.key !== key) });

async function refresh() {
  try { set({ books: await listBooks(), loaded: true, error: undefined }); }
  catch (e) { set({ loaded: true, error: message(e) }); }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) { started = true; void refresh(); }
  return () => { listeners.delete(listener); };
}

export const booksKey = (books: BookMeta[]) => books.map((b) => `${b.id}:${b.chars}:${b.title}`).join("|");
export const currentBooks = () => state.books;

async function importFile(key: string, file: File) {
  try {
    const { kind, sections, chars } = await extractFileText(file, (done, total) => patchImport(key, { done, total }));
    await addBook({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, "") || file.name, fileName: file.name, kind, sections: sections.length, chars, addedAt: Date.now() }, sections);
    await refresh();
    patchImport(key, null);
  } catch (e) { patchImport(key, { error: message(e) }); }
}

function add(files: File[]) {
  const entries = files.map((file) => ({ key: crypto.randomUUID(), name: file.name, done: 0, total: 0, file }));
  set({ imports: [...state.imports, ...entries.map(({ key, name, done, total }) => ({ key, name, done, total }))] });
  // One file at a time: parsing a large PDF is memory heavy.
  queue = queue.then(async () => { for (const { key, file } of entries) await importFile(key, file); });
  return queue;
}

async function change(work: Promise<void>) {
  try { await work; await refresh(); } catch (e) { set({ error: message(e) }); }
}

const sectionCache = new Map<string, { chars: number; sections: Section[] }>();
const chunkCache = new Map<string, { key: string; passages: Passage[] }>();
async function passages(): Promise<Passage[]> {
  const out: Passage[] = [];
  for (const book of state.books) {
    const key = `${book.chars}:${book.title}`;
    let chunks = chunkCache.get(book.id);
    if (chunks?.key !== key) {
      let cached = sectionCache.get(book.id);
      if (cached?.chars !== book.chars) sectionCache.set(book.id, cached = { chars: book.chars, sections: await readSections(book.id) });
      chunkCache.set(book.id, chunks = { key, passages: chunkSections(book.id, book.title, cached.sections) });
    }
    out.push(...chunks.passages);
  }
  return out;
}

let indexCache: { key: string; index: Promise<PassageIndex> } | null = null;
function bookIndex(): Promise<PassageIndex> {
  const key = booksKey(state.books);
  if (indexCache?.key !== key) {
    const index = passages().then(indexPassages);
    indexCache = { key, index };
    index.catch(() => { if (indexCache?.index === index) indexCache = null; });
  }
  return indexCache.index;
}

const actions = {
  add,
  remove: (id: string) => change(removeBook(id).then(() => { sectionCache.delete(id); chunkCache.delete(id); })),
  rename: (id: string, title: string) => change(renameBook(id, title)),
  dismissImport: (key: string) => patchImport(key, null),
  passages,
  bookIndex,
};

export function useBooks() {
  const { books, imports, error } = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  return { books, imports, error, ...actions };
}
