// Essay queries. Every statement is scoped by user_id, so another account's essay looks exactly like a missing one.
import { z } from "zod";
import { displayTitle, MAX_VERSIONS, TITLE_MAX, TRASH_DAYS } from "../api-types";
import type { EssayDoc, EssaySummary, EssayView, SaveResponse, Version, VersionInfo } from "../api-types";
import { EMPTY_ESSAY_SETTINGS } from "../essay-document";
import { EssaySettingsSchema } from "../essay-workflow";
import { ms, sql, transaction } from "./db";
import type { Sql } from "./db";
import { deepNoNul, fail, invalid, isUuid, noNul, notFound } from "./http";

const SUMMARY = `id, title, preview, words, ${ms("created_at", "createdAt")}, ${ms("updated_at", "updatedAt")}, ${ms("opened_at", "openedAt")}, ${ms("archived_at", "archivedAt")}, ${ms("trashed_at", "trashedAt")}`;
const VERSION_INFO = `id, ${ms("saved_at", "savedAt")}, words`;
const VIEWS: Record<EssayView, string> = {
  recent: "archived_at IS NULL AND trashed_at IS NULL",
  archived: "archived_at IS NOT NULL AND trashed_at IS NULL",
  trash: "trashed_at IS NOT NULL",
};
export const isView = (view: unknown): view is EssayView => typeof view === "string" && Object.hasOwn(VIEWS, view);

const MAX_ESSAYS = 1000; // including archived and trashed
const MAX_BYTES = 4_000_000; // UTF-8 JSON of one save, under Vercel's 4.5 MB request cap
const TOO_LARGE = "This essay is too large to save. Split it or remove pasted images.";
const Html = z.string().max(2_000_000, "This essay is too large to save. Move part of it into a separate essay.").overwrite(noNul);
const Text = z.string().max(500_000, "This essay is too long to save (over 500,000 characters).").overwrite(noNul);
const Brief = z.string().max(20_000, "The assignment brief is too long to save (over 20,000 characters).").overwrite(noNul);
const Title = z.string().overwrite(noNul).trim().max(TITLE_MAX, `Keep the title under ${TITLE_MAX + 1} characters.`);
const Settings = z.unknown().transform((value, ctx) => {
  const result = EssaySettingsSchema.safeParse(value);
  if (result.success) return deepNoNul(result.data);
  const issue = result.error.issues[0];
  ctx.addIssue({ code: "custom", message: `The essay's checklist, notes or tasks could not be saved (${issue?.path.join(".") || "settings"}: ${issue?.message}).` });
  return z.NEVER;
});
const fits = (e: { html?: string; text?: string; brief?: string; settings?: unknown }) =>
  Buffer.byteLength(JSON.stringify([e.html, e.text, e.brief, e.settings])) <= MAX_BYTES;
export const CreateSchema = z.object({ title: Title.optional(), html: Html.optional(), text: Text.optional(), brief: Brief.optional(), settings: Settings.optional(), copyOf: z.string().optional() })
  .refine(fits, TOO_LARGE);
export const SaveSchema = z.object({ html: Html, text: Text, brief: Brief, settings: Settings, expectedRevision: z.string().max(100), checkpoint: z.boolean().optional() }, { error: "Send html, text, brief, settings and expectedRevision." })
  .refine(fits, TOO_LARGE);
export const PatchSchema = z.object({ title: Title.optional(), archived: z.boolean().optional(), trashed: z.boolean().optional() });

const wordsOf = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
const previewOf = (text: string) => text.trimStart().slice(0, 200);
const versionsOf = (q: Sql, essayId: string) => q<VersionInfo>(`SELECT ${VERSION_INFO} FROM essay_versions WHERE essay_id = $1 ORDER BY saved_at DESC, id`, [essayId]);
const ownedId = (id: string) => { if (!isUuid(id)) throw notFound(); return id; };

