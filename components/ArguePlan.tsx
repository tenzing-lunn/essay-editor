"use client";

import { useEffect, useRef, useState } from "react";
import { aiFetch } from "@/lib/ai-client";
import { argueGate, MAX_CLAIMS, PlanReviewResult, type ArgumentPlan, type PlanReview } from "@/lib/argument-plan";
import type { EssaySettings } from "@/lib/essay-document";
import { selectExcerpts, sourcesKey } from "@/lib/sources";
import { useBooks } from "@/lib/use-books";
import KeyErrorLink from "@/components/KeyErrorLink";
import PenIcon from "@/components/PenIcon";

type Props = {
  essayId: string; brief: string;
  settings: EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
};
// ids maps each reviewed claim number back to the plan row it was sent from; key says what the plan was when it was read.
type Saved = { key: string; ids: string[]; review: PlanReview; at: number };
const reviewKey = (essayId: string) => `essay:plan-review:v1:${essayId}`;
const SOURCES_LIMIT = 50000;
const BLANK = { id: "", claim: "", evidence: "" };
const EVIDENCE_LABEL = { found: "Found in your sources", missing: "Not in your sources", unchecked: "Not checked" } as const;

function readSaved(value: unknown): Saved | null {
  const v = value as Saved | null;
  const review = PlanReviewResult.safeParse(v?.review);
  return v && typeof v.key === "string" && Array.isArray(v.ids) && review.success ? { key: v.key, ids: v.ids.map(String), review: review.data, at: Number(v.at) || 0 } : null;
}

/**
 * The Argue stage (docs/harness.md): thesis and claims in the writer's words before any paragraph, a gate checked in code,
 * and one AI reading that argues against the plan and looks for its evidence. It never writes the plan.
 */
