// One pg pool per server instance. attachDatabasePool lets Vercel Fluid compute close idle clients before a function suspends.
import { Pool } from "pg";
import type { PoolClient, QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";

export type Sql = <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;

// pg already treats sslmode=require as verify-full; say so explicitly so pg 9's weaker libpq semantics never apply.
export const strictSsl = (url: string) => url.replace(/\bsslmode=(?:require|prefer|verify-ca)\b/, "sslmode=verify-full");

// Dev hot reload re-evaluates this module, so keep the pool on globalThis instead of leaking one per edit.
const shared = globalThis as typeof globalThis & { essayPool?: Pool };
function pool(): Pool {
  if (shared.essayPool) return shared.essayPool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Postgres connection string to .env.local.");
  const created = new Pool({ connectionString: strictSsl(url), max: 10, idleTimeoutMillis: 10_000 });
  created.on("error", (error) => console.error("Idle database client failed", error.message)); // Neon closes idle connections; don't crash
  attachDatabasePool(created);
  return shared.essayPool = created;
}

const runner = (client: Pool | PoolClient): Sql => async (text, params) => (await client.query(text, params)).rows;

export const sql: Sql = (text, params) => runner(pool())(text, params);

export async function transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await work(runner(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch((e: Error) => { broken = e; });
    throw error;
  } finally { client.release(broken); }
}

/** Epoch milliseconds as a JS number (pg returns bigint as a string). */
export const ms = (column: string, as = column) => `floor(extract(epoch from ${column}) * 1000)::float8 AS "${as}"`;
