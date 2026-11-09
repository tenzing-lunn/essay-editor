"use client";

import { useEffect, useRef, useState } from "react";
import { aiFetch } from "@/lib/ai-client";
import { ArgumentMapResult, type ArgumentMap } from "@/lib/argument-map";
import { draftGate } from "@/lib/argument-plan";
import type { EssaySettings } from "@/lib/essay-document";
import type { StageCheck } from "@/lib/essay-grade";
import KeyErrorLink from "@/components/KeyErrorLink";
import PenIcon from "@/components/PenIcon";

type Props = {
  essayId: string; paragraphs: string[]; paragraphOf: number[]; noteCounts: number[]; open: boolean;
  onToggle: () => void; onSelect: (index: number) => void; onReview: (index: number) => void;
  brief: string; settings: EssaySettings;
  /** Bumped by the full read (Read it): maps once unless the map already covers these paragraphs and this plan. */
  runSignal?: number;
  /** The Draft gate as a check in the full read; null without planned claims. */
  onCheck?: (check: StageCheck | null) => void;
};
// plan maps each planned-claim number the map was sent back to its plan row; planKey says what those claims were.
type Saved = { paragraphs: string[]; map: ArgumentMap; at: number; plan: string[]; planKey: string };
const mapKey = (essayId: string) => `essay:argument-map:v1:${essayId}`;

function readSaved(value: unknown): Saved | null {
  const v = value as Saved | null;
  // Maps saved before the plan existed have no planClaim; they read as matching no planned claim.
  const map = ArgumentMapResult.safeParse(v?.map && { ...v.map, paragraphs: Array.isArray(v.map.paragraphs) ? v.map.paragraphs.map((p) => ({ ...p, planClaim: typeof p.planClaim === "number" ? p.planClaim : -1 })) : v.map.paragraphs });
  return v && Array.isArray(v.paragraphs) && v.paragraphs.every((p) => typeof p === "string") && map.success
    ? { paragraphs: v.paragraphs, map: map.data, at: Number(v.at) || 0, plan: Array.isArray(v.plan) ? v.plan.map(String) : [], planKey: typeof v.planKey === "string" ? v.planKey : "" } : null;
}

/** A slim navigator beside the page: one row per paragraph with its open notes. The argument map runs here without being drawn,
 * because the Draft gate (every planned claim has a paragraph) reads it. */
export default function ParagraphOutline({ essayId, paragraphs, paragraphOf, noteCounts, open, onToggle, onSelect, onReview, brief, settings, runSignal, onCheck }: Props) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    try { setSaved(readSaved(JSON.parse(localStorage.getItem(mapKey(essayId)) ?? "null"))); } catch {}
    return () => abort.current?.abort();
  }, []);
  const entries = paragraphs.map((p) => p.trim() && saved ? saved.map.paragraphs.find((e) => saved.paragraphs[e.paragraphId] === p) : undefined);
  const applies = entries.some(Boolean);
  const outdated = applies && paragraphs.some((p, i) => p.trim() && !entries[i]);
  // The Draft gate (docs/harness.md): the map names the planned claim each paragraph argues; draftGate counts.
  const planned = settings.plan.claims.filter((c) => c.claim.trim());
  const planKey = JSON.stringify(planned.map((c) => [c.id, c.claim.trim()]));
  const planChanged = applies && saved!.planKey !== planKey;
  const claimOf = (e: ArgumentMap["paragraphs"][number] | undefined) => e && e.planClaim >= 0 ? saved?.plan[e.planClaim] : undefined;
  const gate = draftGate(settings.plan, entries.flatMap((e) => claimOf(e) ?? []));
  // An edited paragraph may now carry a claim the map missed, so a failing gate over a stale map is unknown, not failed.
  const check: StageCheck | null = !planned.length ? null : {
    key: "plan", name: gate.checks[0].name, show: "Show the outline",
    state: !applies || planChanged || (outdated && !gate.pass) ? "unknown" : gate.pass ? "pass" : "fail",
    detail: !applies ? "Map the essay to check." : planChanged ? "Your plan changed since the map. Map again to check." : outdated && !gate.pass ? "Edited since the map. Map again to check." : gate.checks[0].detail,
  };
  const checkKey = JSON.stringify(check);
  useEffect(() => { onCheck?.(check); }, [checkKey]);
  const runMap = async () => {
    const claims = planned.map((c, id) => ({ id, claim: c.claim.trim().slice(0, 400) }));
    const body = { mode: "outline", paragraphs: paragraphs.map((text, id) => ({ id, text: text.slice(0, 15000) })).filter((p) => p.text.trim()), thesis: settings.thesis || undefined, brief: brief.slice(0, 20000) || undefined, claims: claims.length ? claims : undefined };
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setMapping(true); setError("");
    try {
      const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not map the essay.");
      const map = ArgumentMapResult.parse(result);
      const next = { paragraphs, map, at: Date.now(), plan: planned.map((c) => c.id), planKey };
      setSaved(next);
      try { localStorage.setItem(mapKey(essayId), JSON.stringify(next)); } catch {}
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (abort.current === controller) setMapping(false); }
  };
  const canMap = !mapping && paragraphs.some((p) => p.trim());
  useEffect(() => { if (runSignal && check && check.state === "unknown" && canMap) void runMap(); }, [runSignal]);
  return <nav className="doc-outline" data-open={open} aria-label="Paragraphs">
    <div className="doc-outline-head">
      <button className="doc-outline-toggle" aria-expanded={open} aria-controls="doc-outline-list" title={open ? "Hide paragraphs" : "Show paragraphs"} onClick={onToggle}><PenIcon name={open ? "chevron-left" : "menu"} size={18} /></button>
      {open && <h2>Paragraphs</h2>}
    </div>
    {open && error && <p className="doc-outline-error" role="alert">Map failed: {error}<KeyErrorLink error={error} /></p>}
    {open && <ol id="doc-outline-list">
      {!paragraphOf.some((start, i) => start === i) && <li className="muted">Paragraphs appear here as you write.</li>}
      {paragraphs.flatMap((p, i) => {
        // Only body paragraphs are listed; their block quotes and continuations count toward them.
        if (paragraphOf[i] !== i) return [];
        const n = paragraphOf.slice(0, i + 1).filter((start, j) => start === j).length;
        const count = paragraphOf.reduce((sum, start, j) => start === i ? sum + (noteCounts[j] ?? 0) : sum, 0);
        return [<li key={i} className="doc-outline-row">
          <button className="doc-outline-go" onClick={() => onSelect(i)} aria-label={`Paragraph ${n}: ${p.slice(0, 140)}`}>
            <span className="doc-outline-n">P{n}</span>
            <span className="doc-outline-text">{p.slice(0, 140)}</span>
          </button>
          {count > 0 && <button className="doc-outline-count" title={`Review ${count} open note${count === 1 ? "" : "s"} here`} aria-label={`Review ${count} note${count === 1 ? "" : "s"} in paragraph ${n}`}
            onClick={() => onReview(paragraphOf.findIndex((start, j) => start === i && (noteCounts[j] ?? 0) > 0))}>{count}</button>}
        </li>];
      })}
    </ol>}
  </nav>;
}
