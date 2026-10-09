"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { aiFetch } from "@/lib/ai-client";
import { essayParagraphs, passageRange } from "@/lib/essay-document";
import { AI_CHECK_KEY, AI_LIKELY, AI_POSSIBLE, scoreEssay, splitSentences } from "@/lib/ai-check";
import type { AiCheck as Check, Prediction, SentenceResult } from "@/lib/ai-check";

type Props = { root: RefObject<HTMLDivElement | null>; draft: string; loaded: boolean; onJump: (range: Range) => void };

const flagged = (c: Check) => c.sentences.filter((s) => s.score >= AI_POSSIBLE).length;
const band = (score: number) => score >= AI_LIKELY ? "Strong AI patterns" : score >= AI_POSSIBLE ? "Some AI patterns" : "Reads as human";

function sentenceRange(root: HTMLElement, s: Pick<SentenceResult, "paragraphId" | "text">, quote = s.text) {
  const paragraph = essayParagraphs(root)[s.paragraphId];
  return (paragraph && passageRange(paragraph, quote)) ?? passageRange(root, quote);
}

export default function AiCheck({ root, draft, loaded, onJump }: Props) {
  const [check, setCheck] = useState<Check | null>(null);
  const [previous, setPrevious] = useState<{ score: number; flagged: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(true);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AI_CHECK_KEY) ?? "null");
      if (saved && typeof saved.draft === "string" && Array.isArray(saved.sentences)) setCheck(saved);
    } catch { /* Start without a saved check. */ }
  }, []);

  // Sentences you have rewritten stop matching and lose their highlight until the next check.
  useEffect(() => {
    const el = root.current;
    if (!el || !("highlights" in CSS)) return;
    const paint = (name: string, ranges: (Range | null)[]) => CSS.highlights.set(name, new Highlight(...ranges.filter((r): r is Range => !!r)));
    const shown = highlight && check ? check.sentences : [];
    paint("ai-likely", shown.filter((s) => s.score >= AI_LIKELY).map((s) => sentenceRange(el, s)));
    paint("ai-possible", shown.filter((s) => s.score >= AI_POSSIBLE && s.score < AI_LIKELY).map((s) => sentenceRange(el, s)));
    paint("ai-phrase", shown.filter((s) => s.score >= AI_POSSIBLE).flatMap((s) => s.phrases.map((p) => sentenceRange(el, s, p))));
  }, [root, check, draft, highlight]);
  useEffect(() => () => { if ("highlights" in CSS) ["ai-likely", "ai-possible", "ai-phrase"].forEach((n) => CSS.highlights.delete(n)); }, []);

  const run = async () => {
    const el = root.current;
    if (!el || running) return;
    const snapshot = el.innerText;
    // Block quotations are source text, not your writing; blank them so paragraph numbers still line up.
    const quoted = (p: HTMLElement) => p.tagName === "BLOCKQUOTE" || parseFloat(getComputedStyle(p).marginLeft) > 0;
    const sentences = splitSentences(essayParagraphs(el).map((p) => quoted(p) ? "" : p.innerText.trim()));
    if (sentences.length < 3) { setError("Write at least three sentences before checking."); return; }
    setRunning(true); setError(null);
    try {
      // Reuse scores for sentences you haven't changed, so only your edits move the result.
      const cache = new Map<string, Omit<Prediction, "id">>(check?.sentences.map((s) => [s.text, { predictability: s.predictability, phrases: s.phrases, note: s.note }]));
      const targets = sentences.filter((s) => !cache.has(s.text)).map((s) => s.id);
      if (targets.length) {
        const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          mode: "aicheck", targets, sentences: sentences.map(({ id, paragraphId, text }) => ({ id, paragraphId, text })),
        }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        for (const p of data.sentences as Prediction[]) cache.set(sentences[p.id].text, p);
      }
      const next = scoreEssay(snapshot, sentences, cache, { rescored: targets.length, reused: sentences.length - targets.length });
      setPrevious(check ? { score: check.score, flagged: flagged(check) } : null);
      setCheck(next);
      try { localStorage.setItem(AI_CHECK_KEY, JSON.stringify(next)); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const jump = (s: SentenceResult) => {
    const range = root.current && sentenceRange(root.current, s);
    if (range) onJump(range); else setError("This sentence has changed since the check. Re-check to score the new version.");
  };

  const list = check?.sentences.filter((s) => s.score >= AI_POSSIBLE).sort((a, b) => b.score - a.score) ?? [];
  const longest = Math.max(1, ...(check?.sentences.map((s) => s.words) ?? []));

  return (
    <section className="ai-check" aria-label="AI writing check">
      <div className="live-check-heading">
        <h2>AI writing check</h2>
        <button disabled={!loaded || running || !draft.trim()} onClick={() => void run()}>
          {running ? "Checking…" : check ? "Re-check with my changes" : "Check for AI patterns"}
        </button>
      </div>
      <p className="muted">Scores two signals detectors use: <b>predictability</b> (would a model choose these words in this order?) and <b>burstiness</b> (do sentence lengths and openings vary?). Skips your heading, title and block quotations. It is an estimate, not proof; plain or formal human writing can score high.</p>
      <div aria-live="polite">
        {error && <p className="error">{error}</p>}
        {check && check.draft !== draft && <p className="warn">You’ve edited since this check. Re-check to score your changes; unchanged sentences keep their scores.</p>}
      </div>
      {check && <>
        <div className="ai-scores">
          <div><span className="ai-score" data-band={band(check.score)}>{check.score}</span><span>{band(check.score)}</span></div>
          <div><b>{check.predictability}</b><span>Predictability</span></div>
          <div><b>{check.burstiness.variation.toFixed(2)}</b><span>Length variation{check.burstiness.score >= AI_POSSIBLE ? " · low" : ""}</span></div>
        </div>
        {previous && <p className="muted">Last check {previous.score} → now {check.score} ({check.score - previous.score > 0 ? "+" : ""}{check.score - previous.score}) · flagged sentences {previous.flagged} → {flagged(check)}</p>}
        <p className="muted">{check.rescored ? `Scored ${check.rescored} new or edited sentence${check.rescored === 1 ? "" : "s"}` : "No sentences changed"}{check.reused ? `; kept scores for ${check.reused} unchanged` : ""}.</p>
        <figure className="ai-lengths" aria-label="Sentence lengths in order">
          <div>
            {check.sentences.map((s, i) => <span key={s.id} title={`${s.words} words`} data-level={s.score >= AI_LIKELY ? "likely" : s.score >= AI_POSSIBLE ? "possible" : undefined}
              className={i > 0 && check.sentences[i - 1].paragraphId !== s.paragraphId ? "new-paragraph" : undefined} style={{ height: `${(s.words / longest) * 100}%` }} />)}
          </div>
          <figcaption className="muted">Sentence lengths in order. Even bars mean flat rhythm; human writing usually mixes short and long.</figcaption>
        </figure>
        <label className="checklist-item"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />Highlight in essay (orange = likely, yellow = possible, dotted = predictable phrase)</label>
        {!list.length && <p className="muted">No sentences flagged.</p>}
        {list.map((s) => (
          <div key={s.id} className="issue ai-flag" data-level={s.score >= AI_LIKELY ? "likely" : "possible"}>
            <div className="issue-heading">
              <button className="issue-location" onClick={() => jump(s)} aria-label={`Show sentence: ${s.text}`}><q>{s.text.length > 140 ? `${s.text.slice(0, 140)}…` : s.text}</q></button>
              <span className="muted">{s.score}</span>
            </div>
            <ul>{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ))}
      </>}
    </section>
  );
}
