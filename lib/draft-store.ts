// Drafts and version history live in this browser's IndexedDB, so everyone who opens a shared
// deployment keeps their own private essay. Nothing here is sent to the server.
import { EMPTY_ESSAY_SETTINGS } from "./essay-document";
import type { EssaySettings } from "./essay-document";

type Draft = { html: string; text: string; brief: string; settings: EssaySettings; updatedAt: number; revision: string };
export type Version = Omit<Draft, "revision"> & { id: string };
export type VersionInfo = { id: string; savedAt: number; words: number };

const EMPTY: Draft = { html: "", text: "", brief: "", settings: EMPTY_ESSAY_SETTINGS, updatedAt: 0, revision: "" };
const list = (history: Version[]): VersionInfo[] => history.slice().reverse().map((v) => ({ id: v.id, savedAt: v.updatedAt, words: v.text.trim() ? v.text.trim().split(/\s+/).length : 0 }));
const request = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("essay-editor", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("essay");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// One transaction per call: the revision check and both writes commit together, even across tabs.
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    const tx = db.transaction("essay", mode);
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
    const result = await work(tx.objectStore("essay"));
    await done;
    return result;
  } finally { db.close(); }
}

export async function readDraft() {
  try {
    return await transact("readonly", async (store) => {
      const draft = (await request(store.get("draft")) as Draft | undefined) ?? EMPTY;
      const history = (await request(store.get("history")) as Version[] | undefined) ?? [];
      return { ...draft, versions: list(history) };
    });
  } catch { throw new Error("Could not open this browser's saved essay. Private browsing or blocked site data can prevent saving."); }
}

export async function readVersion(id: string): Promise<Version> {
  const history = await transact("readonly", async (store) => (await request(store.get("history")) as Version[] | undefined) ?? []);
  const version = history.find((v) => v.id === id);
  if (!version) throw new Error("Version not found.");
  return version;
}

export async function writeDraft(input: { html: string; text: string; brief: string; settings: EssaySettings; expectedRevision: string; checkpoint?: boolean }) {
  let conflict = false;
  try {
    const saved = await transact("readwrite", async (store) => {
      const current = (await request(store.get("draft")) as Draft | undefined) ?? EMPTY;
      if (input.expectedRevision !== current.revision) { conflict = true; return null; }
      const next: Draft = { html: input.html, text: input.text, brief: input.brief, settings: input.settings, updatedAt: Date.now(), revision: crypto.randomUUID() };
      const history = (await request(store.get("history")) as Version[] | undefined) ?? [];
      const { revision: _, ...version } = next;
      if (input.checkpoint || !history.length || next.updatedAt - history[history.length - 1].updatedAt >= 60000) history.push({ ...version, id: crypto.randomUUID() });
      const kept = history.slice(-100);
      store.put(kept, "history");
      store.put(next, "draft");
      return { savedAt: next.updatedAt, revision: next.revision, versions: list(kept) };
    });
    if (saved) return saved;
  } catch { throw new Error("Could not save the essay in this browser. Download your draft to keep a copy."); }
  if (conflict) throw new Error("This essay was saved in another tab. Download your current draft before reloading to compare versions.");
  throw new Error("Could not save the essay.");
}
