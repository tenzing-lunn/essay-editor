// The free door: AI_FREE_CHECKS_PER_ACCOUNT checks per signed-in account per calendar month (UTC) on the server key, and
// no more than AI_FREE_BUDGET_USD spent on them across every account in that month. Both are required to open it.
// A check is one click: every free request an account makes within two minutes of the first, up to forty, counts once, so
// Check my essay (a request per paragraph plus the grade) is one check however long the essay is.
// Each request is reserved in ai_quota before the provider is called, so parallel requests can't take more than the allowance.
import { AsyncLocalStorage } from "node:async_hooks";
import { AiError, keyProblem, publicAiError, registerFreeReader, resolveAiCredentials, type AiFree, type AiProvider } from "../ai-config.ts";
import { aiReceipts } from "../ai-usage.ts";
import { sql, type Sql } from "./db.ts";

export type Reservation = { free: AiFree; granted: boolean; paused: boolean; userId: string; month: string };
type Deps = { db?: Sql; now?: Date };
type Whoami = () => Promise<{ id: string } | null>;

export const CHECK_WINDOW_MS = 2 * 60_000, CHECK_REQUESTS = 40;
// Charged against the budget for a request whose cost is unknown (no receipt, or a model without a price). More than the
// largest request the routes accept costs on the economy model, so the budget is never undercounted.
const UNKNOWN_COST_USD = 0.05;

const running = new AsyncLocalStorage<Reservation>();
registerFreeReader(() => running.getStore() !== undefined);

export const exhaustedMessage = (limit: number) =>
  `You've used this month's ${limit} free checks. Connect your own API key for unlimited checks, billed by your provider.`;
export const pausedMessage = (resetsAt: string) =>
  `Free checks are paused until ${new Date(resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}: this month's free budget is used up. Connect your own API key to keep checking, billed by your provider.`;

/** The month's budget for every free check together, in millionths of a dollar; 0 when unset, which keeps the door closed. */
export function freeBudget(env: NodeJS.ProcessEnv): number {
  const usd = Number(env.AI_FREE_BUDGET_USD ?? 0);
  return Number.isFinite(usd) && usd > 0 ? Math.round(usd * 1e6) : 0;
}

/**
 * The monthly allowance, or 0 when the door is closed: either variable unset or 0, no well-formed server key for
 * AI_PROVIDER (a malformed one would fail every free check with a key error the writer never typed), or
 * AI_ALLOW_SERVER_KEY (unlimited for everyone, so nothing to count).
 */
export function freeLimit(env: NodeJS.ProcessEnv): number {
  const limit = Number(env.AI_FREE_CHECKS_PER_ACCOUNT ?? 0);
  const provider = env.AI_PROVIDER ?? "anthropic";
  const key = provider === "anthropic" ? env.ANTHROPIC_API_KEY : provider === "openai" ? env.OPENAI_API_KEY : "";
  return Number.isInteger(limit) && limit > 0 && freeBudget(env) > 0 && keyProblem(provider as AiProvider, key?.trim() ?? "") === null && env.AI_ALLOW_SERVER_KEY !== "true" ? limit : 0;
}

/** The calendar month (UTC) a check counts toward, and when the next one starts. */
const monthOf = (now: Date) => ({
  month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
  resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
});

/**
 * Who the allowance applies to, or null: a visitor key was sent (even an empty or invalid one fails exactly as it does
 * today), the door is closed, or nobody is signed in.
 */
async function allowance(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, whoami: Whoami) {
  if (headers.get("x-ai-key") != null) return null;
  const limit = freeLimit(env);
  if (!limit) return null;
  const account = await whoami();
  return account ? { account, limit, budget: freeBudget(env) } : null;
}

