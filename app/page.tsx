"use client";

import { aiFetch } from "@/lib/ai-client";

import type { FocusHandle } from "@/components/ParagraphFocus";
import { documentHtml, downloadEssay, essayParagraphs, EMPTY_ESSAY_SETTINGS } from "@/lib/essay-document";
import type { EssaySettings } from "@/lib/essay-document";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiResult, LiveResult, ReviewResult } from "@/lib/claude";
import { cleanHtml, textToHtml } from "@/lib/paste";
import { ISSUE_CATEGORIES, LIVE_CHECK_KEY, readLiveCheck } from "@/lib/essay-issues";
import type { LiveCheck, LiveIssue } from "@/lib/essay-issues";
import EssaySuggestion from "@/components/EssaySuggestion";
import EssayFixes from "@/components/EssayFixes";
import AiCheck from "@/components/AiCheck";
import ParagraphOutline from "@/components/ParagraphOutline";
import FeedbackPanel from "@/components/FeedbackPanel";
import type { PanelTab } from "@/components/FeedbackPanel";
import FileMenu from "@/components/FileMenu";
import WordGoal from "@/components/WordGoal";
import VersionHistory from "@/components/VersionHistory";
import ParagraphTab from "@/components/ParagraphTab";
import SourcesTab from "@/components/SourcesTab";
import SetupWelcome from "@/components/SetupWelcome";
import { EssaySettingsSchema, essayContext, followParagraphNotes, mergeRevisionTasks } from "@/lib/essay-workflow";
import type { RevisionTask } from "@/lib/essay-workflow";
import type { FocusAnalysis } from "@/lib/essay-focus";
import { readDraft, writeDraft } from "@/lib/draft-store";
import type { VersionInfo } from "@/lib/draft-store";

