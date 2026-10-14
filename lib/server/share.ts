// Shareable grade reports. The whole report rides in the URL, signed, so a link needs no table and cannot be made or altered without SHARE_SECRET.
// The payload carries trait levels and the three steps only: never the essay, the sharer's name or an essay id.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { letterFor, TRAITS } from "../essay-grade.ts";
import type { TraitKey } from "../essay-grade.ts";

const TRAIT_KEYS = TRAITS.map((t) => t.key) as [TraitKey, ...TraitKey[]];
export const STEP_MAX = 300, TITLE_MAX = 80;
const MIN_SECRET = 16; // shorter than this is a placeholder, not a secret
const MAX_LINK = 4096; // a real report is under 2 KB; anything bigger is not one

/** What a link carries, exactly. Strict so a stray field (essay text, a name) can never be signed. */
export const SharePayload = z.strictObject({
  v: z.literal(1),
  letter: z.string().max(2),
  percent: z.number().int().min(0).max(100),
  traits: z.array(z.strictObject({ key: z.enum(TRAIT_KEYS), level: z.number().int().min(0).max(4) })).min(1).max(TRAITS.length)
    .refine((ts) => new Set(ts.map((t) => t.key)).size === ts.length, "Each trait can appear once."),
  steps: z.array(z.string().min(1).max(STEP_MAX, `Each step is at most ${STEP_MAX} characters.`)).max(3, "A report has at most three steps."),
  at: z.iso.datetime(),
  title: z.string().min(1).max(TITLE_MAX, `Keep the title under ${TITLE_MAX + 1} characters.`).optional(),
}).refine((p) => p.letter === letterFor(p.percent), "The letter grade doesn't match the percent.");
export type SharePayload = z.infer<typeof SharePayload>;

/** POST /api/share body: the editor's Grade plus an optional title, reduced to the payload. Unknown Grade fields (thesis, evidence) are dropped, not signed. */
export const ShareRequest = z.object({
  grade: z.object({
    letter: z.string(), percent: z.number(),
    traits: z.array(z.object({ key: z.enum(TRAIT_KEYS, { error: "Unknown rubric trait." }), level: z.number() })),
    nextSteps: z.array(z.object({ step: z.string() })),
  }, { error: "Send the grade to share." }),
  title: z.string().trim().max(TITLE_MAX, `Keep the title under ${TITLE_MAX + 1} characters.`).optional(),
}).transform(({ grade, title }) => ({
  v: 1 as const, letter: grade.letter, percent: grade.percent, traits: grade.traits, steps: grade.nextSteps.map((s) => s.step),
  at: new Date().toISOString(), ...(title ? { title } : {}),
})).pipe(SharePayload);

/** The signing key, or null when sharing is off on this instance. Read per call so a test can set it. */
const secret = () => { const s = process.env.SHARE_SECRET ?? ""; return s.length >= MIN_SECRET ? s : null; };
export const shareEnabled = () => secret() !== null;
const sign = (data: string, key: string) => createHmac("sha256", key).update(data).digest("base64url");

/** `<base64url json>.<base64url hmac>`: the `d` of `/r?d=`. Throws when sharing is off or the payload is not a report. */
export function encodeShare(payload: SharePayload): string {
  const key = secret();
  if (!key) throw new Error("SHARE_SECRET is not set");
  const data = Buffer.from(JSON.stringify(SharePayload.parse(payload))).toString("base64url");
  return `${data}.${sign(data, key)}`;
}

/** The report a link carries, or null for anything missing, malformed, truncated or altered. Never throws: a bad link is a 404, not a 500. */
export function decodeShare(d: unknown): SharePayload | null {
  const key = secret();
  if (!key || typeof d !== "string" || d.length > MAX_LINK) return null;
  const [data, sig, ...rest] = d.split(".");
  if (!data || !sig || rest.length) return null;
  // The HMAC covers the encoded text, so the comparison is over fixed-length strings and length is checked before the constant-time compare.
  const expected = Buffer.from(sign(data, key)), given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = SharePayload.safeParse(JSON.parse(Buffer.from(data, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
