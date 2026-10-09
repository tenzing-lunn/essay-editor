"use client";

import { aiFetch } from "@/lib/ai-client";

import { ParagraphFocus } from "@/components/ParagraphFocus";
import type { FocusHandle } from "@/components/ParagraphFocus";
import { documentHtml, downloadEssay, essayParagraphs, EMPTY_ESSAY_SETTINGS } from "@/lib/essay-document";
import type { EssaySettings } from "@/lib/essay-document";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiResult, LiveResult, ReviewResult } from "@/lib/claude";
import { cleanHtml, textToHtml } from "@/lib/paste";
import { ISSUE_CATEGORIES, LIVE_CHECK_KEY, readLiveCheck } from "@/lib/essay-issues";
import type { LiveCheck, LiveIssue } from "@/lib/essay-issues";
import { ANTIGONE_VIEWER } from "@/lib/antigone";
import type { BookQuote } from "@/lib/antigone";
import EssaySuggestion from "@/components/EssaySuggestion";
import EssayFixes from "@/components/EssayFixes";
import EssayRevisionTasks from "@/components/EssayRevisionTasks";
import AiCheck from "@/components/AiCheck";
import { EssaySettingsSchema, essayContext, followParagraphNotes, mergeRevisionTasks } from "@/lib/essay-workflow";
import type { RevisionTask, SourceCheck } from "@/lib/essay-workflow";
import type { FocusAnalysis } from "@/lib/essay-focus";
import { readDraft, readVersion, writeDraft } from "@/lib/draft-store";
import type { VersionInfo } from "@/lib/draft-store";

type Issue = { quote: string; note: string; paragraphId?: number };
const RECOVERY_KEY = "finals:essay-recovery:v2";
const REVISION_ORDER = ["Structure", "Analysis", "Use of evidence", "Factual accuracy", "Clarity", "Grammar", "Wrong word"] as const;
type Toolbar = { x: number; y: number } | null;

const REVIEW_EVERY_MS = 3 * 60_000;
const FONTS = ["Times New Roman", "Arial", "Georgia", "Calibri", "Garamond", "Helvetica"];
const SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36];
const SPACING = [1, 1.15, 1.5, 2]; // Google Docs exports line spacing × 1.2 as CSS line-height
const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, blockquote";

/** Find `quote` inside the editor's text nodes and return a Range, or null. */
function findRange(root: HTMLElement, quote: string, paragraphId?: number): Range | null {
  const scope = paragraphId === undefined ? root : essayParagraphs(root)[paragraphId];
  if (!scope || !quote.trim()) return null;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let full = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    full += (n as Text).data;
  }
  const start = full.indexOf(quote);
  if (start < 0 || full.indexOf(quote, start + 1) >= 0) return null;
  const end = start + quote.length;
  const range = document.createRange();
  let pos = 0;
  for (const node of nodes) {
    const next = pos + node.data.length;
    if (start >= pos && start < next) range.setStart(node, start - pos);
    if (end > pos && end <= next) { range.setEnd(node, end - pos); break; }
    pos = next;
  }
  return range;
}

async function ai<T>(body: object): Promise<T> {
  const r = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}