type Issue = { quote: string; note: string; paragraphId?: number };
const RECOVERY_KEY = "finals:essay-recovery:v2";
const LAYOUT_KEY = "essay:layout";
const SETUP_CLOSED_KEY = "essay:setup:closed";
const TABS: PanelTab[] = ["suggestions", "paragraph", "sources"];
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
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [tab, setTab] = useState<PanelTab>("suggestions");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const layoutLoaded = useRef(false);
  const [reviewBriefSnapshot, setReviewBriefSnapshot] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<EssaySettings>(EMPTY_ESSAY_SETTINGS);
  const [recovery, setRecovery] = useState<{ html: string; brief: string; settings: EssaySettings; revision?: string } | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [focusedParagraph, setFocusedParagraph] = useState("");
  const previousParagraphs = useRef<string[]>([]);
  const [reviewDraftSnapshot, setReviewDraftSnapshot] = useState("");
  const reviewRunning = useRef(false);
  const resultSource = useRef<{ quote: string; range: Range; draft: string; brief: string } | null>(null);
  const savedRange = useRef<Range | null>(null); // last selection inside the editor
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReviewed = useRef("");
  const liveRunning = useRef(false);

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
      let setupClosed = false;
      try { setupClosed = sessionStorage.getItem(SETUP_CLOSED_KEY) === "1"; } catch {}
      if (!text().trim() && !briefRef.current.trim() && !setupClosed) setSetupOpen(true);
      try {
        setLiveCheck(readLiveCheck(localStorage.getItem(LIVE_CHECK_KEY)));
        const raw = localStorage.getItem(RECOVERY_KEY);
        if (raw) {
          const local = JSON.parse(raw);
          const parsed = EssaySettingsSchema.safeParse(local.settings);
          const localSettings = parsed.success ? parsed.data : local.settings;
          if (typeof local.html === "string" && typeof local.brief === "string" && typeof local.settings?.targetWords === "number" && Array.isArray(local.settings.notes) && local.settings.checklist && (local.html !== documentHtml(editorRef.current) || local.brief !== briefRef.current || JSON.stringify(localSettings) !== JSON.stringify(settingsRef.current))) setRecovery(local);
        }
      } catch { /* Editing remains usable if local storage is unavailable. */ }
    } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { document.execCommand("defaultParagraphSeparator", false, "p"); document.execCommand("styleWithCSS", false, "true"); void loadDraft(); }, [loadDraft]);
  useEffect(() => {
    if (!layoutLoaded.current) {
      layoutLoaded.current = true;
      try { const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}"); if (saved.feedback === false) setFeedbackVisible(false); if (saved.outline === false) setOutlineOpen(false); if (TABS.includes(saved.tab)) setTab(saved.tab); } catch {}
      return;
    }
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ feedback: feedbackVisible, outline: outlineOpen, tab })); } catch {}
  }, [feedbackVisible, outlineOpen, tab]);
  // Results and errors appear in the feedback panel, so a collapsed panel must open to show them.
  useEffect(() => { if (error) setFeedbackVisible(true); }, [error]);
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
  const updateSettings = (update: (settings: EssaySettings) => EssaySettings) => changeSettings(update(settingsRef.current));
  const changeBrief = (text: string) => { briefRef.current = text; setBrief(text); onInput(false); };
  const getBrief = () => briefRef.current;
  const getSettings = () => settingsRef.current;
  const openTab = (t: PanelTab) => { setTab(t); setFeedbackVisible(true); };
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
  const jumpToTask = (task: RevisionTask, current = essayContext(text(), briefRef.current, settingsRef.current.sources, settingsRef.current.includeAntigone)) => {
    const paras = editorRef.current ? essayParagraphs(editorRef.current) : [];
    const matches = paras.filter((p) => task.quote ? p.textContent?.includes(task.quote) : p.innerText.trim() === task.paragraph);
    const original = paras[task.paragraphId];
    const p = task.context === current && original?.innerText.trim() === task.paragraph ? original : matches.length === 1 ? matches[0] : null;
    if (!p) { setError("This task's passage has changed or appears more than once. Select the paragraph and analyze it again."); return; }
    focusRef.current?.focusElement(p); p.scrollIntoView({ behavior: "smooth", block: "center" });
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
      focusRef.current?.exit(); setRecovery(null); onInput(); await save(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { restoreRunning.current = false; }
  };
  const newEssay = async () => {
    if (!window.confirm("Start a new essay? This one stays in Version history.")) return;
    await restoreDocument({ html: "", brief: "", settings: { ...EMPTY_ESSAY_SETTINGS, includeAntigone: settingsRef.current.includeAntigone } });
    if (text().trim()) return; // restore failed or was blocked; leave everything as is
    setLiveCheck(null); try { localStorage.removeItem(LIVE_CHECK_KEY); } catch {}
    setReview(null); setResult(null); setActiveIssue(null);
    try { sessionStorage.removeItem(SETUP_CLOSED_KEY); } catch {}
    setSetupOpen(true);
  };
  const closeSetup = () => {
    try { sessionStorage.setItem(SETUP_CLOSED_KEY, "1"); } catch {}
    setSetupOpen(false);
    editorRef.current?.focus();
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
    openTab("suggestions");
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

  const outline = editorRef.current ? essayParagraphs(editorRef.current).map((p) => p.innerText.trim()) : [];
  const outlineIssues = outline.map((p, index) => liveIssues.filter((i) => i.paragraphId === index && p.includes(i.quote)).length);
  const selectParagraph = (index: number) => {
    const p = paragraphs()[index];
    if (!p) return;
    focusRef.current?.focusElement(p);
    p.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const selectionIsWord = (savedRange.current?.toString().trim().split(/\s+/).length ?? 0) === 1;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the editor selection alive

  const suggestions = <>
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
    <AiCheck brief={brief} root={editorRef} draft={draftText} loaded={loaded} onJump={(range) => {
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
  </>;

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
          <FileMenu disabled={!loaded} onNewEssay={() => void newEssay()} onCheckpoint={() => void save(true)} onHistory={() => setHistoryOpen(true)}
            onDownload={(format) => editorRef.current && downloadEssay(editorRef.current, format)} onPrint={() => window.print()} onAssignment={() => openTab("sources")} />
          <span className="sep" />
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
          <WordGoal words={words} target={settings.targetWords} onClick={() => openTab("sources")} />
          <span className={status === "error" ? "error" : "muted"}>{status === "error" ? "Not saved" : status === "saving" ? "Saving…" : status === "unsaved" ? "Unsaved" : status === "saved" ? "Saved" : "Loading…"}</span>
        </div>
        <div className="essay-scroll">
        {loaded && status === "error" && <div className="recovery-banner" role="alert">Couldn’t save to this browser.{" "}
          <button onClick={() => void save()}>Try again</button>
          <button onClick={() => editorRef.current && downloadEssay(editorRef.current, "text")}>Download text</button>
          <button onClick={() => { if (!dirty.current || confirm("Discard this tab's unsaved changes and load the saved version? Download your draft first to keep them.")) void loadDraft(); }}>Reload saved version</button>
        </div>}
        {recovery && <div className="recovery-banner" role="status"><p>A local recovery draft is available. Download your current essay before restoring if you want to compare both.</p><button onClick={() => void restoreDocument(recovery)}>Restore recovery draft</button><button onClick={() => { setRecovery(null); try { localStorage.removeItem(RECOVERY_KEY); } catch {} }}>Keep saved version</button></div>}
        {!loaded && error && <div className="recovery-banner" role="alert">{error}<button onClick={() => void loadDraft()}>Retry loading essay</button></div>}
        <div className="page-wrap">
          <ParagraphOutline paragraphs={outline} active={focusedParagraph ? outline.indexOf(focusedParagraph) : -1} issueCounts={outlineIssues}
            open={outlineOpen} onToggle={() => setOutlineOpen((v) => !v)} onSelect={selectParagraph} onShowAll={() => focusRef.current?.exit()}
            brief={brief} settings={settings} updateSettings={updateSettings} />
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

      <FeedbackPanel visible={feedbackVisible} onVisibleChange={setFeedbackVisible} tab={tab} onTabChange={setTab} busy={!!busy || checking > 0}
        counts={{ suggestions: liveIssues.length + (result?.issues.length ?? 0) + (review?.issues.length ?? 0), paragraph: settings.tasks.filter((t) => t.kind === "revision" && t.status === "open").length, sources: settings.tasks.filter((t) => t.kind === "source" && t.status === "open").length }}
        error={error} onDismissError={() => setError(null)} suggestions={suggestions}
        paragraph={<ParagraphTab focusRef={focusRef} editorRef={editorRef} draft={draftText} documentVersion={`${documentRevision}:${documentHtml(editorRef.current)}`} brief={brief}
          settings={settings} updateSettings={updateSettings} focusedParagraph={focusedParagraph} context={essayContext(draftText, brief, settings.sources, settings.includeAntigone)}
          onTargetChange={setFocusedParagraph} onAnalysis={recordPriorities} onJumpTask={jumpToTask} />}
        sources={<SourcesTab editorRef={editorRef} draft={draftText} loaded={loaded} words={words} brief={brief} onBriefChange={changeBrief} getBrief={getBrief}
          settings={settings} getSettings={getSettings} updateSettings={updateSettings} onJumpTask={jumpToTask} onError={setError} evidenceRequest={null} />} />
      <VersionHistory open={historyOpen} onClose={() => setHistoryOpen(false)} versions={versions} onRestore={restoreDocument} />
      <SetupWelcome open={setupOpen} onClose={closeSetup} brief={brief} onBriefChange={changeBrief} settings={settings} updateSettings={updateSettings} />
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
