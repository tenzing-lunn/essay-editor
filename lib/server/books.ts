// Uploaded books, per account. Vercel caps request and response bodies at 4.5 MB, so books go up in batches and come down in pages.
import { z } from "zod";
import type { BookMeta } from "../book-store";
import { MAX_BOOKS } from "../book-store";
import type { Section } from "../sources";
import { ms, sql, transaction } from "./db";
import type { Sql } from "./db";
import { fail, invalid, isUuid, noNul, notFound } from "./http";

const MAX_CHARS = 4_000_000; // lib/file-text.ts MAX_TEXT_CHARS
const PAGE_CHARS = 1_000_000; // at most ~3 MB of UTF-8 JSON per response
const MAX_SECTIONS = 50_000; // txt, md and docx get one section per paragraph, so a long book of short paragraphs needs many
const MAX_UPLOADING = 2; // unfinished uploads per account, on top of MAX_BOOKS complete ones
const META = `id, title, file_name AS "fileName", kind, sections, chars, ${ms("added_at", "addedAt")}`;

const Part = z.object({ location: z.string().max(100).overwrite(noNul), text: z.string().max(MAX_CHARS).overwrite(noNul), continued: z.boolean().optional() });
const Parts = z.array(Part).max(100_000);
export const AppendSchema = z.object({ start: z.number().int().min(0), parts: Parts, done: z.boolean() });
export const CreateSchema = z.object({
  title: z.string().overwrite(noNul).trim().min(1, "Give the source a title.").max(300, "Keep the title under 301 characters."),
  fileName: z.string().max(300).overwrite(noNul),
  kind: z.enum(["txt", "md", "pdf", "docx", "epub"], "Use a .txt, .md, .pdf, .docx or .epub file."),
  parts: Parts, done: z.boolean(),
});
export const RenameSchema = z.object({ title: CreateSchema.shape.title });
const LIMIT = () => fail(409, `You can keep up to ${MAX_BOOKS} sources. Remove one first.`, "limit");
const ownedId = (id: string) => { if (!isUuid(id)) throw notFound("source"); return id; };

const purgeAbandoned = (q: Sql, userId: string) => q(`DELETE FROM books WHERE user_id = $1 AND NOT complete AND added_at < now() - interval '1 day'`, [userId]);

export async function listBooks(userId: string): Promise<BookMeta[]> {
  await purgeAbandoned(sql, userId);
  return sql<BookMeta>(`SELECT ${META} FROM books WHERE user_id = $1 AND complete ORDER BY added_at, id`, [userId]);
}

/** Creates an incomplete book holding the first batch; done: true completes it at once. */
export function createBook(userId: string, input: z.infer<typeof CreateSchema>): Promise<BookMeta> {
  return transaction(async (q) => {
    // NO KEY UPDATE still serializes this account's limit checks, but doesn't block inserts that reference the user (sessions, essays).
    await q(`SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE`, [userId]);
    await purgeAbandoned(q, userId);
    const [{ complete, uploading }] = await q<{ complete: number; uploading: number }>(
      `SELECT count(*) FILTER (WHERE complete)::int AS complete, count(*) FILTER (WHERE NOT complete)::int AS uploading FROM books WHERE user_id = $1`, [userId]);
    if (complete >= MAX_BOOKS) throw LIMIT();
    if (uploading >= MAX_UPLOADING) throw fail(409, "Other sources are still uploading. Wait for them to finish, then try again.", "invalid");
    const [{ id }] = await q<{ id: string }>(`INSERT INTO books (user_id, title, file_name, kind) VALUES ($1, $2, $3, $4) RETURNING id`, [userId, input.title, input.fileName, input.kind]);
    return append(q, userId, id, { start: 0, parts: input.parts, done: input.done });
  });
}

export function appendSections(userId: string, id: string, input: z.infer<typeof AppendSchema>): Promise<BookMeta> {
  ownedId(id);
  return transaction(async (q) => {
    await q(`SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE`, [userId]);
    return append(q, userId, id, input);
  });
}