export default function ArguePlan({ essayId, brief, settings, updateSettings }: Props) {
  const { books, bookIndex } = useBooks();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    try { setSaved(readSaved(JSON.parse(localStorage.getItem(reviewKey(essayId)) ?? "null"))); } catch {}
    return () => abort.current?.abort();
  }, []);

  const { plan, thesis } = settings;
  const rows = plan.claims.length ? plan.claims : [BLANK]; // one empty row to type into; it is saved on the first keystroke
  const gate = argueGate(thesis, plan);
  const sent = plan.claims.filter((c) => c.claim.trim());
  const key = JSON.stringify([thesis.trim(), sent.map((c) => [c.claim.trim(), c.evidence.trim()]), brief, sourcesKey(settings.sources, books), settings.includeAntigone]);
  const stale = !!saved && saved.key !== key;
  const reviewOf = (id: string) => { const n = saved?.ids.indexOf(id) ?? -1; return n < 0 ? undefined : saved!.review.claims.find((c) => c.claimId === n); };
  const setPlan = (update: (plan: ArgumentPlan) => ArgumentPlan) => updateSettings((s) => ({ ...s, plan: update(s.plan) }));
  const setClaim = (i: number, patch: Partial<typeof BLANK>) => setPlan((p) => {
    const claims = p.claims.length ? [...p.claims] : [{ ...BLANK, id: crypto.randomUUID() }];
    claims[i] = { ...claims[i], ...patch };
    return { ...p, claims };
  });

  const review = async () => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setReviewing(true); setError("");
    try {
      const claims = sent.map((c, id) => ({ id, claim: c.claim.trim().slice(0, 400), evidence: c.evidence.trim().slice(0, 600) }));
      const manual = settings.sources;
      const excerpts = books.length ? selectExcerpts(await bookIndex(), claims.map((c) => `${c.claim}\n${c.evidence}`), SOURCES_LIMIT - manual.length - 2) : { text: "" };
      const sources = [manual, excerpts.text].filter(Boolean).join("\n\n");
      const body = { mode: "argue", thesis: thesis.trim(), claims, brief: brief.slice(0, 20000) || undefined, sources: sources || undefined, includeAntigone: settings.includeAntigone };
      const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not read the plan.");
      const next = { key, ids: sent.map((c) => c.id), review: PlanReviewResult.parse(result), at: Date.now() };
      setSaved(next);
      try { localStorage.setItem(reviewKey(essayId), JSON.stringify(next)); } catch {}
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (abort.current === controller) setReviewing(false); }
  };

  const objection = saved?.review.thesis;
  return <section className="plan" aria-labelledby="plan-title">
    <h2 id="plan-title">Argue before you draft</h2>
    <p className="muted small">Your thesis, then one line for each claim with the evidence it will use. The AI argues against the plan; it never writes it.</p>

    <label className="plan-field"><span className="plan-label">Thesis</span>
      <textarea rows={3} maxLength={2000} value={thesis} placeholder="The one sentence the essay will prove."
        onChange={(e) => updateSettings((s) => ({ ...s, thesis: e.target.value }))} />
    </label>
    {objection?.objection && <div className="plan-objection" data-stale={stale}>
      <p><strong>Skeptic:</strong> {objection.quote && <>On “{objection.quote}”: </>}{objection.objection}</p>
      {objection.question && <p><strong>Answer this:</strong> {objection.question}</p>}
    </div>}

    <ol className="plan-claims">
      {rows.map((c, i) => {
        const r = c.id ? reviewOf(c.id) : undefined;
        // The first row keeps one key from blank to saved, so the field being typed in is not remounted mid-word.
        return <li key={i === 0 ? "first" : c.id} className="plan-claim">
          <div className="plan-claim-head">
            <span className="plan-label" aria-hidden="true">Claim {i + 1}</span>
            {c.id && <button className="link" aria-label={`Remove claim ${i + 1}`} onClick={() => setPlan((p) => ({ ...p, claims: p.claims.filter((x) => x.id !== c.id) }))}>Remove</button>}
          </div>
          <textarea rows={2} maxLength={400} value={c.claim} aria-label={`Claim ${i + 1}`} placeholder="A point that will become one paragraph."
            onChange={(e) => setClaim(i, { claim: e.target.value })} />
          <input maxLength={600} value={c.evidence} aria-label={`Evidence for claim ${i + 1}`} placeholder="Evidence: the quotation, scene or source."
            onChange={(e) => setClaim(i, { evidence: e.target.value })} />
          {r && <div className="plan-objection" data-stale={stale}>
            {r.objection && <p><strong>Skeptic:</strong> {r.objection}</p>}
            <p><span className="plan-evidence" data-evidence={r.evidence}>{EVIDENCE_LABEL[r.evidence]}</span> {r.note}</p>
            {r.quote && <blockquote>{r.quote}</blockquote>}
          </div>}
        </li>;
      })}
    </ol>
    {plan.claims.length > 0 && plan.claims.length < MAX_CLAIMS && <button className="plan-add" onClick={() => setPlan((p) => ({ ...p, claims: [...p.claims, { ...BLANK, id: crypto.randomUUID() }] }))}><PenIcon name="plus" size={16} />Add a claim</button>}

    <h2>Before you draft</h2>
    <ul className="grade-checks">
      {gate.checks.map((c) => <li key={c.key} className="grade-check" data-state={c.pass ? "pass" : "fail"}>
        <PenIcon name={c.pass ? "tick" : "cross"} size={18} className="grade-check-icon" />
        <div>
          <p className="grade-check-head"><span className="grade-check-name">{c.name}</span></p>
          {c.detail && <p className="grade-check-detail">{c.detail}</p>}
        </div>
      </li>)}
    </ul>
    {gate.pass ? <p className="plan-gate">Ready to draft. Each claim becomes a paragraph.</p>
      : plan.skippedAt ? <p className="plan-gate muted small">Planning skipped {new Date(plan.skippedAt).toLocaleDateString()}. Nothing is locked; finish the plan whenever you like.</p>
      : <p className="plan-gate"><button className="link" onClick={() => setPlan((p) => ({ ...p, skippedAt: Date.now() }))}>Skip planning and start drafting</button></p>}

    <h2>Argue with it</h2>
    <p className="muted small">A skeptic attacks the thesis and each claim. Each piece of evidence is looked up in your sources.</p>
    <button className="primary" disabled={reviewing || !thesis.trim() || !sent.length} onClick={() => void review()}>{reviewing ? "Reading the plan…" : saved ? "Attack my plan again" : "Attack my plan"}</button>
    {stale && !reviewing && <p className="plan-stale muted small">The plan changed since this reading.</p>}
    {error && <p className="error" role="alert">{error}<KeyErrorLink error={error} /></p>}
  </section>;
}
