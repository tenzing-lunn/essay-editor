"use client";

import { useEffect, useId, useState } from "react";
import type { RefObject } from "react";
import { aiFetch } from "@/lib/ai-client";
import { essayParagraphs, passageRange } from "@/lib/essay-document";
import { aiCheckKey, AI_LIKELY, AI_POSSIBLE, humanShare, scoreEssay, splitSentences } from "@/lib/ai-check";
import type { AiCheck as Check, Prediction, SentenceResult } from "@/lib/ai-check";
import EssayFixes from "@/components/EssayFixes";
import KeyErrorLink from "@/components/KeyErrorLink";
import PenIcon from "@/components/PenIcon";

type Props = { essayId: string; root: RefObject<HTMLDivElement | null>; shown: boolean; draft: string; loaded: boolean; onJump: (range: Range) => void; brief: string };
type SavedCheck = Check & { dismissed?: string[] };

const OPEN_KEY = "essay:ai-check-open"; // a UI preference, shared by every essay

function sentenceRange(root: HTMLElement, s: Pick<SentenceResult, "paragraphId" | "text">, quote = s.text) {
  const paragraph = essayParagraphs(root)[s.paragraphId];
  return (paragraph && passageRange(paragraph, quote)) ?? passageRange(root, quote);
}

const aiNote = (s: SentenceResult) => `This sentence reads as generic, AI-patterned writing${s.reasons.length ? ` (${s.reasons.join(" ")})` : ""}. Help the writer make it specific to their own argument and evidence: name the concrete detail, quotation or reasoning step it should carry instead, and how to vary its rhythm. Give guidance only; the writer will rewrite it in their own voice.`.slice(0, 5000);