export default function EssayPage() {
  const editorRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<FocusHandle>(null);
  const serverRevision = useRef("");
  const editRevision = useRef(0);
  const dirty = useRef(false);
  const loadedRef = useRef(false);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  const restoreRunning = useRef(false);
  const briefRef = useRef("");
  const settingsRef = useRef<EssaySettings>(EMPTY_ESSAY_SETTINGS);
  const [feedbackVisible, setFeedbackVisible] = useState(true);
  const [reviewBriefSnapshot, setReviewBriefSnapshot] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<EssaySettings>(EMPTY_ESSAY_SETTINGS);
  const [recovery, setRecovery] = useState<{ html: string; brief: string; settings: EssaySettings; revision?: string } | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [preview, setPreview] = useState<{ html: string; brief: string; settings: EssaySettings; updatedAt: number } | null>(null);
  const [focusedParagraph, setFocusedParagraph] = useState("");
  const previousParagraphs = useRef<string[]>([]);
  const [checkingSources, setCheckingSources] = useState(false);
  const sourceRunning = useRef(false);
  const [sourceCheckContext, setSourceCheckContext] = useState<string | null>(null);
  const [sourceCheckCount, setSourceCheckCount] = useState(0);
  const [reviewDraftSnapshot, setReviewDraftSnapshot] = useState("");
  const reviewRunning = useRef(false);
  const resultSource = useRef<{ quote: string; range: Range; draft: string; brief: string } | null>(null);
  const savedRange = useRef<Range | null>(null); // last selection inside the editor
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReviewed = useRef("");
  const liveRunning = useRef(false);
  const quoteRunning = useRef(false);

  const [brief, setBrief] = useState("");
  const [words, setWords] = useState(0);
  const [status, setStatus] = useState<"loading" | "saved" | "unsaved" | "saving" | "error">("loading");
  const [toolbar, setToolbar] = useState<Toolbar>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [autoReview, setAutoReview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [liveCheck, setLiveCheck] = useState<LiveCheck | null>(null);
  const [draftText, setDraftText] = useState("");
  const [documentRevision, setDocumentRevision] = useState(0);
  const liveIssues = liveCheck?.issues.filter((i) => !i.resolved) ?? [];
  const resolvedCount = liveCheck?.issues.filter((i) => i.resolved).length ?? 0;
  const [checking, setChecking] = useState(0);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [formatReady, setFormatReady] = useState(false);
  const [fmt, setFmt] = useState({ font: "Times New Roman", size: "12", spacing: "2", align: "left", bold: false, italic: false, underline: false });
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteResults, setQuoteResults] = useState<{ quotes: BookQuote[]; total: number; query: string } | null>(null);
  const [findingQuotes, setFindingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [copiedQuote, setCopiedQuote] = useState<string | null>(null);

  const findQuotes = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = quoteQuery.trim();
    if (!query || quoteRunning.current) return;
    quoteRunning.current = true;
    setFindingQuotes(true);
    setQuoteError(null);
    setQuoteResults(null);
    setCopiedQuote(null);
    try {
      const response = await fetch(`/api/quotes?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setQuoteResults({ ...data, query });
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Could not look up quotes.");
    } finally {
      quoteRunning.current = false;
      setFindingQuotes(false);
    }
  };

  const copyQuote = async (quote: BookQuote) => {
    try {
      await navigator.clipboard.writeText(`“${quote.text}” (Sophocles, Antigone ${quote.reference}; trans. Richard Jebb)`);
      setCopiedQuote(quote.reference);
    } catch {
      setQuoteError("Could not copy automatically. Select and copy the passage below.");
    }
  };

  const text = () => editorRef.current?.innerText ?? "";
  const paragraphs = () => editorRef.current ? essayParagraphs(editorRef.current) : [];

  // A check is a snapshot. Editing and resolving never trigger another request.
  const runLive = async (grammarOnly = false) => {
    if (liveRunning.current) return;
    const draft = text();
    const paras = paragraphs().map((p) => p.innerText.trim()).filter(Boolean);
    if (!paras.length && draft.trim()) paras.push(draft.trim());
    if (!paras.length) return;
    liveRunning.current = true;
    setChecking(paras.length);
    setError(null);
    try {
      const thesis = paras.slice(0, 2).join("\n\n");
      const issues: LiveIssue[] = [];
      // Limit concurrency so long essays don't flood the API.
      let next = 0;
      const workers = await Promise.allSettled(Array.from({ length: Math.min(3, paras.length) }, async () => {
        while (next < paras.length) {
          const paragraphId = next++;
          const paragraph = paras[paragraphId];
          try {
            const r = await ai<LiveResult>({ mode: "live", paragraph, thesis, grammarOnly });
            for (const issue of r.issues) {
              if (issue.quote.trim() && paragraph.includes(issue.quote)) {
                issues.push({ ...issue, id: crypto.randomUUID(), resolved: false, paragraphId });
              }
            }
          } finally {
            setChecking((n) => Math.max(0, n - 1));
          }
        }
      }));
      const failure = workers.find((worker) => worker.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      issues.sort((a, b) => draft.indexOf(a.quote) - draft.indexOf(b.quote));
      setLiveCheck({ draft, issues });
      setActiveIssue(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      liveRunning.current = false;
      setChecking(0);
    }
  };

  const resolveLive = (issue: LiveIssue, disposition: "accepted" | "declined" | "resolved" = "resolved") => {
    setLiveCheck((check) => check && ({ ...check, issues: check.issues.map((i) => i.id === issue.id ? { ...i, resolved: true, disposition } : i) }));
    if (activeIssue === issue) setActiveIssue(null);
  };

  // ---------- load / save ----------
  const loadDraft = useCallback(async () => {
    setStatus("loading"); setError(null); setLoaded(false); loadedRef.current = false;
    try {
      const data = await readDraft();
      if (editorRef.current) editorRef.current.innerHTML = cleanHtml(data.html);
      previousParagraphs.current = editorRef.current ? essayParagraphs(editorRef.current).map((p) => p.innerText.trim()) : [];
      serverRevision.current = data.revision;
      briefRef.current = data.brief; setBrief(briefRef.current);
      settingsRef.current = EssaySettingsSchema.parse(data.settings ?? EMPTY_ESSAY_SETTINGS); setSettings(settingsRef.current);
      setVersions(data.versions); setWords(countWords(text())); setDraftText(text()); setStatus("saved");
      setDocumentRevision((revision) => revision + 1);
      dirty.current = false; loadedRef.current = true; setLoaded(true);
      try {
        setLiveCheck(readLiveCheck(localStorage.getItem(LIVE_CHECK_KEY)));
        const raw = localStorage.getItem(RECOVERY_KEY);
        if (raw) { const local = JSON.parse(raw); if (typeof local.html === "string" && typeof local.brief === "string" && typeof local.settings?.targetWords === "number" && Array.isArray(local.settings.notes) && local.settings.checklist && (local.html !== documentHtml(editorRef.current) || local.brief !== briefRef.current || JSON.stringify(local.settings) !== JSON.stringify(settingsRef.current))) setRecovery(local); }
      } catch { /* Editing remains usable if local storage is unavailable. */ }
    } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { document.execCommand("defaultParagraphSeparator", false, "p"); document.execCommand("styleWithCSS", false, "true"); void loadDraft(); }, [loadDraft]);
  useEffect(() => { if (!liveCheck) return; try { localStorage.setItem(LIVE_CHECK_KEY, JSON.stringify(liveCheck)); } catch {} }, [liveCheck]);
  const keepRecovery = () => { try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ html: documentHtml(editorRef.current), brief: briefRef.current, settings: settingsRef.current, revision: serverRevision.current, savedAt: Date.now() })); } catch {} };
  const save = useCallback(async (checkpoint = false): Promise<boolean> => {
    if (!loadedRef.current) return false;
    if (saveInFlight.current) { const ok = await saveInFlight.current; return ok && (dirty.current || checkpoint) ? save(checkpoint) : ok; }
    const ticket = editRevision.current;
    const payload = { html: documentHtml(editorRef.current), text: text(), brief: briefRef.current, settings: settingsRef.current, expectedRevision: serverRevision.current, checkpoint };
    setStatus("saving");
    const operation = (async () => {
      try {
        const data = await writeDraft(payload);
        serverRevision.current = data.revision; setVersions(data.versions);
        if (ticket === editRevision.current) { dirty.current = false; setStatus("saved"); try { localStorage.removeItem(RECOVERY_KEY); } catch {} }
        else { setStatus("unsaved"); keepRecovery(); }
        setError(null); return true;
      } catch (e) { setStatus("error"); keepRecovery(); setError(e instanceof Error ? e.message : String(e)); return false; }
      finally { saveInFlight.current = null; }
    })();
    saveInFlight.current = operation; return operation;
  }, []);
  const onInput = (documentChanged = true) => {
    if (!loadedRef.current) return;
    const paragraphs = editorRef.current ? essayParagraphs(editorRef.current).map((p) => p.innerText.trim()) : [];
    const current = settingsRef.current;
    const notes = followParagraphNotes(current.notes, previousParagraphs.current, paragraphs);
    if (notes !== current.notes) { settingsRef.current = { ...current, notes }; setSettings(settingsRef.current); }
    const focused = followParagraphNotes([{ paragraph: focusedParagraph, note: "" }], previousParagraphs.current, paragraphs)[0].paragraph;
    if (focused !== focusedParagraph) setFocusedParagraph(focused);
    previousParagraphs.current = paragraphs;
    if (documentChanged) setDocumentRevision((revision) => revision + 1);
    editRevision.current++; dirty.current = true; setWords(countWords(text())); setStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    keepRecovery(); saveTimer.current = setTimeout(() => void save(), 800); setDraftText(text());
  };
  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => { if (dirty.current) { keepRecovery(); event.preventDefault(); event.returnValue = ""; } };
    const hidden = () => { if (document.visibilityState === "hidden" && dirty.current) { keepRecovery(); void save(); } };
    window.addEventListener("beforeunload", leaving); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("beforeunload", leaving); document.removeEventListener("visibilitychange", hidden); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [save]);
  const changeSettings = (next: EssaySettings) => { settingsRef.current = next; setSettings(next); onInput(false); };
  const recordPriorities = (analysis: FocusAnalysis, snapshot: string, assignment: string, paragraphs: string[]) => {
    if (snapshot !== text() || assignment !== briefRef.current) return;
    const current = settingsRef.current;
    const context = essayContext(snapshot, assignment, current.sources, current.includeAntigone);
    const tasks: RevisionTask[] = analysis.priorities.map((p) => ({
      id: crypto.randomUUID(), kind: "revision", paragraphId: p.paragraphId, paragraph: paragraphs[p.paragraphId],
      quote: "", task: p.task, reason: p.reason, priority: p.priority, status: "open", context, note: "",
    }));
    changeSettings({ ...current, tasks: mergeRevisionTasks(current.tasks, tasks, "revision") });
  };
  const checkSources = async () => {
    if (!loadedRef.current || sourceRunning.current || !text().trim()) return;
    sourceRunning.current = true; setCheckingSources(true); setError(null);
    const snapshot = text(), assignment = briefRef.current, sources = settingsRef.current.sources, includeAntigone = settingsRef.current.includeAntigone;
    const paragraphs = essayParagraphs(editorRef.current!).map((p, id) => ({ id, text: p.innerText.trim() }));
    const context = essayContext(snapshot, assignment, sources, includeAntigone);
    try {
      const result = await ai<SourceCheck>({ mode: "sources", paragraphs, brief: assignment, sources, includeAntigone });
      if (context !== essayContext(text(), briefRef.current, settingsRef.current.sources, settingsRef.current.includeAntigone)) {
        setError("Your essay or sources changed during the source check. Check again for current results."); return;
      }
      const tasks: RevisionTask[] = result.issues.map((issue) => ({
        ...issue, id: crypto.randomUUID(), kind: "source", paragraph: paragraphs[issue.paragraphId].text,
        status: "open", context, note: "",
      }));
      changeSettings({ ...settingsRef.current, tasks: mergeRevisionTasks(settingsRef.current.tasks, tasks, "source") });
      setSourceCheckCount(result.issues.length);
      setSourceCheckContext(context);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { sourceRunning.current = false; setCheckingSources(false); }
  };
  const jumpToTask = (task: RevisionTask) => {
    const paras = editorRef.current ? essayParagraphs(editorRef.current) : [];
    const matches = paras.filter((p) => task.quote ? p.textContent?.includes(task.quote) : p.innerText.trim() === task.paragraph);
    const original = paras[task.paragraphId];
    const p = task.context === essayContext(text(), briefRef.current, settingsRef.current.sources, settingsRef.current.includeAntigone) && original?.innerText.trim() === task.paragraph ? original : matches.length === 1 ? matches[0] : null;
    if (!p) { setError("This task's passage has changed or appears more than once. Select the paragraph and analyze it again."); return; }
    focusRef.current?.focusElement(p); p.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const previewVersion = async (id: string) => {
    try { setPreview(await readVersion(id)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const restoreDocument = async (version: { html: string; brief: string; settings: EssaySettings }) => {
    if (restoreRunning.current) return;
    restoreRunning.current = true;
    try {
      // An older recovery copy may hold settings the server rejects; never let that block restoring the text.
      const parsed = EssaySettingsSchema.safeParse({ ...version.settings, targetWords: clampWords(version.settings?.targetWords) });
      const restoredSettings = parsed.success ? parsed.data : settingsRef.current;
      const restoredBrief = version.brief.slice(0, 20000);
      const restoredHtml = cleanHtml(version.html);
      // Save every edit made while the checkpoint request is pending before replacing the document.
      do { if (!await save(true)) return; } while (dirty.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (editorRef.current) editorRef.current.innerHTML = restoredHtml;
      previousParagraphs.current = editorRef.current ? essayParagraphs(editorRef.current).map((p) => p.innerText.trim()) : [];
      briefRef.current = restoredBrief; setBrief(restoredBrief); settingsRef.current = restoredSettings; setSettings(restoredSettings);
      focusRef.current?.exit(); setPreview(null); setRecovery(null); onInput(); await save(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { restoreRunning.current = false; }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const clean = html ? cleanHtml(html) : textToHtml(e.clipboardData.getData("text/plain"));
    document.execCommand("insertHTML", false, clean);
    onInput();
  };

  // ---------- selection: AI toolbar + format state ----------
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      const root = editorRef.current;
      if (!sel || !sel.rangeCount || !root || !root.contains(sel.anchorNode)) {
        if (!asking) setToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      // Focusing a toolbar control can temporarily collapse the browser selection.
      // Keep the editor range captured before the control took focus.
      if (document.activeElement?.closest(".docbar")) return;
      savedRange.current = range.cloneRange();
      setFormatReady(true);
      const el = (sel.anchorNode?.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode) as HTMLElement;
      const cs = getComputedStyle(el);
      const block = el.closest<HTMLElement>(BLOCKS);
      const lh = block ? parseFloat(getComputedStyle(block).lineHeight) / parseFloat(getComputedStyle(block).fontSize) : NaN;
      setFmt({
        font: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
        size: String(Math.round((parseFloat(cs.fontSize) * 72) / 96)),
        spacing: isNaN(lh) ? "" : String(SPACING.reduce((a, b) => (Math.abs(b * 1.2 - lh) < Math.abs(a * 1.2 - lh) ? b : a))),
        align: block ? getComputedStyle(block).textAlign : "left",
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
      if (sel.isCollapsed) { if (!asking) setToolbar(null); return; }
      const rect = range.getBoundingClientRect();
      setToolbar({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [asking]);

  // ---------- formatting commands ----------
  const restore = () => {
    const root = editorRef.current;
    const saved = savedRange.current;
    if (!root || !saved || !root.contains(saved.startContainer) || !root.contains(saved.endContainer)) {
      setFormatReady(false);
      return false;
    }
    const r = saved.cloneRange();
    root.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    savedRange.current = r;
    return !!sel;
  };
  const exec = (cmd: string, value?: string) => {
    if (!restore()) return;
    document.execCommand(cmd, false, value);
    const selection = window.getSelection();
    if (selection?.rangeCount) savedRange.current = selection.getRangeAt(0).cloneRange();
    setFmt((current) => ({ ...current, bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline") }));
    onInput();
  };
  const selectedBlocks = () => {
    const r = savedRange.current;
    const root = editorRef.current;
    if (!r || !root || !root.contains(r.startContainer) || !root.contains(r.endContainer)) return [];
    if (r.collapsed) {
      const el = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer as HTMLElement;
      const block = el?.closest<HTMLElement>(BLOCKS);
      return block && root.contains(block) ? [block] : [];
    }
    return paragraphs().filter((p) => {
      const blockRange = document.createRange();
      blockRange.selectNodeContents(p);
      return r.compareBoundaryPoints(Range.END_TO_START, blockRange) < 0 && r.compareBoundaryPoints(Range.START_TO_END, blockRange) > 0;
    });
  };
  const setFont = (font: string) => {
    if (!restore()) return;
    exec("fontName", font);
    setFmt((current) => ({ ...current, font }));
  };
  const setSize = (pt: string) => {
    if (!restore()) return;
    document.execCommand("fontSize", false, "7"); // marker size, replaced with real points below
    const range = window.getSelection()?.getRangeAt(0);
    editorRef.current?.querySelectorAll<HTMLElement>('[style*="xxx-large"], font[size="7"]').forEach((el) => {
      if (!range?.intersectsNode(el)) return;
      el.removeAttribute("size");
      el.style.fontSize = `${pt}pt`;
    });
    if (range) savedRange.current = range.cloneRange();
    setFmt((current) => ({ ...current, size: pt }));
    onInput();
  };
  const setSpacing = (v: string) => {
    if (!restore()) return;
    selectedBlocks().forEach((b) => (b.style.lineHeight = String(+(+v * 1.2).toFixed(2))));
    setFmt((current) => ({ ...current, spacing: v }));
    onInput();
  };
  const setAlignment = (align: "left" | "center" | "right") => {
    if (!restore()) return;
    exec({ left: "justifyLeft", center: "justifyCenter", right: "justifyRight" }[align]);
    setFmt((current) => ({ ...current, align }));
  };
  const indent = (dir: 1 | -1) => {
    if (!restore()) return;
    selectedBlocks().forEach((b) => {
      const cur = (parseFloat(getComputedStyle(b).marginLeft) || 0) * 72 / 96;
      const next = Math.max(0, cur + dir * 36);
      b.style.marginLeft = next ? `${next}pt` : "";
    });
    onInput();
  };

  // ---------- highlights ----------
  useEffect(() => {
    const root = editorRef.current;
    if (!root || !("highlights" in CSS)) return;
    const paint = (name: string, issues: Issue[]) =>
      CSS.highlights.set(name, new Highlight(...issues.map((i) => findRange(root, i.quote, i.paragraphId)).filter((r): r is Range => !!r)));
    CSS.highlights.delete("issue");
    CSS.highlights.delete("live");
    const issues = [...(result?.issues ?? []), ...(review?.issues ?? []), ...liveIssues];
    for (const category of ISSUE_CATEGORIES) {
      paint(`essay-${category.toLowerCase().replaceAll(" ", "-")}`, issues.filter((i) => i.category === category));
    }
    paint("issue-active", activeIssue ? [activeIssue] : []);
  }, [result, review, liveIssues, activeIssue, words]);

  // ---------- AI on selection ----------
  const run = async (action: string, q?: string) => {
    const selection = savedRange.current?.toString() ?? "";
    if (!selection.trim() || busy) return;
    focusRef.current?.focusRange(savedRange.current!, q, action === "ask" || action === "evidence" || action === "unclear");
    const source = { quote: selection, range: savedRange.current!.cloneRange(), draft: text(), brief: briefRef.current };
    setBusy(action);
    setError(null);
    setAsking(false);
    try {
      // Synonyms only need the surrounding paragraph; sending less makes it ~2x faster
      const para = (savedRange.current?.startContainer.parentElement?.closest<HTMLElement>(BLOCKS))?.innerText;
      const draft = action === "synonyms" && para ? para : text();
      const response = await ai<AiResult>({ mode: "selection", action, selection, question: q, draft, brief: action === "synonyms" ? "" : brief });
      resultSource.current = source;
      setResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setToolbar(null);
    }
  };

  const runReview = useCallback(async () => {
    const draft = text();
    if (!loadedRef.current || reviewRunning.current || countWords(draft) < 80 || `${brief}\u0000${draft}` === lastReviewed.current) return;
    reviewRunning.current = true;
    setBusy("review");
    setError(null);
    try {
      const result = await ai<ReviewResult>({ mode: "review", draft, brief });
      setReview(result); setReviewDraftSnapshot(draft); lastReviewed.current = `${brief}\u0000${draft}`; setReviewBriefSnapshot(brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null); reviewRunning.current = false;
    }
  }, [brief]);

  useEffect(() => {
    if (!autoReview) return;
    const id = setInterval(() => { if (!busy && document.visibilityState === "visible") runReview(); }, REVIEW_EVERY_MS);
    return () => clearInterval(id);
  }, [autoReview, busy, runReview]);

  // Resolve against the original passage, never whichever text is selected now.
  const canAccept = (quote: string, paragraphId?: number) => { const scope = paragraphId === undefined ? draftText : paragraphs()[paragraphId]?.innerText ?? ""; return !!quote && scope.includes(quote) && scope.indexOf(quote) === scope.lastIndexOf(quote); };
  const acceptChange = (quote: string, replacement: string, anchoredRange?: Range, paragraphId?: number) => {
    const root = editorRef.current;
    if (!root) return false;
    const range = anchoredRange ?? (canAccept(quote, paragraphId) ? findRange(root, quote, paragraphId) : null);
    if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer) || range.toString() !== quote) {
      setError("This passage has changed. Check again before accepting the suggestion.");
      return false;
    }
    root.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (!document.execCommand("insertText", false, replacement)) {
      setError("Could not apply this suggestion. Please try again.");
      return false;
    }
    savedRange.current = null;
    setActiveIssue(null);
    setToolbar(null);
    onInput();
    return true;
  };

  const replaceSelection = (replacement: string) => {
    const source = resultSource.current;
    if (!source || source.draft !== text() || source.brief !== briefRef.current) {
      setError("Your essay or assignment has changed. Select the passage again for updated suggestions.");
      return;
    }
    if (acceptChange(source.quote, replacement, source.range)) setResult(null);
  };

  const selectionFresh = resultSource.current?.draft === draftText && resultSource.current?.brief === brief;
  const reviewFresh = reviewDraftSnapshot === draftText && reviewBriefSnapshot === brief;
  const suggestionFor = (issue: { quote: string; replacement?: string; paragraphId?: number }, decline: () => void, accepted?: () => void, fresh = true) => issue.replacement && issue.replacement !== issue.quote ? (
    <EssaySuggestion original={issue.quote} replacement={issue.replacement} available={fresh && canAccept(issue.quote, issue.paragraphId) && (issue.paragraphId === undefined || liveCheck?.draft === draftText)}
      onAccept={() => { if (!fresh) return; if (acceptChange(issue.quote, issue.replacement!, undefined, issue.paragraphId)) (accepted ?? decline)(); }} onDecline={decline} />
  ) : null;

  const jumpTo = (issue: Issue) => {
    const root = editorRef.current;
    if (!root) return;
    setActiveIssue(issue);
    const range = findRange(root, issue.quote, issue.paragraphId !== undefined && liveCheck?.draft !== draftText ? undefined : issue.paragraphId);
    if (!range) { setError("This passage has changed or appears more than once. Select its location in the essay to inspect it."); return; }
    focusRef.current?.focusRange(range);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const selectionIsWord = (savedRange.current?.toString().trim().split(/\s+/).length ?? 0) === 1;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the editor selection alive

  return (
    <div className={`essay ${feedbackVisible ? "" : "feedback-hidden"}`}>
      <div className="essay-main">
        <div className="docbar" onPointerDownCapture={() => {
          const selection = window.getSelection();
          const root = editorRef.current;
          if (selection?.rangeCount && root) {
            const range = selection.getRangeAt(0);
            if (root.contains(range.startContainer) && root.contains(range.endContainer)) {
              savedRange.current = range.cloneRange();
              setFormatReady(true);
            }
          }
        }} onMouseDown={(e) => { if (!(e.target instanceof Element) || !e.target.closest("select")) e.preventDefault(); }}>
          <fieldset className="format-controls" disabled={!formatReady} aria-label="Essay formatting">
          <button title="Undo (⌘Z)" onClick={() => exec("undo")}>↶</button>
          <button title="Redo (⇧⌘Z)" onClick={() => exec("redo")}>↷</button>
          <span className="sep" />
          <select title="Font" value={FONTS.includes(fmt.font) ? fmt.font : ""} onChange={(e) => setFont(e.target.value)}>
            <option value="" disabled>{fmt.font || "Font"}</option>
            {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <select title="Font size" value={SIZES.includes(+fmt.size) ? fmt.size : ""} onChange={(e) => setSize(e.target.value)}>
            <option value="" disabled>{fmt.size || "Size"}</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="sep" />
          <button aria-pressed={fmt.bold} title="Bold (⌘B)" onClick={() => exec("bold")}><b>B</b></button>
          <button aria-pressed={fmt.italic} title="Italic (⌘I)" onClick={() => exec("italic")}><i>I</i></button>
          <button aria-pressed={fmt.underline} title="Underline (⌘U)" onClick={() => exec("underline")}><u>U</u></button>
          <span className="sep" />
          <button title="Align left" aria-label="Align left" aria-pressed={fmt.align === "left" || fmt.align === "start"} onClick={() => setAlignment("left")}><AlignmentIcon align="left" /></button>
          <button title="Align center" aria-label="Align center" aria-pressed={fmt.align === "center"} onClick={() => setAlignment("center")}><AlignmentIcon align="center" /></button>
          <button title="Align right" aria-label="Align right" aria-pressed={fmt.align === "right" || fmt.align === "end"} onClick={() => setAlignment("right")}><AlignmentIcon align="right" /></button>
          <select title="Line spacing" value={fmt.spacing} onChange={(e) => setSpacing(e.target.value)}>
            <option value="" disabled>Spacing</option>
            {SPACING.map((s) => <option key={s} value={s}>{s === 1 ? "Single" : s === 2 ? "Double" : s}</option>)}
          </select>
          <button title="Decrease indent" onClick={() => indent(-1)}>⇤</button>
          <button title="Increase indent" onClick={() => indent(1)}>⇥</button>
          <button title="Bulleted list" onClick={() => exec("insertUnorderedList")}>•</button>
          <button title="Numbered list" onClick={() => exec("insertOrderedList")}>1.</button>
          <button title="Clear formatting" onClick={() => exec("removeFormat")}>T̸</button>
          </fieldset>
          {!formatReady && <span className="format-hint muted">Click in the paper to format</span>}
          <span className="grow" />
          <span className="muted">{words} words · {status === "error" ? "Save needs attention" : status === "saving" ? "Saving…" : status === "unsaved" ? "Unsaved" : status === "saved" ? "Saved" : "Loading…"}</span>
        </div>
        <div className="essay-actions">
          <button aria-expanded={feedbackVisible} onClick={() => setFeedbackVisible((v) => !v)}>{feedbackVisible ? "Hide feedback panel" : "Show feedback panel"}</button>
          <button disabled={!loaded} onClick={() => { void save(); }}>Save now</button>
          {loaded && status === "error" && <button onClick={() => { if (!dirty.current || confirm("Discard this tab's unsaved changes and load the saved version? Download your draft first to keep them.")) void loadDraft(); }}>Reload saved version</button>}
          <button disabled={!loaded} onClick={() => { void save(true); }}>Save checkpoint</button>
          <button disabled={!loaded} onClick={() => editorRef.current && downloadEssay(editorRef.current, "html")}>Download formatted essay</button>
          <button disabled={!loaded} onClick={() => editorRef.current && downloadEssay(editorRef.current, "text")}>Download text</button>
          <button disabled={!loaded} onClick={() => window.print()}>Print / PDF</button>
          <button onClick={() => focusRef.current?.exit()}>Show full essay</button>
        </div>
        {recovery && <div className="recovery-banner" role="status"><p>A local recovery draft is available. Download your current essay before restoring if you want to compare both.</p><button onClick={() => void restoreDocument(recovery)}>Restore recovery draft</button><button onClick={() => { setRecovery(null); try { localStorage.removeItem(RECOVERY_KEY); } catch {} }}>Keep saved version</button></div>}
        {!loaded && error && <div className="recovery-banner" role="alert">{error}<button onClick={() => void loadDraft()}>Retry loading essay</button></div>}
        <div className="page-wrap">
          <div
            ref={editorRef}
            className="page"
            contentEditable={loaded}
            role="textbox"
            aria-label="Essay document"
            aria-multiline="true"
            aria-busy={!loaded}
            onClick={(e) => { if (e.target instanceof Element) focusRef.current?.focusElement(e.target); }}
            suppressContentEditableWarning
            spellCheck
            onInput={() => onInput()}
            onPaste={onPaste}
          />
        </div>
      </div>

      {toolbar && (
        <div className="toolbar" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={keep}>
          {asking ? (
            <form onSubmit={(e) => { e.preventDefault(); if (!question.trim() || busy) return; run("ask", question); setQuestion(""); }}>
              <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about the highlighted text…"
                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAsking(false); } }} // stop: Escape also exits paragraph focus
                onBlur={(e) => { if (e.relatedTarget) { setAsking(false); setToolbar(null); } }} /> {/* only when focus moved within the page, not on app switch */}
            </form>
          ) : (
            <>
              <button onClick={() => run("unclear")}>Unclear?</button>
              {selectionIsWord && <button onClick={() => run("synonyms")}>Synonyms</button>}
              <button onClick={() => run("tighten")}>Tighten</button>
              <button onClick={() => run("evidence")}>Evidence?</button>
              <button onClick={() => setAsking(true)}>Ask…</button>
            </>
          )}
        </div>
      )}

      <aside className="side" hidden={!feedbackVisible}>
        {error && <p className="error">{error}</p>}
        {busy && <p className="muted">Working ({busy})…</p>}

        {result && (
          <>
            <h2>On your selection</h2>
            {!selectionFresh && <p className="warn">The essay or assignment has changed. Select the passage again for updated feedback.</p>}
            {result.answer && <p>{result.answer}</p>}
            {result.replacements.length > 0 && (
              <div>
                <p className="muted">Choose a word replacement to accept, or decline it to keep your wording.</p>
                {result.replacements.map((r) => <EssaySuggestion key={r} original={resultSource.current?.quote ?? ""} replacement={r}
                  available={selectionFresh}
                  onAccept={() => replaceSelection(r)}
                  onDecline={() => setResult((current) => current && ({ ...current, replacements: current.replacements.filter((word) => word !== r) }))} />)}
              </div>
            )}
            {result.rewrite && (
              <>
                <EssaySuggestion original={resultSource.current?.quote ?? ""} replacement={result.rewrite}
                  available={selectionFresh} onAccept={() => replaceSelection(result.rewrite)}
                  onDecline={() => setResult((current) => current && ({ ...current, rewrite: "" }))} />
              </>
            )}
            {result.issues.map((i, k) => (
              <div key={k} className="issue" data-category={i.category}>
                <span className="issue-category">{i.category}</span>
                <div className="issue-heading">
                  <button className="issue-location" onClick={() => jumpTo(i)} aria-label={`Show suggestion: ${i.quote}`}><q>{i.quote}</q></button>
                  <button className="issue-dismiss" aria-label={`Dismiss suggestion: ${i.quote}`} title="Dismiss suggestion" onClick={() => {
                    setResult((current) => current && ({ ...current, issues: current.issues.filter((issue) => issue !== i) }));
                    if (activeIssue === i) setActiveIssue(null);
                  }}>×</button>
                </div>
                {i.note}
                {suggestionFor(i, () => setResult((current) => current && ({ ...current, issues: current.issues.filter((issue) => issue !== i) })), undefined, selectionFresh)}
                <EssayFixes key={i.quote + i.note} issue={i} draft={draftText} brief={brief} onJump={jumpTo} />
              </div>
            ))}
            <p><button onClick={() => { setResult(null); setActiveIssue(null); }}>Clear</button></p>
          </>
        )}

        <ParagraphFocus ref={focusRef} root={editorRef} draft={draftText} documentVersion={`${documentRevision}:${documentHtml(editorRef.current)}`} brief={brief} onTargetChange={setFocusedParagraph} onAnalysis={recordPriorities} />
        <EssayRevisionTasks tasks={settings.tasks} context={essayContext(draftText, brief, settings.sources, settings.includeAntigone)} onJump={jumpToTask}
          onRemove={(task) => changeSettings({ ...settingsRef.current, tasks: settingsRef.current.tasks.filter((t) => t.id !== task.id) })}
          onChange={(task) => changeSettings({ ...settingsRef.current, tasks: settingsRef.current.tasks.map((t) => t.id === task.id ? task : t) })} />
        <section className="source-check" aria-label="Source check">
          <h2>Check evidence and citations</h2>
          <p className="muted">Check against the cached Antigone text and any source excerpts you supply. Missing support is flagged for verification; translations may differ.</p>
          <label className="checklist-item"><input type="checkbox" checked={settings.includeAntigone} onChange={(e) => changeSettings({ ...settingsRef.current, includeAntigone: e.target.checked })} />Include cached Antigone text</label>
          <p className="muted"><a href={ANTIGONE_VIEWER} target="_blank" rel="noreferrer">View the source edition</a> · Add other sources with title and page or line references below.</p>
          <label>Source excerpts<textarea rows={5} maxLength={50000} value={settings.sources} onChange={(e) => changeSettings({ ...settingsRef.current, sources: e.target.value })} /></label>
          <button disabled={!loaded || checkingSources || !words} onClick={() => void checkSources()}>{checkingSources ? "Checking sources…" : "Check sources"}</button>
          <div aria-live="polite">{sourceCheckContext === essayContext(draftText, brief, settings.sources, settings.includeAntigone) && <p className="muted">{sourceCheckCount ? `${sourceCheckCount} source checks added or updated in the revision checklist.` : "No new source checks flagged. Saved tasks and notes are kept for your review. Verify your references before submission."}</p>}</div>
        </section>
        <details className="essay-requirements"><summary>Assignment and revision checklist</summary>
          <label>Assignment prompt / rubric<textarea rows={5} maxLength={20000} value={brief} onChange={(e) => { briefRef.current = e.target.value; setBrief(e.target.value); onInput(false); }} /></label>
          <label>Target word count<input type="number" min={0} max={100000} value={settings.targetWords} onChange={(e) => changeSettings({ ...settings, targetWords: clampWords(Number(e.target.value)) })} /></label>
          {settings.targetWords > 0 && <p>{words}/{settings.targetWords} words · {Math.max(0, settings.targetWords - words)} to target</p>}
          {["Thesis states a specific argument", "Each paragraph develops that argument", "Claims have verified supporting evidence", "Quotations have checked citations", "Repetition and contradictions reviewed", "Grammar and formatting checked"].map((item) => <label className="checklist-item" key={item}><input type="checkbox" checked={settings.checklist[item] ?? false} onChange={(e) => changeSettings({ ...settings, checklist: { ...settings.checklist, [item]: e.target.checked } })} />{item}</label>)}
          {focusedParagraph && <label>Note for the focused paragraph<textarea maxLength={5000} value={settings.notes.find((n) => n.paragraph === focusedParagraph)?.note ?? ""} onChange={(e) => changeSettings({ ...settingsRef.current, notes: [...settingsRef.current.notes.filter((n) => n.paragraph !== focusedParagraph), { paragraph: focusedParagraph, note: e.target.value }] })} /></label>}
          {settings.notes.filter((n) => n.note).map((n, i) => <details key={i}><summary>Paragraph note{!draftText.includes(n.paragraph) ? " · original passage has changed" : ""}</summary><q>{n.paragraph.slice(0, 160)}</q><p>{n.note}</p></details>)}
        </details>
        <details><summary>Version history ({versions.length})</summary><p className="muted">Automatic snapshots approximately once a minute; checkpoints are saved on request. Preview before restoring.</p>{versions.map((v) => <button className="outline-item" key={v.id} onClick={() => void previewVersion(v.id)}>{new Date(v.savedAt).toLocaleString()} · {v.words} words</button>)}</details>
        {preview && <section className="version-preview"><h3>Version preview · {new Date(preview.updatedAt).toLocaleString()}</h3><div className="version-document" dangerouslySetInnerHTML={{ __html: cleanHtml(preview.html) }} /><button onClick={() => void restoreDocument(preview)}>Restore this version</button><button onClick={() => setPreview(null)}>Close preview</button></section>}
        <div className="live-check-heading">
          <h2>Live check</h2>
          <button onClick={() => runLive()} disabled={checking > 0 || status === "loading" || words === 0}>
            {checking > 0 ? "Checking…" : liveCheck ? "Check again" : "Check essay"}
          </button>
        </div>
        <button onClick={() => runLive(true)} disabled={checking > 0 || status === "loading" || words === 0}>Review grammar</button>
        <p className="muted">Suggested edits keep your original wording until you accept. Decline keeps it unchanged.</p>
        <div aria-live="polite">
          {checking > 0 && <p className="muted">Checking {checking} paragraph{checking === 1 ? "" : "s"}…</p>}
          {!liveCheck && checking === 0 && <p className="muted">Check your essay when you’re ready. Suggestions stay resolved until you check again.</p>}
          {liveCheck && <p className="muted">{liveIssues.length} open · {liveCheck.issues.filter((i) => i.disposition === "accepted").length} accepted · {liveCheck.issues.filter((i) => i.disposition === "declined").length} declined · {resolvedCount} closed</p>}
          {liveCheck && liveCheck.draft !== draftText && <p className="muted">Your essay has changed since this check. Check again for updated suggestions.</p>}
          {liveCheck && liveIssues.length === 0 && checking === 0 && <p className="muted">{resolvedCount ? "All suggestions resolved." : "Nothing flagged."}</p>}
        </div>
        <div className="issue-legend" aria-label="Suggestion colors">
          {REVISION_ORDER.map((category) => <span key={category} data-category={category}><span className="category-dot" aria-hidden="true" />{category}</span>)}
        </div>
        <p className="muted checker-hint">Colored underlines match suggestions below. Red squiggles are your browser’s spellcheck.</p>
        {REVISION_ORDER.map((category) => {
          const issues = liveIssues.filter((i) => i.category === category);
          if (!issues.length) return null;
          return (
            <section key={category} className="issue-group" data-category={category} aria-label={category}>
              <h3>{category} <span className="muted">({issues.length})</span></h3>
              {issues.map((i) => (
                <div key={i.id} className="issue live" data-category={i.category}>
                  <div className="issue-heading">
                    <button className="issue-location" onClick={() => jumpTo(i)} aria-label={`Show suggestion: ${i.quote}`}><q>{i.quote}</q></button>
                    <button className="issue-dismiss" aria-label={`Dismiss suggestion: ${i.quote}`} title="Dismiss suggestion" onClick={() => resolveLive(i)}>×</button>
                  </div>
                  <p>{i.note}</p>
                  {suggestionFor(i, () => resolveLive(i, "declined"), () => { const before = liveCheck?.draft; resolveLive(i, "accepted"); setLiveCheck((c) => c && c.draft === before ? { ...c, draft: text() } : c); /* the other suggestions still apply */ })}
                  {(!i.replacement || i.replacement === i.quote) && <>
                    <EssayFixes issue={i} draft={draftText} brief={brief} onJump={jumpTo} />
                    <button onClick={() => resolveLive(i)}>Resolve</button>
                  </>}
                </div>
              ))}
            </section>
          );
        })}

        <AiCheck root={editorRef} draft={draftText} loaded={loaded} onJump={(range) => {
          focusRef.current?.focusRange(range);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
        }} />

        <h2>Whole-essay review <button onClick={() => { lastReviewed.current = ""; runReview(); }} disabled={!!busy} style={{ marginLeft: 8 }}>Review now</button></h2>
        <label className="checklist-item"><input type="checkbox" checked={autoReview} onChange={(event) => setAutoReview(event.target.checked)} />Automatic reviews every 3 minutes while this tab is visible (billed to your API account)</label>
        {!review && <p className="muted">Use Review now for feedback. Automatic reviews are off by default.</p>}
        {review && (reviewDraftSnapshot !== draftText || reviewBriefSnapshot !== brief) && <p className="warn">Your essay has changed since this whole-essay review. Review again for updated feedback.</p>}
        {review?.overall.map((o, k) => <p key={k}>{o}</p>)}
        {review?.issues.map((i, k) => (
          <div key={k} className="issue" data-category={i.category}>
            <span className="issue-category">{i.category}</span>
            <div className="issue-heading">
              <button className="issue-location" onClick={() => jumpTo(i)} aria-label={`Show suggestion: ${i.quote}`}><q>{i.quote}</q></button>
              <button className="issue-dismiss" aria-label={`Dismiss suggestion: ${i.quote}`} title="Dismiss suggestion" onClick={() => {
                setReview((current) => current && ({ ...current, issues: current.issues.filter((issue) => issue !== i) }));
                if (activeIssue === i) setActiveIssue(null);
              }}>×</button>
            </div>
            {i.note}
            {suggestionFor(i, () => setReview((current) => current && ({ ...current, issues: current.issues.filter((issue) => issue !== i) })), () => { setReview((current) => current && ({ ...current, issues: current.issues.filter((issue) => issue !== i) })); setReviewDraftSnapshot(text()); }, reviewFresh)}
            <EssayFixes key={i.quote + i.note} issue={i} draft={draftText} brief={brief} onJump={jumpTo} />
          </div>
        ))}

        <section className="quote-lookup" aria-label="Book quotes">
          <h2>Book quotes</h2>
          <p className="muted">Sophocles’ <i>Antigone</i> · Richard Jebb, Perseus edition</p>
          <form onSubmit={findQuotes} className="quote-search">
            <label htmlFor="quote-query">Find a phrase or line number</label>
            <div>
              <input id="quote-query" value={quoteQuery} maxLength={200} onChange={(e) => setQuoteQuery(e.target.value)} placeholder="e.g. ship, or 175–191" />
              <button disabled={findingQuotes || !quoteQuery.trim()}>{findingQuotes ? "Searching…" : "Find quotes"}</button>
            </div>
          </form>
          <p><a href={ANTIGONE_VIEWER} target="_blank" rel="noopener noreferrer">Read Antigone in Scaife ↗</a></p>
          <p className="quote-credit">Text: <a href="https://github.com/PerseusDL/canonical-greekLit/blob/master/data/tlg0011/tlg002/tlg0011.tlg002.perseus-eng2.xml" target="_blank" rel="noopener noreferrer">Perseus Digital Library, Tufts University</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p>
          <div aria-live="polite">
            {quoteError && <p className="error">{quoteError}</p>}
            {quoteResults && <p className="muted">{quoteResults.total ? `${quoteResults.total} passage${quoteResults.total === 1 ? "" : "s"} found for “${quoteResults.query}”${quoteResults.total > 12 ? " · showing the first 12" : ""}.` : `No passages found for “${quoteResults.query}”. Try a shorter phrase or a line number.`}</p>}
          </div>
          {quoteResults?.quotes.map((quote) => (
            <div className="book-quote" key={quote.reference}>
              <p className="muted">{quote.speaker} · lines {quote.reference}</p>
              <blockquote>{quote.text}</blockquote>
              <div className="quote-actions">
                <button onClick={() => copyQuote(quote)}>{copiedQuote === quote.reference ? "Copied!" : "Copy quote + citation"}</button>
                <a href={quote.url} target="_blank" rel="noopener noreferrer">View in Scaife ↗</a>
              </div>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}

/** The saved schema takes a whole number 0–100000; anything else would make every autosave fail. */
function clampWords(n: unknown) {
  return Math.min(100000, Math.max(0, Math.round(Number(n)) || 0));
}

function countWords(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function AlignmentIcon({ align }: { align: "left" | "center" | "right" }) {
  const shortStart = align === "left" ? 3 : align === "center" ? 6 : 9;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d={`M3 5h18 M${shortStart} 10h12 M3 15h18 M${shortStart} 20h12`} />
    </svg>
  );
}
