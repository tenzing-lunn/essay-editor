// JSON responses for the account API: every body is { error, code? } on failure and never cached.
import type { z } from "zod";
import type { ErrorCode } from "../api-types";
import { rejectCrossSite } from "../same-origin";

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
export const fail = (status: number, error: string, code?: ErrorCode) => json(code ? { error, code } : { error }, status);
export const unauthenticated = () => fail(401, "Please sign in.", "unauthenticated");
export const notFound = (what = "essay") => fail(404, `This ${what} doesn't exist or was deleted.`, "not_found");
export const invalid = (error: string) => fail(400, error, "invalid");

// Checked before any query, so a malformed id is a 404 rather than a Postgres cast error.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

// Postgres text and jsonb reject U+0000, so strip it from anything stored rather than fail with a 500.
export const noNul = (s: string) => s.includes("\0") ? s.replaceAll("\0", "") : s;
export const deepNoNul = <T>(value: T): T =>
  typeof value === "string" ? noNul(value) as T
  : Array.isArray(value) ? value.map(deepNoNul) as T
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [noNul(k), deepNoNul(v)])) as T
  : value;

/** The JSON body as an object, or throws a 400 Response, which route() returns as is. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => undefined);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Send a JSON object as the request body.");
  return body as Record<string, unknown>;
}

/** Validates a JSON body against a schema whose messages are written for people, or throws a 400 Response. */
export async function parse<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const result = schema.safeParse(await readJson(request));
  if (!result.success) throw invalid(result.error.issues[0]?.message ?? "Invalid request.");
  return result.data;
}

/** Wraps a handler: same-origin check for mutations, thrown Responses pass through, anything else is a logged 500. */
export function route<C>(handler: (request: Request, context: C) => Promise<Response>, mutating = true) {
  return async (request: Request, context: C): Promise<Response> => {
    if (mutating) {
      const blocked = rejectCrossSite(request);
      if (blocked) { blocked.headers.set("cache-control", "no-store"); return blocked; }
    }
    try { return await handler(request, context); }
    catch (error) {
      if (error instanceof Response) return error;
      console.error(`${request.method} ${new URL(request.url).pathname} failed`, error);
      return fail(500, "Something went wrong on the server. Try again in a moment.");
    }
  };
}