export default function AiCheck({ essayId, root, shown, draft, brief, loaded, onJump }: Props) {
  const bodyId = useId();
  const [check, setCheck] = useState<SavedCheck | null>(null);
  const [previous, setPrevious] = useState<{ human: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [open, setOpenState] = useState(false);

  const setOpen = (value: boolean) => {
    setOpenState(value);
    try { localStorage.setItem(OPEN_KEY, value ? "1" : "0"); } catch {}
  };
  const save = (next: SavedCheck) => {
    setCheck(next);
    try { localStorage.setItem(aiCheckKey(essayId), JSON.stringify(next)); } catch {}
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(aiCheckKey(essayId)) ?? "null");
      if (saved && typeof saved.draft === "string" && Array.isArray(saved.sentences)) setCheck({ ...saved, dismissed: Array.isArray(saved.dismissed) ? saved.dismissed : [] });
      setOpenState(localStorage.getItem(OPEN_KEY) === "1");
    } catch { /* Start without a saved check. */ }
  }, []);

  // Sentences you have rewritten stop matching and lose their highlight until the next check.
  useEffect(() => {
    const el = root.current;
    if (!el || !("highlights" in CSS)) return;
    const paint = (name: string, ranges: (Range | null)[]) => CSS.highlights.set(name, new Highlight(...ranges.filter((r): r is Range => !!r)));
    const painted = shown && open && highlight && check ? check.sentences.filter((s) => !check.dismissed?.includes(s.text)) : [];
    paint("ai-likely", painted.filter((s) => s.score >= AI_LIKELY).map((s) => sentenceRange(el, s)));
    paint("ai-possible", painted.filter((s) => s.score >= AI_POSSIBLE && s.score < AI_LIKELY).map((s) => sentenceRange(el, s)));
    paint("ai-phrase", painted.filter((s) => s.score >= AI_POSSIBLE).flatMap((s) => [...s.phrases, ...(s.stylePhrases ?? [])].map((p) => sentenceRange(el, s, p))));
  }, [root, check, draft, highlight, open, shown]);
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
      // The trained detector runs here in the browser, so the check works (and costs nothing) even when the model call below can't run.
      const [{ detect }, { DETECTOR_MODEL }] = await Promise.all([import("@/lib/ai-detector"), import("@/lib/ai-detector-model")]);
      const detection = detect(DETECTOR_MODEL, sentences);
      // Reuse wording scores for sentences you haven't changed, so only your edits move the result.
      const cache = new Map<string, Omit<Prediction, "id">>(check?.sentences.filter((s) => s.scored).map((s) => [s.text, { predictability: s.predictability, phrases: s.phrases, note: s.note }]));
      const targets = sentences.filter((s) => !cache.has(s.text)).map((s) => s.id);
      if (targets.length) {
        try {
          const response = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
            mode: "aicheck", targets, sentences: sentences.map(({ id, paragraphId, text }) => ({ id, paragraphId, text })),
          }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          for (const p of data.sentences as Prediction[]) cache.set(sentences[p.id].text, p);
        } catch (e) {
          setError(`Scored by the local detector only; the wording notes didn't load. ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const next = scoreEssay(snapshot, sentences, cache, { rescored: targets.length, reused: sentences.length - targets.length }, { detection, model: DETECTOR_MODEL });
      const prev = check && humanShare(check);
      setPrevious(prev ? { human: prev.human } : null);
      save({ ...next, dismissed: (check?.dismissed ?? []).filter((t) => sentences.some((s) => s.text === t)) });
      setOpen(true);
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
  const dismiss = (s: SentenceResult) => { if (check) save({ ...check, dismissed: [...(check.dismissed ?? []), s.text] }); };
  const clear = () => {
    setCheck(null); setPrevious(null); setError(null); setOpen(false);
    try { localStorage.removeItem(aiCheckKey(essayId)); } catch {}
  };

  const share = check && draft.trim() ? humanShare(check) : null; // a new or emptied essay has no score to show
  // Lead with a verdict, like GPTZero: a bare percentage reads as a probability, which this is not.
  // With the detector, the stronger of its essay verdict and the flagged share decides, so the headline never contradicts the flags below it.
  const level = share && Math.max(share.ai < 15 ? 0 : share.ai < 50 ? 1 : 2, check?.detector ? { human: 0, mixed: 1, ai: 2 }[check.detector.label] : 0);
  const verdict = share && (check?.detector
    ? ["Likely human-written", "Possibly AI-assisted", "Likely AI-generated"][level ?? 0]
    : ["Likely human-written", "Some AI-like passages", "Many AI-like passages"][level ?? 0]);
  const headline = share && `${share.human}% human · ${share.ai}% flagged`;
  const list = check?.sentences.filter((s) => s.score >= AI_POSSIBLE && !check.dismissed?.includes(s.text) && draft.includes(s.text))
    .sort((a, b) => a.paragraphId - b.paragraphId || a.id - b.id) ?? [];
  const longest = Math.max(1, ...(check?.sentences.map((s) => s.words) ?? []));

  return (
    <section className="ai-check" aria-label="AI-sounding writing check">
      <button className="ai-check-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span>AI-sounding writing check{share ? ` · ${share.human}% human` : ""}</span>
        <PenIcon name="chevron-right" className="ai-check-chevron" />
      </button>
      <div id={bodyId} className="ai-check-body" hidden={!open}>
        {share && headline && <>
          <p className="ai-headline">{verdict}</p>
          <p className="ai-share">{headline}</p>
          <div className="ai-bar" role="img" aria-label={headline}>
            <span className="ai-bar-human" style={{ width: `${share.human}%` }} />
            <span className="ai-bar-ai" style={{ width: `${share.ai}%` }} />
          </div>
          <p className="muted ai-meta">
            <span title="A detector trained on thousands of human and AI-written essays scores each sentence with its neighbors, set so that few human essays are flagged; stock chatbot phrasing found by the AI can raise a sentence. Formal academic writing alone is not flagged.">Estimate, not proof.</span>
            {previous && <span> Last check: {previous.human}% human</span>}
          </p>
        </>}
        <div className="ai-check-run">
          <button disabled={!loaded || running || !draft.trim()} onClick={() => void run()}
            title={check ? `Scored ${check.rescored} new or edited, reused ${check.reused} unchanged` : undefined}>
            {running ? "Checking…" : check ? "Check again" : "Check for AI patterns"}
          </button>
          {check && <button onClick={clear}>Clear results</button>}
          {check && check.draft !== draft && <span className="warn">Edited since this check</span>}
        </div>
        <div aria-live="polite">{error && <p className="error">{error}<KeyErrorLink error={error} /></p>}</div>
        {check && <>
          <details className="ai-how">
            <summary>How it’s scored</summary>
            <div className="ai-scores">
              {check.detector && <div><b>{Math.round(check.detector.probability * 100)}%</b><span>Style detector: AI likelihood</span></div>}
              <div><b>{check.predictability}</b><span>AI tells (0–100)</span></div>
              <div><b>{check.burstiness.variation.toFixed(2)}</b><span>Length variation{check.burstiness.score >= AI_POSSIBLE ? " · low" : ""}</span></div>
            </div>
            <figure className="ai-lengths" aria-label="Sentence lengths in order">
              <div>
                {check.sentences.map((s, i) => <span key={s.id} title={`${s.words} words`} data-level={s.score >= AI_LIKELY ? "likely" : s.score >= AI_POSSIBLE ? "possible" : undefined}
                  className={i > 0 && check.sentences[i - 1].paragraphId !== s.paragraphId ? "new-paragraph" : undefined} style={{ height: `${(s.words / longest) * 100}%` }} />)}
              </div>
              <figcaption className="muted">Sentence lengths</figcaption>
            </figure>
          </details>
          <label className="checklist-item"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />Show in essay</label>
          {!list.length && <p className="muted">No sentences flagged.</p>}
          {list.map((s) => (
            <div key={s.id} className="issue ai-flag" data-level={s.score >= AI_LIKELY ? "likely" : "possible"}>
              <div className="ai-flag-top">
                <span className="ai-tag">{s.score >= AI_LIKELY ? "Strong pattern" : "Some pattern"}</span>
                <button onClick={() => dismiss(s)}>Dismiss</button>
              </div>
              <button className="issue-location" onClick={() => jump(s)} aria-label={`Show sentence: ${s.text}`}><q className="mark-quote">{s.text.length > 140 ? `${s.text.slice(0, 140)}…` : s.text}</q></button>
              {s.reasons.length > 0 && <ul>{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              <EssayFixes issue={{ quote: s.text, note: aiNote(s) }} draft={draft} brief={brief} />
            </div>
          ))}
        </>}
      </div>
    </section>
  );
}
