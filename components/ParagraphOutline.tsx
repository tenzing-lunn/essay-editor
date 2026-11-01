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
  essayId: string; paragraphs: string[]; paragraphOf: number[]; active: number; issueCounts: number[]; open: boolean;
  onToggle: () => void; onSelect: (index: number) => void; onShowAll: () => void;
  brief: string; settings: EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
  /** Bumped by the full read (Check my essay): maps once unless the map already covers these paragraphs and this plan. */
  runSignal?: number;
  /** The Draft gate as a check in the full read; null without planned claims. */
  onCheck?: (check: StageCheck | null) => void;
};
// plan maps each planned-claim number the map was sent back to its plan row; planKey says what those claims were.
type Saved = { paragraphs: string[]; map: ArgumentMap; at: number; plan: string[]; planKey: string };
const mapKey = (essayId: string) => `essay:argument-map:v1:${essayId}`;
// How each paragraph relates to the thesis, as a drawn pen mark (coloured by .doc-outline-mark[data-relation]).
const MARKS = { thesis: "star", supports: "tick", partial: "half", drifts: "wave", frame: "bracket" } as const;
const RELATIONS = [["thesis", "thesis"], ["supports", "supports"], ["partial", "partly"], ["drifts", "drifts"], ["frame", "frame"]] as const;

function readSaved(value: unknown): Saved | null {
  const v = value as Saved | null;
  // Maps saved before the plan existed have no planClaim; they read as matching no planned claim.
  const map = ArgumentMapResult.safeParse(v?.map && { ...v.map, paragraphs: Array.isArray(v.map.paragraphs) ? v.map.paragraphs.map((p) => ({ ...p, planClaim: typeof p.planClaim === "number" ? p.planClaim : -1 })) : v.map.paragraphs });
  return v && Array.isArray(v.paragraphs) && v.paragraphs.every((p) => typeof p === "string") && map.success
    ? { paragraphs: v.paragraphs, map: map.data, at: Number(v.at) || 0, plan: Array.isArray(v.plan) ? v.plan.map(String) : [], planKey: typeof v.planKey === "string" ? v.planKey : "" } : null;
}

/** Table of contents for the essay: one entry per paragraph, beside the page. */
export default function ParagraphOutline({ essayId, paragraphs, paragraphOf, active, issueCounts, open, onToggle, onSelect, onShowAll, brief, settings, updateSettings, runSignal, onCheck }: Props) {
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
  const mapThesis = applies ? saved!.map.thesis : "";
  const thesis = settings.thesis || mapThesis;
  // The Draft gate (docs/harness.md): the map names the planned claim each paragraph argues; draftGate counts.
  const planned = settings.plan.claims.filter((c) => c.claim.trim());
  const planKey = JSON.stringify(planned.map((c) => [c.id, c.claim.trim()]));
  const planChanged = applies && saved!.planKey !== planKey;
  const claimOf = (e: ArgumentMap["paragraphs"][number] | undefined) => e && e.planClaim >= 0 ? saved?.plan[e.planClaim] : undefined;
  const claimNumber = (id: string | undefined) => id ? settings.plan.claims.findIndex((c) => c.id === id) + 1 : 0;
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
  return <nav className="doc-outline" data-open={open} aria-label="Paragraph outline">
    <div className="doc-outline-head">
      <button className="doc-outline-toggle" aria-expanded={open} aria-controls="doc-outline-list" title={open ? "Hide paragraph outline" : "Show paragraph outline"} onClick={onToggle}><PenIcon name={open ? "chevron-left" : "menu"} size={18} /></button>
      {open && <h2>Paragraphs</h2>}
      {open && <button className="doc-outline-map" disabled={!canMap} title="Summarize each paragraph’s claim and check it against your thesis and plan (uses AI)" onClick={() => void runMap()}>{mapping ? "Mapping…" : "Map"}</button>}
      {open && active >= 0 && <button className="doc-outline-all" onClick={onShowAll}>Show full essay</button>}
      {open && outdated && !mapping && <p className="doc-outline-stale">Out of date · <button disabled={!canMap} onClick={() => void runMap()}>Update</button></p>}
    </div>
    {open && error && <p className="doc-outline-error" role="alert">Map failed: {error}<KeyErrorLink error={error} /></p>}
    {open && applies && <p className="doc-outline-legend muted" aria-hidden="true">{RELATIONS.map(([relation, label]) => <span key={relation}><span className="doc-outline-mark" data-relation={relation}><PenIcon name={MARKS[relation]} size={14} /></span>{label}</span>)}</p>}
    {open && thesis && <div className="doc-outline-thesis">
      <span className="doc-outline-thesis-label">Thesis</span>
      <span className="doc-outline-thesis-text" title={thesis}>{thesis}</span>
      {settings.thesis
        ? <button aria-label="Unpin thesis" title="Unpin thesis" onClick={() => updateSettings((s) => ({ ...s, thesis: "" }))}><PenIcon name="close" /></button>
        : <button title="Pin this thesis" onClick={() => updateSettings((s) => ({ ...s, thesis: mapThesis.slice(0, 2000) }))}>Pin</button>}
    </div>}
    {open && check && <div className="doc-outline-gate" data-state={check.state}>
      {check.state !== "unknown" && <PenIcon name={check.state === "pass" ? "tick" : "cross"} size={16} />}
      <p><span className="doc-outline-gate-name">{check.name}</span>
        <span className="doc-outline-gate-detail">{check.detail}</span></p>
    </div>}
    {open && <ol id="doc-outline-list">
      {!paragraphOf.some((start, i) => start === i) && <li className="muted">Paragraphs appear here as you write.</li>}
      {paragraphs.flatMap((p, i) => {
        // Only body paragraphs are listed; their block quotes and continuations count toward them.
        if (paragraphOf[i] !== i) return [];
        const n = paragraphOf.slice(0, i + 1).filter((start, j) => start === j).length;
        const entry = entries[i]; const preview = p.slice(0, 140);
        const argues = planChanged ? 0 : claimNumber(claimOf(entry));
        const count = paragraphOf.reduce((sum, start, j) => start === i ? sum + (issueCounts[j] ?? 0) : sum, 0);
        const rows = [];
        if (entry?.transition) rows.push(<li key={`t${i}`} className="doc-outline-link" title={entry.transition}><PenIcon name="bolt" size={14} />weak link<span className="doc-outline-sr">: {entry.transition}</span></li>);
        rows.push(<li key={i}>
          <button aria-current={active >= 0 && paragraphOf[active] === i ? "true" : undefined} onClick={() => onSelect(i)}
            aria-label={`Paragraph ${n}: ${entry?.claim || preview}${entry ? ", " + entry.relation : ""}${argues ? `, argues planned claim ${argues}` : ""}${count ? `, ${count} suggestions` : ""}`}>
            <span className="doc-outline-n">P{n}</span>
            <span className="doc-outline-text">
              {entry && <span className="doc-outline-mark" data-relation={entry.relation} title={entry.note || entry.relation}><PenIcon name={MARKS[entry.relation]} size={14} /></span>}
              {applies && !entry && p.trim() && <span className="doc-outline-edited" title="Edited since mapping" />}
              {argues > 0 && <span className="doc-outline-claim" title={`Argues planned claim ${argues}`}>C{argues}</span>}
              {entry?.claim || preview}
            </span>
            {count > 0 && <span className="count-badge" title={`${count} open suggestion${count === 1 ? "" : "s"}`}>{count}</span>}
          </button>
        </li>);
        return rows;
      })}
    </ol>}
  </nav>;
}