export const SEARCH_MAX = 200;
// `q` matches the title or anywhere in the text, case-insensitively; % and _ are literal.
export async function listEssays(userId: string, view: EssayView, q = ""): Promise<EssaySummary[]> {
  await sql(`DELETE FROM essays WHERE user_id = $1 AND trashed_at < now() - make_interval(days => $2)`, [userId, TRASH_DAYS]);
  const term = noNul(q).trim();
  if (!term) return sql<EssaySummary>(`SELECT ${SUMMARY} FROM essays WHERE user_id = $1 AND ${VIEWS[view]} ORDER BY updated_at DESC, id`, [userId]);
  return sql<EssaySummary>(`SELECT ${SUMMARY} FROM essays WHERE user_id = $1 AND ${VIEWS[view]} AND (title ILIKE $2 ESCAPE '\\' OR text ILIKE $2 ESCAPE '\\') ORDER BY updated_at DESC, id`,
    [userId, `%${term.replace(/[\\%_]/g, "\\$&")}%`]);
}

export async function createEssay(userId: string, input: z.infer<typeof CreateSchema>): Promise<EssaySummary> {
  let { title = "", html = "", text = "", brief = "", settings = EMPTY_ESSAY_SETTINGS } = input;
  if (input.copyOf !== undefined) {
    const [source] = await sql<{ title: string; html: string; text: string; brief: string; settings: typeof settings }>(
      `SELECT title, html, text, brief, settings FROM essays WHERE id = $1 AND user_id = $2`, [ownedId(input.copyOf), userId]);
    if (!source) throw notFound();
    ({ html, text, brief, settings } = source);
    title = `Copy of ${displayTitle(source)}`.slice(0, TITLE_MAX);
  }
  return transaction(async (q) => {
    await q(`SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE`, [userId]); // serializes this account's limit check
    const [{ count }] = await q<{ count: number }>(`SELECT count(*)::int AS count FROM essays WHERE user_id = $1`, [userId]);
    if (count >= MAX_ESSAYS) throw fail(409, `You can keep up to ${MAX_ESSAYS.toLocaleString("en-US")} essays, including archived ones and the trash. Delete some first.`, "limit");
    const [essay] = await q<EssaySummary>(
      `INSERT INTO essays (user_id, title, html, text, brief, settings, words, preview) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${SUMMARY}`,
      [userId, title, html, text, brief, JSON.stringify(settings), wordsOf(text), previewOf(text)]);
    return essay;
  });
}

export async function readEssay(userId: string, id: string): Promise<EssayDoc> {
  const [essay] = await sql<Omit<EssayDoc, "versions">>(
    `UPDATE essays SET opened_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${SUMMARY}, html, text, brief, settings, revision`, [ownedId(id), userId]);
  if (!essay) throw notFound();
  return { ...essay, versions: await versionsOf(sql, id) };
}

