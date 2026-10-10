// Applies db/schema.sql (idempotent) over the direct connection; PgBouncer's pooled endpoint is meant for app traffic.
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

const root = new URL("..", import.meta.url);
if (existsSync(new URL(".env.local", root))) process.loadEnvFile(new URL(".env.local", root));
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) { console.error("Set DATABASE_URL (and optionally DATABASE_URL_UNPOOLED) in .env.local or the environment."); process.exit(1); }

// pg already treats sslmode=require as verify-full; say so explicitly so pg 9's weaker libpq semantics never apply.
const client = new pg.Client({ connectionString: connectionString.replace(/\bsslmode=(?:require|prefer|verify-ca)\b/, "sslmode=verify-full") });
await client.connect();
try {
  await client.query(readFileSync(new URL("db/schema.sql", root), "utf8"));
  const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log(`Schema applied. Tables: ${rows.map((r) => r.table_name).join(", ")}`);
} finally { await client.end(); }