/** This account's checks and whether the month's budget is spent, in one read. A spent budget shows as no checks left. */
async function standing(db: Sql, userId: string, month: string, limit: number, budget: number, resetsAt: string) {
  const [row] = await db<{ used: number | null; spent: string | number | null }>(
    `SELECT (SELECT used FROM ai_quota WHERE user_id = $1 AND month = $2) AS used,
            (SELECT micro_usd FROM ai_free_spend WHERE month = $2) AS spent`, [userId, month]);
  const paused = Number(row?.spent ?? 0) >= budget;
  return { free: { used: paused ? limit : Math.min(row?.used ?? 0, limit), limit, resetsAt }, paused };
}

/** Reserves this request: it joins the account's open check, or opens a new one if any are left. Null when the allowance doesn't apply. */
export async function reserveFree(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, whoami: Whoami, { db = sql, now = new Date() }: Deps = {}): Promise<Reservation | null> {
  const applies = await allowance(headers, env, whoami);
  if (!applies) return null;
  const { account, limit, budget } = applies;
  const { month, resetsAt } = monthOf(now);
  // One statement, so parallel requests queue on the row lock: the first opens a check, the rest find it open and join it.
  // Once the month's budget is spent nothing is written, open check or not.
  const open = `q.window_started_at > $5::timestamptz AND q.window_requests < $7`;
  const [row] = await db<{ used: number }>(
    `INSERT INTO ai_quota AS q (user_id, month, used, window_started_at, window_requests)
     SELECT $1::uuid, $2::date, 1, $4::timestamptz, 1 WHERE coalesce((SELECT micro_usd FROM ai_free_spend WHERE month = $2::date), 0) < $6
     ON CONFLICT (user_id, month) DO UPDATE SET
       used = q.used + CASE WHEN ${open} THEN 0 ELSE 1 END,
       window_started_at = CASE WHEN ${open} THEN q.window_started_at ELSE $4::timestamptz END,
       window_requests = CASE WHEN ${open} THEN q.window_requests + 1 ELSE 1 END
     WHERE (${open}) OR q.used < $3
     RETURNING used`,
    [account.id, month, limit, now.toISOString(), new Date(now.getTime() - CHECK_WINDOW_MS).toISOString(), budget, CHECK_REQUESTS]);
  if (row) return { free: { used: row.used, limit, resetsAt }, granted: true, paused: false, userId: account.id, month };
  const { free, paused } = await standing(db, account.id, month, limit, budget, resetsAt);
  return { free: { ...free, used: limit }, granted: false, paused, userId: account.id, month };
}

async function peek(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, whoami: Whoami, { db = sql, now = new Date() }: Deps) {
  const applies = await allowance(headers, env, whoami);
  if (!applies) return null;
  const { month, resetsAt } = monthOf(now);
  return standing(db, applies.account.id, month, applies.limit, applies.budget, resetsAt);
}

/** This month's count without spending a check, so the AI button is right on arrival. Null in the same cases as reserveFree. */
export const peekFree = async (headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, whoami: Whoami, deps: Deps = {}): Promise<AiFree | null> =>
  (await peek(headers, env, whoami, deps))?.free ?? null;

/**
 * The connection test on the allowance: the key is the operator's, so it answers with the economy model and this month's
 * count without calling the provider or spending a check. Null when the allowance doesn't apply, so a visitor key is tested.
 */
export async function freeConnection(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, whoami: Whoami, deps: Deps = {}): Promise<Response | null> {
  const state = await peek(headers, env, whoami, deps);
  if (!state) return null;
  const { free, paused } = state;
  if (paused) return respond({ error: pausedMessage(free.resetsAt) }, 402, free);
  if (free.used >= free.limit) return respond({ error: exhaustedMessage(free.limit) }, 402, free);
  return respond({ ok: true, model: resolveAiCredentials(headers, env, false, true).model, free }, 200, free);
}

/**
 * Gives a request back, only for a provider that was unavailable or a server key that failed. The check itself is given
 * back once every request in it has been: a check where anything was answered stays spent.
 */
