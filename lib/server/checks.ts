// Stored check results for the writer memory (lib/writer-memory.ts). Scoped by user_id like lib/server/essays.ts.
import type { CheckInput, StoredCheck } from "../writer-memory";
import { ms, sql, transaction } from "./db";
import { isUuid, notFound } from "./http";

const GRADES_PER_ESSAY = 20;
const READ_LIMIT = 400;

export async function recordCheck(userId: string, essayId: string, input: CheckInput): Promise<void> {
  if (!isUuid(essayId)) throw notFound();
  const { kind, words, ...data } = input;
  await transaction(async (q) => {
    const [essay] = await q(`SELECT 1 FROM essays WHERE id = $1 AND user_id = $2 AND trashed_at IS NULL FOR UPDATE`, [essayId, userId]);
    if (!essay) throw notFound();
    // The row lock above serializes writers per essay, so the issues snapshot stays one row.
    if (kind === "issues") await q(`DELETE FROM essay_checks WHERE essay_id = $1 AND kind = 'issues'`, [essayId]);
    await q(`INSERT INTO essay_checks (user_id, essay_id, kind, words, data) VALUES ($1, $2, $3, $4, $5)`, [userId, essayId, kind, words, JSON.stringify(data)]);
    if (kind === "grade") await q(`DELETE FROM essay_checks WHERE id IN (SELECT id FROM essay_checks WHERE essay_id = $1 AND kind = 'grade' ORDER BY created_at DESC OFFSET $2)`,
      [essayId, GRADES_PER_ESSAY]);
  });
}

/** Newest first, essays in the trash left out. */
export const listChecks = (userId: string) => sql<StoredCheck>(
  `SELECT c.essay_id AS "essayId", c.kind, c.words, c.data, ${ms("c.created_at", "createdAt")}
   FROM essay_checks c JOIN essays e ON e.id = c.essay_id
   WHERE c.user_id = $1 AND e.trashed_at IS NULL ORDER BY c.created_at DESC LIMIT $2`, [userId, READ_LIMIT]);