// A part with continued: true extends the previous section, so one long chapter can span batches.
async function append(q: Sql, userId: string, id: string, { start, parts, done }: z.infer<typeof AppendSchema>): Promise<BookMeta> {
  const [book] = await q<{ sections: number; chars: number; complete: boolean }>(`SELECT sections, chars, complete FROM books WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]);
  if (!book) throw notFound("source");
  if (book.complete) throw fail(409, "This source has already been uploaded.", "invalid");
  if (start !== book.sections) throw fail(409, "The upload arrived out of order. Try adding the source again.", "invalid");
  const rows: Section[] = [];
  let extra = "";
  for (const part of parts) {
    if (!part.continued) rows.push({ location: part.location, text: part.text });
    else if (rows.length) rows[rows.length - 1].text += part.text;
    else if (book.sections) extra += part.text;
    else throw invalid("The first part of a source can't continue another section.");
  }
  const chars = book.chars + extra.length + rows.reduce((n, r) => n + r.text.length, 0);
  if (chars > MAX_CHARS) throw invalid(`This source is longer than ${MAX_CHARS.toLocaleString("en-US")} characters.`);
  const sections = book.sections + rows.length;
  if (sections > MAX_SECTIONS) throw invalid(`This source has more than ${MAX_SECTIONS.toLocaleString("en-US")} sections. Split it into smaller files.`);
  if (extra) await q(`UPDATE book_sections SET text = text || $3, chars = chars + $4 WHERE book_id = $1 AND position = $2`, [id, book.sections - 1, extra, extra.length]);
  if (rows.length) await q(
    `INSERT INTO book_sections (book_id, position, location, text, chars) SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::int[])`,
    [id, rows.map((_, i) => book.sections + i), rows.map((r) => r.location), rows.map((r) => r.text), rows.map((r) => r.text.length)]);
  if (done) {
    if (!sections) throw invalid("No text found in this file. Scanned PDFs need OCR first.");
    const [{ count }] = await q<{ count: number }>(`SELECT count(*)::int AS count FROM books WHERE user_id = $1 AND complete`, [userId]);
    if (count >= MAX_BOOKS) throw LIMIT(); // another upload finished first
  }
  const [meta] = await q<BookMeta>(`UPDATE books SET sections = $2, chars = $3, complete = $4 WHERE id = $1 RETURNING ${META}`, [id, sections, chars, done]);
  return meta;
}

export type SectionPage = { sections: Section[]; next: { position: number; offset: number } | null };

/** One page of a complete book's sections from (position, offset). With offset > 0 the first section continues the previous page's last. */
export async function readSectionPage(userId: string, id: string, position: number, offset: number): Promise<SectionPage> {
  const [book] = await sql<{ sections: number }>(`SELECT sections FROM books WHERE id = $1 AND user_id = $2 AND complete`, [ownedId(id), userId]);
  if (!book) throw notFound("source");
  const rows = await sql<{ position: number; location: string; text: string }>(
    `SELECT position, location, text FROM (
       SELECT position, location, text, sum(chars) OVER (ORDER BY position) - chars AS before FROM book_sections WHERE book_id = $1 AND position >= $2
     ) w WHERE before - $3 < $4 ORDER BY position LIMIT 20000`, [id, position, offset, PAGE_CHARS]);
  const sections: Section[] = [];
  let used = 0;
  for (const row of rows) {
    const base = row.position === position ? offset : 0;
    const text = row.text.slice(base);
    if (used + text.length > PAGE_CHARS) {
      let cut = PAGE_CHARS - used;
      if (/[\uD800-\uDBFF]/.test(text[cut - 1] ?? "")) cut--; // never split a surrogate pair
      if (cut > 0) sections.push({ location: row.location, text: text.slice(0, cut) });
      return { sections, next: { position: row.position, offset: base + Math.max(cut, 0) } };
    }
    sections.push({ location: row.location, text });
    used += text.length;
  }
  const last = rows.at(-1)?.position ?? position - 1;
  return { sections, next: last + 1 < book.sections ? { position: last + 1, offset: 0 } : null };
}

export async function renameBook(userId: string, id: string, title: string): Promise<BookMeta> {
  const [meta] = await sql<BookMeta>(`UPDATE books SET title = $3 WHERE id = $1 AND user_id = $2 AND complete RETURNING ${META}`, [ownedId(id), userId, title]);
  if (!meta) throw notFound("source");
  return meta;
}

export async function removeBook(userId: string, id: string) {
  const deleted = await sql(`DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING id`, [ownedId(id), userId]);
  if (!deleted.length) throw notFound("source");
}