export const refundFree = (slot: Reservation, db: Sql = sql) =>
  db<{ used: number }>(
    `UPDATE ai_quota SET
       used = CASE WHEN window_requests = 1 THEN greatest(used - 1, 0) ELSE used END,
       window_started_at = CASE WHEN window_requests = 1 THEN NULL ELSE window_started_at END,
       window_requests = window_requests - 1
     WHERE user_id = $1 AND month = $2 AND window_requests > 0
     RETURNING used`, [slot.userId, slot.month]);

/** Adds what this request cost the server key to the month's free spend. */
async function chargeFree(month: string, db: Sql = sql) {
  const receipts = aiReceipts();
  const usd = receipts ? receipts.reduce((sum, r) => sum + (r.costUsd ?? UNKNOWN_COST_USD), 0) : UNKNOWN_COST_USD;
  const micro = Math.ceil(usd * 1e6);
  if (micro > 0) await db(
    `INSERT INTO ai_free_spend (month, micro_usd) VALUES ($1, $2)
     ON CONFLICT (month) DO UPDATE SET micro_usd = ai_free_spend.micro_usd + $2`, [month, micro]);
}

const respond = (data: unknown, status: number, free?: AiFree) =>
  Response.json(data, { status, headers: free ? { "x-ai-free": JSON.stringify(free) } : undefined });

/** The GET answer for the AI button on page load: the count in the same header every check carries, never cached. */
export async function freeStatus(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, whoami: Whoami, deps: Deps = {}): Promise<Response> {
  const free = await peekFree(headers, env, whoami, deps);
  const response = respond({ free }, 200, free ?? undefined);
  response.headers.set("cache-control", "no-store");
  return response;
}

/** An error from this side of the wire: not the app's own AiError, and without the status code a provider's answer carries. */
const unreached = (error: unknown) => !(error instanceof AiError) &&
  !(typeof error === "object" && error !== null && "status" in error && Number.isFinite(Number((error as { status: unknown }).status)));

/**
 * The gate both AI routes answer through. Reserves a free request when the allowance applies, runs the work with the
 * reservation visible to resolveAiCredentials, charges what it cost to the month's budget, gives it back when the provider
 * was busy or out of credit (503, 429) or the server key failed (400, 401), and stamps this month's count on the response,
 * the 402 included. Any failure becomes the public JSON error.
 */
export async function freeGate(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, whoami: Whoami, work: (free: AiFree | null) => Promise<unknown>, deps: Deps = {}): Promise<Response> {
  let slot: Reservation | null = null;
  let outcome: { data: unknown } | { error: unknown };
  try {
    slot = await reserveFree(headers, env, whoami, deps);
    if (slot && !slot.granted) throw new AiError(slot.paused ? pausedMessage(slot.free.resetsAt) : exhaustedMessage(slot.free.limit), 402);
    const reserved = slot;
    outcome = { data: await (reserved ? running.run(reserved, () => work(reserved.free)) : work(null)) };
  } catch (error) { outcome = { error }; }
  // Answered or not, whatever the provider billed comes off the month's budget.
  if (slot?.granted) await chargeFree(slot.month, deps.db);
  if ("data" in outcome) return respond(outcome.data, 200, slot?.free);
  const failure = publicAiError(outcome.error);
  // A refusal, a bad request to the provider or the 402 itself keeps the request. An unavailable provider (503, 429), an
  // error with no provider status at all (the request never arrived, or nothing usable came back), or a malformed or
  // rejected key (400, 401: on a free check that is the operator's key, which the writer cannot fix) gives it back.
  if (slot?.granted && (failure.status === 503 || failure.status === 429 || failure.status === 400 || failure.status === 401 || unreached(outcome.error))) {
    const [row] = await refundFree(slot, deps.db);
    if (row) slot.free.used = row.used;
  }
  return respond({ error: failure.error }, failure.status, slot?.free);
}
