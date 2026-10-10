// Uploaded books and readings live in this browser's IndexedDB, separate from the essay draft. Nothing is sent to the server.
import { splitParagraphGroups } from "./file-text.ts";
import type { FileKind } from "./file-text";
import type { Section } from "./sources";

/** `truncated`: the text ran past MAX_TEXT_CHARS and only its start was kept. Books saved before this field lack it. */
export type BookMeta = { id: string; title: string; fileName: string; kind: FileKind; sections: number; chars: number; addedAt: number; truncated?: boolean };
export const MAX_BOOKS = 12;
const STORAGE_ERROR = "Could not save this source in the browser. Private browsing or full storage can block it.";
const LIMIT_ERROR = `You can keep up to ${MAX_BOOKS} sources. Remove one first.`;

const request = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("essay-editor-sources", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("books", { keyPath: "id" }); r.result.createObjectStore("text"); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// One transaction per call, so a book's metadata and text are written or removed together.
async function transact<T>(mode: IDBTransactionMode, work: (books: IDBObjectStore, text: IDBObjectStore) => Promise<T>): Promise<T> {
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    const tx = db.transaction(["books", "text"], mode);
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
    const result = await work(tx.objectStore("books"), tx.objectStore("text"));
    await done;
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === LIMIT_ERROR) throw error;
    throw new Error(STORAGE_ERROR);
  } finally { db?.close(); }
}

export const listBooks = () => transact("readonly", async (books) => ((await request(books.getAll())) as BookMeta[]).sort((a, b) => a.addedAt - b.addedAt));

export const addBook = (meta: BookMeta, sections: Section[]) => transact("readwrite", async (books, text) => {
  if (await request(books.count()) >= MAX_BOOKS) throw new Error(LIMIT_ERROR);
  books.put(meta);
  text.put(sections, meta.id);
});

export const renameBook = (id: string, title: string) => transact("readwrite", async (books) => {
  const meta = await request(books.get(id)) as BookMeta | undefined;
  if (meta) books.put({ ...meta, title });
});

export const removeBook = (id: string) => transact("readwrite", async (books, text) => { books.delete(id); text.delete(id); });

export async function readSections(id: string): Promise<Section[]> {
  const stored = await transact("readonly", async (_, text) => (await request(text.get(id)) as Section[] | undefined) ?? []);
  const sections = splitParagraphGroups(stored);
  // Save a split legacy book once so its paragraph count is right. If that fails, the next read splits it again.
  if (sections.length !== stored.length) await transact("readwrite", async (books, text) => {
    const meta = await request(books.get(id)) as BookMeta | undefined;
    if (meta) { books.put({ ...meta, sections: sections.length }); text.put(sections, id); }
  }).catch(() => {});
  return sections;
}
