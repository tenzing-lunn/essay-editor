"use client";

import { useEffect, useRef, useState } from "react";
import { aiFetch } from "@/lib/ai-client";
import { ArgumentMapResult, type ArgumentMap } from "@/lib/argument-map";
import type { EssaySettings } from "@/lib/essay-document";
import KeyErrorLink from "@/components/KeyErrorLink";

type Props = {
  paragraphs: string[]; paragraphOf: number[]; active: number; issueCounts: number[]; open: boolean;
  onToggle: () => void; onSelect: (index: number) => void; onShowAll: () => void;
  brief: string; settings: EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
};
type Saved = { paragraphs: string[]; map: ArgumentMap; at: number };
const MAP_KEY = "essay:argument-map:v1";
const MARKS = { thesis: "★", supports: "●", partial: "◐", drifts: "○", frame: "▫" };

function readSaved(value: unknown): Saved | null {
  const v = value as Saved | null;
  const map = ArgumentMapResult.safeParse(v?.map);
  return v && Array.isArray(v.paragraphs) && v.paragraphs.every((p) => typeof p === "string") && map.success ? { paragraphs: v.paragraphs, map: map.data, at: Number(v.at) || 0 } : null;
}

/** Table of contents for the essay: one entry per paragraph, beside the page. */
export default function ParagraphOutline({ paragraphs, paragraphOf, active, issueCounts, open, onToggle, onSelect, onShowAll, brief, settings, updateSettings }: Props) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    try { setSaved(readSaved(JSON.parse(localStorage.getItem(MAP_KEY) ?? "null"))); } catch {}
    return () => abort.current?.abort();
  }, []);
  const entries = paragraphs.map((p) => p.trim() && saved ? saved.map.paragraphs.find((e) => saved.paragraphs[e.paragraphId] === p) : undefined);
  const applies = entries.some(Boolean);
  const outdated = applies && paragraphs.some((p, i) => p.trim() && !entries[i]);
  const mapThesis = applies ? saved!.map.thesis : "";
  const thesis = settings.thesis || mapThesis;
  const runMap = async () => {
    const body = { mode: "outline", paragraphs: paragraphs.map((text, id) => ({ id, text: text.slice(0, 15000) })).filter((p) => p.text.trim()), thesis: settings.thesis || undefined, brief: brief.slice(0, 20000) || undefined };
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setMapping(true); setError("");
    try {
      const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not map the essay.");
      const map = ArgumentMapResult.parse(result);
      const next = { paragraphs, map, at: Date.now() };
      setSaved(next);
      try { localStorage.setItem(MAP_KEY, JSON.stringify(next)); } catch {}
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (abort.current === controller) setMapping(false); }
  };
  const canMap = !mapping && paragraphs.some((p) => p.trim());
  return <nav className="doc-outline" data-open={open} aria-label="Paragraph outline">
    <div className="doc-outline-head">
      <button className="doc-outline-toggle" aria-expanded={open} aria-controls="doc-outline-list" title={open ? "Hide paragraph outline" : "Show paragraph outline"} onClick={onToggle}>{open ? "‹" : "☰"}</button>
      {open && <h2>Paragraphs</h2>}
      {open && <button className="doc-outline-map" disabled={!canMap} title="Summarize each paragraph’s claim and check it against your thesis (uses AI)" onClick={() => void runMap()}>{mapping ? "Mapping…" : "Map"}</button>}
      {open && active >= 0 && <button className="doc-outline-all" onClick={onShowAll}>Show full essay</button>}
      {open && outdated && !mapping && <p className="doc-outline-stale">Out of date · <button disabled={!canMap} onClick={() => void runMap()}>Update</button></p>}
    </div>
    {open && error && <p className="doc-outline-error" role="alert">Map failed: {error}<KeyErrorLink error={error} /></p>}
    {open && applies && <p className="doc-outline-legend muted" aria-hidden="true">{MARKS.thesis} thesis · {MARKS.supports} supports · {MARKS.partial} partly · {MARKS.drifts} drifts · {MARKS.frame} frame</p>}
    {open && thesis && <div className="doc-outline-thesis">
      <span className="doc-outline-thesis-label">Thesis</span>
      <span className="doc-outline-thesis-text" title={thesis}>{thesis}</span>
      {settings.thesis
        ? <button aria-label="Unpin thesis" title="Unpin thesis" onClick={() => updateSettings((s) => ({ ...s, thesis: "" }))}>×</button>
        : <button title="Pin this thesis" onClick={() => updateSettings((s) => ({ ...s, thesis: mapThesis.slice(0, 2000) }))}>Pin</button>}
    </div>}
    {open && <ol id="doc-outline-list">
      {!paragraphOf.some((start, i) => start === i) && <li className="muted">Paragraphs appear here as you write.</li>}
      {paragraphs.flatMap((p, i) => {
        // Only body paragraphs are listed; their block quotes and continuations count toward them.
        if (paragraphOf[i] !== i) return [];
        const n = paragraphOf.slice(0, i + 1).filter((start, j) => start === j).length;
        const entry = entries[i]; const preview = p.slice(0, 140);
        const count = paragraphOf.reduce((sum, start, j) => start === i ? sum + (issueCounts[j] ?? 0) : sum, 0);
        const rows = [];
        if (entry?.transition) rows.push(<li key={`t${i}`} className="doc-outline-link" title={entry.transition}>↯ weak link<span className="doc-outline-sr">: {entry.transition}</span></li>);
        rows.push(<li key={i}>
          <button aria-current={active >= 0 && paragraphOf[active] === i ? "true" : undefined} onClick={() => onSelect(i)}
            aria-label={`Paragraph ${n}: ${entry?.claim || preview}${entry ? ", " + entry.relation : ""}${count ? `, ${count} suggestions` : ""}`}>
            <span className="doc-outline-n">P{n}</span>
            <span className="doc-outline-text">
              {entry && <span className="doc-outline-mark" data-relation={entry.relation} title={entry.note || entry.relation}>{MARKS[entry.relation]}</span>}
              {applies && !entry && p.trim() && <span className="doc-outline-edited" title="Edited since mapping" />}
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
