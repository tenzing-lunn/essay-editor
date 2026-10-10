// Browser side of the account API: every essay lives on the server under the signed-in account.
import type { CreateEssayRequest, EssayDoc, EssaySummary, EssayView, ErrorCode, PatchEssayRequest, SaveRequest, SaveResponse, Version } from "./api-types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ErrorCode) { super(message); this.name = code === "conflict" ? "Conflict" : "ApiError"; }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: init.method ?? "GET", cache: "no-store", credentials: "same-origin", keepalive: init.keepalive,
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch { throw new ApiError("Can't reach the server. Check your connection; your changes are kept on this device.", 0); }
  // Vercel answers a body over 4.5 MB with a plain-text 413 before the app sees it.
  if (r.status === 413) throw new ApiError("This essay is too large to save. Split it or remove pasted images.", 413, "invalid");
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(typeof data.error === "string" ? data.error : `Request failed (${r.status}).`, r.status, data.code);
  return data as T;
}

const id = (essayId: string) => `/api/essays/${encodeURIComponent(essayId)}`;
// A save still running when the editor closes (browser Back) must land before the list or the essay is read again,
// or home shows stale rows and a reopened essay loads an old revision.
const pending = new Set<Promise<unknown>>();
const settled = () => Promise.allSettled([...pending]);
export const listEssays = async (view: EssayView = "recent", q = "") => { await settled(); return api<{ essays: EssaySummary[] }>(`/api/essays?view=${view}${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((d) => d.essays); };
export const createEssay = (body: CreateEssayRequest = {}) => api<{ essay: EssaySummary }>("/api/essays", { method: "POST", body }).then((d) => d.essay);
export const readEssay = async (essayId: string) => { await settled(); return api<{ essay: EssayDoc }>(id(essayId)).then((d) => d.essay); };
/** keepalive lets a save started while the page unloads finish; browsers cap keepalive bodies at 64 KB. */
export function saveEssay(essayId: string, body: SaveRequest, keepalive = false): Promise<SaveResponse> {
  const json = keepalive && new TextEncoder().encode(JSON.stringify(body)).length < 60000;
  return track(api<SaveResponse>(id(essayId), { method: "PUT", body, keepalive: json || undefined }));
}
/** Hold list and essay reads until this work (a save, or a chain that ends in one) has finished. */
export function track<T>(work: Promise<T>): Promise<T> {
  pending.add(work); void work.catch(() => {}).finally(() => pending.delete(work));
  return work;
}
export const patchEssay = (essayId: string, body: PatchEssayRequest) => api<{ essay: EssaySummary }>(id(essayId), { method: "PATCH", body }).then((d) => d.essay);
export const deleteEssay = (essayId: string) => api<{ ok: true }>(id(essayId), { method: "DELETE" });
export const emptyTrash = () => api<{ ok: true }>("/api/essays?view=trash", { method: "DELETE" });
export const readVersion = (essayId: string, versionId: string) => api<{ version: Version }>(`${id(essayId)}/versions/${encodeURIComponent(versionId)}`).then((d) => d.version);