export function saveEssay(userId: string, id: string, input: z.infer<typeof SaveSchema>): Promise<SaveResponse> {
  ownedId(id);
  // Row lock: two tabs saving at once serialize here, and the loser sees a changed revision.
  return transaction(async (q) => {
    const words = wordsOf(input.text), settings = JSON.stringify(input.settings);
    const [row] = await q<{ revision: string; trashed: boolean; same: boolean; savedAt: number }>(
      `SELECT revision, trashed_at IS NOT NULL AS trashed, html = $3 AND text = $4 AND brief = $5 AND settings = $6::jsonb AS same, ${ms("updated_at", "savedAt")}
       FROM essays WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId, input.html, input.text, input.brief, settings]);
    if (!row) throw notFound();
    if (row.revision !== input.expectedRevision) {
      // Identical content means this save already committed and only its response was lost: answer as if it just succeeded.
      if (row.same) return { savedAt: row.savedAt, revision: row.revision, versions: await versionsOf(q, id) };
      throw fail(409, "This essay was changed in another tab or on another device. Reload to see the latest version.", "conflict");
    }
    if (row.trashed) throw fail(409, "This essay is in the trash. Restore it to keep editing.", "trashed");
    const [saved] = await q<{ revision: string; savedAt: number }>(
      `UPDATE essays SET html = $2, text = $3, brief = $4, settings = $5, words = $6, preview = $7, revision = gen_random_uuid(), updated_at = now()
       WHERE id = $1 RETURNING revision, ${ms("updated_at", "savedAt")}`, [id, input.html, input.text, input.brief, settings, words, previewOf(input.text)]);
    const [newest] = await q<{ due: boolean }>(`SELECT now() - saved_at >= interval '60 seconds' AS due FROM essay_versions WHERE essay_id = $1 ORDER BY saved_at DESC LIMIT 1`, [id]);
    if (input.checkpoint || !newest || newest.due) {
      await q(`INSERT INTO essay_versions (essay_id, saved_at, html, text, brief, settings, words) VALUES ($1, now(), $2, $3, $4, $5, $6)`, [id, input.html, input.text, input.brief, settings, words]);
      await q(`DELETE FROM essay_versions WHERE essay_id = $1 AND id NOT IN (SELECT id FROM essay_versions WHERE essay_id = $1 ORDER BY saved_at DESC, id LIMIT $2)`, [id, MAX_VERSIONS]);
    }
    return { savedAt: saved.savedAt, revision: saved.revision, versions: await versionsOf(q, id) };
  });
}

// Renaming bumps updated_at but not the revision, so it never conflicts with an open editor. Archive and trash leave updated_at alone.
export async function patchEssay(userId: string, id: string, patch: z.infer<typeof PatchSchema>): Promise<EssaySummary> {
  const params: unknown[] = [ownedId(id), userId];
  const sets: string[] = [];
  if (patch.title !== undefined) { params.push(patch.title); sets.push(`title = $${params.length}`, "updated_at = now()"); }
  if (patch.archived !== undefined) sets.push(patch.archived ? "archived_at = coalesce(archived_at, now())" : "archived_at = NULL");
  if (patch.trashed !== undefined) sets.push(patch.trashed ? "trashed_at = coalesce(trashed_at, now())" : "trashed_at = NULL");
  if (!sets.length) throw invalid("Send a title, archived or trashed value to change.");
  // A trashed essay is read-only: it can be renamed only in the same request that restores it.
  params.push(patch.title === undefined || patch.trashed === false);
  const [essay] = await sql<EssaySummary>(`UPDATE essays SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 AND (trashed_at IS NULL OR $${params.length}) RETURNING ${SUMMARY}`, params);
  if (essay) return essay;
  const [exists] = await sql(`SELECT 1 FROM essays WHERE id = $1 AND user_id = $2`, [params[0], userId]);
  throw exists ? fail(409, "This essay is in the trash. Restore it to rename it.", "trashed") : notFound();
}

export async function deleteEssay(userId: string, id: string) {
  const deleted = await sql(`DELETE FROM essays WHERE id = $1 AND user_id = $2 AND trashed_at IS NOT NULL RETURNING id`, [ownedId(id), userId]);
  if (deleted.length) return;
  const [exists] = await sql(`SELECT 1 FROM essays WHERE id = $1 AND user_id = $2`, [id, userId]);
  throw exists ? fail(409, "Move it to the trash first.", "invalid") : notFound();
}

export const emptyTrash = (userId: string) => sql(`DELETE FROM essays WHERE user_id = $1 AND trashed_at IS NOT NULL`, [userId]);

export async function readVersion(userId: string, essayId: string, versionId: string): Promise<Version> {
  if (!isUuid(versionId)) throw notFound("version");
  const [version] = await sql<Version>(
    `SELECT v.id, ${ms("v.saved_at", "savedAt")}, v.html, v.text, v.brief, v.settings FROM essay_versions v JOIN essays e ON e.id = v.essay_id
     WHERE v.id = $1 AND v.essay_id = $2 AND e.user_id = $3`, [versionId, ownedId(essayId), userId]);
  if (!version) throw notFound("version");
  return version;
}
