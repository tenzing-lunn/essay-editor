"use client";

import { aiFetch, setAiWriting } from "@/lib/ai-client";

import type { FocusHandle } from "@/components/ParagraphFocus";
import { bodyParagraphOf, documentHtml, downloadEssay, essayParagraphs, EMPTY_ESSAY_SETTINGS } from "@/lib/essay-document";
import type { EssaySettings } from "@/lib/essay-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiResult, LiveResult, ReviewResult } from "@/lib/claude";
import { cleanHtml, textToHtml } from "@/lib/paste";
import { ISSUE_CATEGORIES, liveCheckKey, readLiveCheck } from "@/lib/essay-issues";
import type { EssayIssue, LiveCheck, LiveIssue } from "@/lib/essay-issues";
import { anchorParagraph, checkProgress, followAnchors, mergeSuggestions, SERIOUS } from "@/lib/suggestions";
import type { Suggestion } from "@/lib/suggestions";
import AiCheck from "@/components/AiCheck";
import EssayGrade from "@/components/EssayGrade";
import SuggestionsTab from "@/components/SuggestionsTab";
import IssuePopover from "@/components/IssuePopover";
import ParagraphOutline from "@/components/ParagraphOutline";
import FeedbackPanel from "@/components/FeedbackPanel";
import type { PanelTab } from "@/components/FeedbackPanel";
import FileMenu from "@/components/FileMenu";
import WordGoal from "@/components/WordGoal";
import VersionHistory, { whenSaved } from "@/components/VersionHistory";
import ParagraphTab from "@/components/ParagraphTab";
import SourcesTab from "@/components/SourcesTab";
import SetupWelcome from "@/components/SetupWelcome";
import { EssaySettingsSchema, essayContext, followParagraphNotes, mergeRevisionTasks, RevisionTaskSchema, WritingProfileSchema } from "@/lib/essay-workflow";
import type { RevisionTask } from "@/lib/essay-workflow";
import type { FocusAnalysis } from "@/lib/essay-focus";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/AccountMenu";
import AiAccount from "@/components/AiAccount";
import { ApiError, createEssay, patchEssay, readEssay, saveEssay, track } from "@/lib/essay-store";
import { displayTitle, TITLE_MAX } from "@/lib/api-types";
import type { Account, VersionInfo } from "@/lib/api-types";

type Issue = { quote: string; note: string; paragraphId?: number; id?: string };
type Anchored = EssayIssue & { id: string; paragraph?: string };
type SelectionResult = Omit<AiResult, "issues"> & { issues: Anchored[] };
type Review = Omit<ReviewResult, "issues"> & { issues: Anchored[] };
// Everything stored per essay is keyed by its id; the layout is a UI preference shared by every essay.
const recoveryKey = (essayId: string) => `finals:essay-recovery:v2:${essayId}`;
const setupClosedKey = (essayId: string) => `essay:setup:closed:${essayId}`;
const LAYOUT_KEY = "essay:layout";
const TABS: PanelTab[] = ["suggestions", "paragraph", "sources"];
type Toolbar = { x: number; y: number; below?: boolean } | null;

/** Text, or inline formatting such as the <span> Chrome leaves when a list is switched off, sitting outside any block. */
const strayInline = (n: Node) => n.nodeType === Node.TEXT_NODE ? !!n.textContent?.trim() : n instanceof HTMLElement && !n.matches(`${BLOCKS}, ul, ol, div, table, hr, br`) && !!n.textContent?.trim();

/** Place the selection toolbar above the passage, or below it under the docbar, kept inside the viewport. */
function toolbarAt(range: Range): Toolbar {
  const rect = range.getBoundingClientRect();
  const top = (document.querySelector(".docbar")?.getBoundingClientRect().bottom ?? 0) + 72;
  const half = Math.min(240, innerWidth / 2 - 8);
  const x = Math.min(Math.max(rect.left + rect.width / 2, half + 8), innerWidth - half - 8);
  return rect.top - 8 < top ? { x, y: rect.bottom + 8, below: true } : { x, y: rect.top - 8 };
}

const REVIEW_EVERY_MS = 3 * 60_000;
const FONTS = ["Times New Roman", "Arial", "Georgia", "Calibri", "Garamond", "Helvetica"];
const SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36];
const SPACING = [1, 1.15, 1.5, 2]; // Google Docs exports line spacing × 1.2 as CSS line-height
const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, blockquote";

/** Character offset of a DOM point within root, so a caret survives DOM rewrites that keep the text. */
function textOffset(root: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, offset);
  return r.toString().length;
}

/** Select from character offset start to end within root (inverse of textOffset). */
function selectOffsets(root: HTMLElement, start: number, end = start) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange(); range.setStart(root, 0); range.collapse(true);
  let pos = 0, startSet = false;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const next = pos + n.data.length;
    if (!startSet && start <= next) { range.setStart(n, start - pos); startSet = true; }
    if (startSet && end <= next) { range.setEnd(n, end - pos); break; }
    pos = next;
  }
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
}

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

export default function EssayEditor({ essayId, account }: { essayId: string; account: Account }) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const pageFitRef = useRef<HTMLDivElement>(null);
  // Keep the page at Letter width so lines wrap like the printed essay; scale it down when the side panels leave less room.
  // Below 70% the text gets too small to edit, so the page reflows to the available width instead.
  useEffect(() => {
    const fit = pageFitRef.current;
    if (!fit) return;
    const observer = new ResizeObserver(() => {
      const zoom = Math.min(1, fit.clientWidth / 816);
      fit.style.setProperty("--page-zoom", String(zoom));
      fit.toggleAttribute("data-fluid", zoom < 0.7);
    });
    observer.observe(fit);
    return () => observer.disconnect();
  }, []);
  const focusRef = useRef<FocusHandle>(null);
  const serverRevision = useRef("");
  const editRevision = useRef(0);
  const dirty = useRef(false);
  const loadedRef = useRef(false);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  const saveConflict = useRef(false);
  const wrapping = useRef(false);
  const restoreRunning = useRef(false);
  const markEmpty = () => editorRef.current?.toggleAttribute("data-empty", !editorRef.current.textContent?.trim() && !editorRef.current.querySelector("img, li, table"));
  const briefRef = useRef("");
  const settingsRef = useRef<EssaySettings>(EMPTY_ESSAY_SETTINGS);
  const [feedbackVisible, setFeedbackVisible] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [tab, setTab] = useState<PanelTab>("suggestions");
  const [quiet, setQuiet] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupEditing, setSetupEditing] = useState(false);
  const layoutLoaded = useRef(false);
  const [reviewBriefSnapshot, setReviewBriefSnapshot] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<EssaySettings>(EMPTY_ESSAY_SETTINGS);
  const [recovery, setRecovery] = useState<{ html: string; brief: string; settings: EssaySettings; revision?: string; savedAt?: number } | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [focusedParagraph, setFocusedParagraph] = useState("");
  const previousParagraphs = useRef<string[]>([]);
  const [reviewDraftSnapshot, setReviewDraftSnapshot] = useState("");
  const reviewRunning = useRef(false);
  const resultSource = useRef<{ quote: string; range: Range; draft: string; brief: string } | null>(null);
  const savedRange = useRef<Range | null>(null); // last selection inside the editor
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReviewed = useRef("");
  const [reviewedKey, setReviewedKey] = useState("");
  const liveRunning = useRef(false);

  const [brief, setBrief] = useState("");
  const [words, setWords] = useState(0);
  const [status, setStatus] = useState<"loading" | "saved" | "unsaved" | "saving" | "offline" | "error">("loading");
  const [problem, setProblem] = useState<"conflict" | "signed-out" | "failed" | null>(null); // why saving stopped
  const [missing, setMissing] = useState(false);
  const [trashed, setTrashed] = useState(false);
  const trashedRef = useRef(false);
  const [archived, setArchived] = useState(false);
  const saveFailure = useRef(""); // why the last save didn't reach the account, in words
  const [title, setTitle] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const skipTitleCommit = useRef(false);
  const [toolbar, setToolbar] = useState<Toolbar>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [autoReview, setAutoReview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SelectionResult | null>(null);
  const [resultAction, setResultAction] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [liveCheck, setLiveCheck] = useState<LiveCheck | null>(null);
  const liveCheckRef = useRef<LiveCheck | null>(null);
  const [progress, setProgress] = useState<ReturnType<typeof checkProgress>>(null);
  const [popover, setPopover] = useState<{ id: string; rect: DOMRect; focus?: boolean } | null>(null);
  const [fixesRequest, setFixesRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [evidenceRequest, setEvidenceRequest] = useState<{ query: string; nonce: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [documentRevision, setDocumentRevision] = useState(0);
  const [checking, setChecking] = useState(0);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [formatReady, setFormatReady] = useState(false);
  const [fmt, setFmt] = useState({ font: "Times New Roman", size: "12", spacing: "2", align: "left", bold: false, italic: false, underline: false });
  // selectionchange fires on every keystroke; skip state updates that change nothing so fast typing doesn't pile up React commits.
  const selectionState = useRef({ fmt, toolbar, formatReady });
  selectionState.current = { fmt, toolbar, formatReady };

  const text = () => editorRef.current?.innerText ?? "";
  const paragraphs = () => editorRef.current ? essayParagraphs(editorRef.current) : [];

  // A check is a snapshot. Editing and resolving never trigger another request.
  const runLive = async (grammarOnly = false) => {
    if (liveRunning.current) return;
    const draft = text();
    const texts = paragraphs().map((p) => p.innerText.trim());
    // Header lines (name, course, date) and titles aren't prose: a short line without end punctuation is skipped.
    const isProse = (t: string) => countWords(t) >= 5 && (countWords(t) >= 12 || /[.!?…]["”’)\]]*$/.test(t));
    const paras = texts.flatMap((t, index) => isProse(t) ? [{ index, text: t }] : []);
    if (!paras.length && draft.trim()) paras.push({ index: 0, text: draft.trim() });
    if (!paras.length) return;
    liveRunning.current = true;
    setChecking(paras.length);
    setError(null);
    try {
      const thesis = settingsRef.current.thesis || paras.slice(0, 2).map((p) => p.text).join("\n\n");
      const issues: LiveIssue[] = [];
      const checked = new Set<number>();
      // Limit concurrency so long essays don't flood the API.
      let next = 0;
      const workers = await Promise.allSettled(Array.from({ length: Math.min(3, paras.length) }, async () => {
        while (next < paras.length) {
          const { index: paragraphId, text: paragraph } = paras[next++];
          try {
            const r = await ai<LiveResult>({ mode: "live", paragraph, thesis, grammarOnly });
            checked.add(paragraphId);
            for (const issue of r.issues) {
              if (issue.quote.trim() && paragraph.includes(issue.quote)) {
                issues.push({ ...issue, id: crypto.randomUUID(), resolved: false, paragraphId, paragraph });
              }
            }
          } finally {
            setChecking((n) => Math.max(0, n - 1));
          }
        }
      }));
      const failures = workers.filter((worker): worker is PromiseRejectedResult => worker.status === "rejected");
      if (failures.length && !issues.length) throw failures[0].reason;
      // Grammar only keeps the argument suggestions that can still be located, re-anchored to the current text.
      const prev = liveCheckRef.current;
      // Paragraphs that failed this run keep their earlier open suggestions.
      const kept = (grammarOnly || failures.length) && prev ? prev.issues.flatMap((i) => {
        if (i.resolved) return [];
        const at = anchorParagraph(i.quote, i.paragraph, texts);
        if (at === undefined) return [];
        const unchecked = !checked.has(at);
        if (!unchecked && (!grammarOnly || i.category === "Grammar" || i.category === "Wrong word")) return [];
        return [{ ...i, paragraphId: at, paragraph: texts[at] }];
      }) : [];
      const found = [...kept, ...issues].sort((a, b) => draft.indexOf(a.quote) - draft.indexOf(b.quote));
      setProgress(checkProgress(prev, found, draft));
      setLiveCheck({ draft, issues: found, checkedAt: Date.now() });
      setActiveIssue(null);
      if (failures.length) setError(`Part of the essay couldn't be checked (${failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)}). Check again to retry.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      liveRunning.current = false;
      setChecking(0);
    }
  };

  const resolveLive = (issue: { id: string }, disposition: "accepted" | "declined" | "resolved" = "resolved") => {
    setLiveCheck((check) => check && ({ ...check, issues: check.issues.map((i) => i.id === issue.id ? { ...i, resolved: true, disposition } : i) }));
    if (activeIssue?.id === issue.id) setActiveIssue(null);
  };

  // ---------- load / save ----------
  const loadDraft = useCallback(async () => {
    setStatus("loading"); setError(null); setProblem(null); setLoaded(false); loadedRef.current = false; saveConflict.current = false;
    try {
      const data = await readEssay(essayId);
      setTitle(data.title); setTitleDraft(data.title);
      trashedRef.current = !!data.trashedAt; setTrashed(trashedRef.current); setArchived(!!data.archivedAt);
      if (editorRef.current) editorRef.current.innerHTML = cleanHtml(data.html);
      if (editorRef.current && !editorRef.current.innerHTML.trim()) editorRef.current.innerHTML = "<p><br></p>";
      previousParagraphs.current = editorRef.current ? essayParagraphs(editorRef.current).map((p) => p.innerText.trim()) : [];
      serverRevision.current = data.revision;
      briefRef.current = data.brief; setBrief(briefRef.current);
      settingsRef.current = fitSettings(data.settings); setSettings(settingsRef.current);
      setVersions(data.versions); setWords(countWords(text())); setDraftText(text()); setStatus("saved"); markEmpty();
      setDocumentRevision((revision) => revision + 1);
      dirty.current = false; loadedRef.current = true; setLoaded(true);
      let setupClosed = false;
      try { setupClosed = sessionStorage.getItem(setupClosedKey(essayId)) === "1"; } catch {}
      if (!text().trim() && !briefRef.current.trim() && !setupClosed && !trashedRef.current) setSetupOpen(true);
      try {
        setLiveCheck(readLiveCheck(localStorage.getItem(liveCheckKey(essayId))));
        const raw = localStorage.getItem(recoveryKey(essayId));
        if (raw) {
          const local = JSON.parse(raw);
          const parsed = EssaySettingsSchema.safeParse(local.settings);
          const localSettings = parsed.success ? parsed.data : local.settings;
          if (typeof local.html === "string" && typeof local.brief === "string" && typeof local.settings?.targetWords === "number" && Array.isArray(local.settings.notes) && local.settings.checklist && (local.html !== documentHtml(editorRef.current) || local.brief !== briefRef.current || JSON.stringify(localSettings) !== JSON.stringify(settingsRef.current))) setRecovery(local);
        }
      } catch { /* Editing remains usable if local storage is unavailable. */ }
    } catch (e) {
      setStatus("error");
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else if (e instanceof ApiError && e.status === 401) setProblem("signed-out");
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, [essayId]);
  useEffect(() => { document.execCommand("defaultParagraphSeparator", false, "p"); document.execCommand("styleWithCSS", false, "true"); void loadDraft(); }, [loadDraft]);
  useEffect(() => {
    if (!layoutLoaded.current) {
      layoutLoaded.current = true;
      try { const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}"); if (saved.feedback === false) setFeedbackVisible(false); if (saved.outline === false || (saved.outline === undefined && matchMedia("(max-width: 900px)").matches)) setOutlineOpen(false); if (TABS.includes(saved.tab)) setTab(saved.tab); if (saved.quiet === true) setQuiet(true); } catch {}
      return;
    }
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ feedback: feedbackVisible, outline: outlineOpen, tab, quiet })); } catch {}
  }, [feedbackVisible, outlineOpen, tab, quiet]);
  // Results and errors appear in the feedback panel, so a collapsed panel must open to show them.
  useEffect(() => { if (error) { setFeedbackVisible(true); if (loadedRef.current) revealPanel(); } }, [error]);
  useEffect(() => { setAiWriting({ profile: settings.profile, thesis: settings.thesis, targetWords: settings.targetWords }); }, [settings.profile, settings.thesis, settings.targetWords]);
  useEffect(() => { liveCheckRef.current = liveCheck; if (!liveCheck) return; try { localStorage.setItem(liveCheckKey(essayId), JSON.stringify(liveCheck)); } catch {} }, [liveCheck, essayId]);
  const latest = useRef<{ html: string; text: string; brief: string; settings: EssaySettings } | null>(null); // the unsaved document, for the save on leaving
  const keepRecovery = () => {
    if (!editorRef.current) return; // unmounted: the copy already kept is the latest
    latest.current = { html: documentHtml(editorRef.current), text: text(), brief: briefRef.current, settings: settingsRef.current };
    try { localStorage.setItem(recoveryKey(essayId), JSON.stringify({ ...latest.current, revision: serverRevision.current, savedAt: Date.now() })); } catch {}
  };
  const save = useCallback(async (checkpoint = false, keepalive = false): Promise<boolean> => {
    if (!loadedRef.current || !editorRef.current) return false;
    if (saveConflict.current) { saveFailure.current = CONFLICT; setStatus("error"); return false; }
    if (trashedRef.current) { saveFailure.current = TRASHED; if (dirty.current) keepRecovery(); setStatus(dirty.current ? "error" : "saved"); return false; } // the server refuses edits to a trashed essay
    if (saveInFlight.current) { const ok = await saveInFlight.current; return ok && (dirty.current || checkpoint) ? save(checkpoint, keepalive) : ok; }
    const ticket = editRevision.current;
    // Settings past the schema's limits would make the server refuse every save; trim them as loading does.
    const payload = { html: documentHtml(editorRef.current), text: text(), brief: briefRef.current.slice(0, 20000), settings: fitSettings(settingsRef.current), expectedRevision: serverRevision.current, checkpoint };
    setStatus((s) => s === "offline" ? s : "saving"); // offline stays put until a save gets through
    const operation = (async () => {
      try {
        const data = await saveEssay(essayId, payload, keepalive);
        serverRevision.current = data.revision; setVersions(data.versions);
        if (ticket === editRevision.current) { dirty.current = false; setStatus("saved"); try { localStorage.removeItem(recoveryKey(essayId)); } catch {} }
        else { setStatus("unsaved"); keepRecovery(); }
        saveFailure.current = ""; setProblem(null); setError(null); return true;
      } catch (e) {
        keepRecovery();
        const status = e instanceof ApiError ? e.status : -1;
        // Like Google Docs offline: the copy on this device holds the edits, and saving resumes on its own.
        if (status === 0) { saveFailure.current = "Can’t reach the server — try again when you’re back online."; setStatus("offline"); setProblem(null); return false; }
        setStatus("error");
        if (status === 401) { saveFailure.current = "You’ve been signed out. Sign in again, then try again."; setProblem("signed-out"); }
        else if (e instanceof ApiError && e.code === "trashed") { saveFailure.current = TRASHED; trashedRef.current = true; setTrashed(true); }
        else if (e instanceof Error && e.name === "Conflict") {
          // The banner explains and offers Download / Reload; the page stops taking edits until then.
          saveFailure.current = CONFLICT; saveConflict.current = true; if (saveTimer.current) clearTimeout(saveTimer.current);
          setProblem("conflict");
        } else { saveFailure.current = e instanceof Error ? e.message : String(e); setProblem("failed"); setError(saveFailure.current); }
        return false;
      }
      finally { saveInFlight.current = null; }
    })();
    saveInFlight.current = operation; return operation;
  }, [essayId]);
  // Trashed or overwritten elsewhere: the essay is read-only until restored or reloaded.
  const locked = () => trashedRef.current || saveConflict.current;
  const onInput = (documentChanged = true) => {
    if (!loadedRef.current || locked()) return;
    const root = editorRef.current;
    // Text typed straight into the editor, or left behind by a removed list, is not a paragraph; wrap it (keeps the caret).
    // formatBlock fires its own input event synchronously; skip that nested call so edits can't recurse.
    if (documentChanged && root && !wrapping.current && [...root.childNodes].some(strayInline)) {
      wrapping.current = true;
      const sel = window.getSelection(), at = sel?.rangeCount && root.contains(sel.focusNode) ? textOffset(root, sel.focusNode!, sel.focusOffset) : -1;
      try { document.execCommand("formatBlock", false, "p"); } finally { wrapping.current = false; }
      if (at >= 0) selectOffsets(root, at);
    }
    if (wrapping.current) return;
    const paragraphs = editorRef.current ? essayParagraphs(editorRef.current).map((p) => p.innerText.trim()) : [];
    const current = settingsRef.current;
    const notes = followParagraphNotes(current.notes, previousParagraphs.current, paragraphs);
    if (notes !== current.notes) { settingsRef.current = { ...current, notes }; setSettings(settingsRef.current); }
    const focused = followParagraphNotes([{ paragraph: focusedParagraph, note: "" }], previousParagraphs.current, paragraphs)[0].paragraph;
    if (focused !== focusedParagraph) setFocusedParagraph(focused);
    const before = previousParagraphs.current, after = paragraphs;
    setLiveCheck((c) => { if (!c) return c; const issues = followAnchors(c.issues, before, after); return issues === c.issues ? c : { ...c, issues }; });
    setResult((r) => { if (!r) return r; const issues = followAnchors(r.issues, before, after); return issues === r.issues ? r : { ...r, issues }; });
    setReview((r) => { if (!r) return r; const issues = followAnchors(r.issues, before, after); return issues === r.issues ? r : { ...r, issues }; });
    previousParagraphs.current = paragraphs;
    if (documentChanged) setDocumentRevision((revision) => revision + 1);
    editRevision.current++; dirty.current = true; setWords(countWords(text())); setStatus((s) => s === "offline" ? s : "unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    keepRecovery(); saveTimer.current = setTimeout(() => void save(), 800); setDraftText(text()); markEmpty();
  };
  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => { if (dirty.current) { keepRecovery(); event.preventDefault(); event.returnValue = ""; } };
    // keepalive lets a save started as the tab hides or unloads finish after the page is gone.
    const hidden = () => { if (document.visibilityState === "hidden" && dirty.current) { if (saveTimer.current) clearTimeout(saveTimer.current); keepRecovery(); void save(false, true); } };
    const pagehide = () => { if (dirty.current) { if (saveTimer.current) clearTimeout(saveTimer.current); keepRecovery(); void save(false, true); } };
    window.addEventListener("beforeunload", leaving); document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", pagehide);
    return () => {
      window.removeEventListener("beforeunload", leaving); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", pagehide); if (saveTimer.current) clearTimeout(saveTimer.current);
      // Left through the browser's Back button or a link: the editor is gone, so save the last copy kept, after any save in flight.
      if (!dirty.current || saveConflict.current || trashedRef.current || !latest.current) return;
      const pending = latest.current;
      // Tracked from the start, so the essay list that loads next waits for this save rather than showing the old text.
      void track((saveInFlight.current ?? Promise.resolve(true)).then(async () => {
        if (!dirty.current) return;
        await saveEssay(essayId, { ...pending, brief: pending.brief.slice(0, 20000), settings: fitSettings(pending.settings), expectedRevision: serverRevision.current }, true);
        try { localStorage.removeItem(recoveryKey(essayId)); } catch {}
      })).catch(() => { /* the recovery copy stays for next time */ });
    };
  }, [save, essayId]);
  // Offline: keep retrying in the background, and right away when the connection returns.
  useEffect(() => {
    if (status !== "offline") return;
    const retry = () => void save();
    const timer = setInterval(retry, 10_000);
    window.addEventListener("online", retry);
    return () => { clearInterval(timer); window.removeEventListener("online", retry); };
  }, [status, save]);
  // Saves pending edits before leaving this essay; true when nothing is left unsaved.
  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    return !loadedRef.current || (!dirty.current && !saveInFlight.current) || await save();
  }, [save]);
  const leave = async (to: () => string | Promise<string>) => {
    if (!await flush() && !window.confirm("Your latest changes aren’t saved to your account yet. Leave anyway? A copy stays on this device.")) return;
    try { router.push(await to()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const changeSettings = (next: EssaySettings) => { if (locked()) return; settingsRef.current = next; setSettings(next); onInput(false); };
  const updateSettings = (update: (settings: EssaySettings) => EssaySettings) => changeSettings(update(settingsRef.current));
  const changeBrief = (text: string) => { if (locked()) return; briefRef.current = text; setBrief(text); onInput(false); };
  const getBrief = () => briefRef.current;
  const getSettings = () => settingsRef.current;
  const revealPanel = () => { if (matchMedia("(max-width: 900px)").matches) requestAnimationFrame(() => document.getElementById("feedback-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const openTab = (t: PanelTab) => { setTab(t); setFeedbackVisible(true); revealPanel(); };
  const recordPriorities = (analysis: FocusAnalysis, snapshot: string, assignment: string, paragraphs: string[]) => {
    if (snapshot !== text() || assignment !== briefRef.current) return;
    const current = settingsRef.current;
    const context = essayContext(snapshot, assignment, current.sources, current.includeAntigone);
    const tasks: RevisionTask[] = analysis.priorities.map((p) => ({
      id: crypto.randomUUID(), kind: "revision", paragraphId: p.paragraphId, paragraph: (paragraphs[p.paragraphId] ?? "").slice(0, 20000),
      quote: "", task: p.task, reason: p.reason, priority: p.priority, status: "open", context, note: "",
    }));
    changeSettings({ ...current, tasks: mergeRevisionTasks(current.tasks, tasks, "revision") });
  };
  const jumpToTask = (task: RevisionTask, current = essayContext(text(), briefRef.current, settingsRef.current.sources, settingsRef.current.includeAntigone)) => {
    const paras = editorRef.current ? essayParagraphs(editorRef.current) : [];
    const same = (p: HTMLElement) => p.innerText.trim().slice(0, 20000) === task.paragraph; // stored paragraphs are capped at 20,000 characters
    const matches = paras.filter((p) => task.quote ? p.textContent?.includes(task.quote) : same(p));
    const original = paras[task.paragraphId];
    const p = task.context === current && original && same(original) ? original : matches.length === 1 ? matches[0] : null;
    if (!p) { setError("This task's passage has changed or appears more than once. Select the paragraph and analyze it again."); return; }
    focusRef.current?.focusElement(p); p.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  /** Resolves to null once the version replaces the essay, or to why nothing changed. */
  const restoreDocument = async (version: { html: string; brief: string; settings: EssaySettings }): Promise<string | null> => {
    if (restoreRunning.current) return "A restore is already in progress.";
    if (trashedRef.current) return "Restore this essay from the trash first, then restore the version.";
    if (saveConflict.current) return "This essay was changed somewhere else. Reload the saved version first, then restore.";
    restoreRunning.current = true;
    try {
      // An older recovery copy may hold settings the server rejects; never let that block restoring the text.
      // Versions saved before writing profiles existed keep the current setup instead of erasing it.
      const restoredSettings = fitSettings({ ...version.settings, targetWords: clampWords(version.settings?.targetWords), profile: version.settings?.profile ?? settingsRef.current.profile });
      const restoredBrief = version.brief.slice(0, 20000);
      const restoredHtml = cleanHtml(version.html);
      // Save every edit made while the checkpoint request is pending before replacing the document.
      do {
        if (!await save(true)) return saveFailure.current.startsWith("Can’t reach") ? "Can’t restore while offline — try again when you’re back online." : `Nothing was restored. ${saveFailure.current || "Your current essay couldn’t be saved first."}`;
      } while (dirty.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (editorRef.current) editorRef.current.innerHTML = restoredHtml;
      if (editorRef.current && !editorRef.current.innerHTML.trim()) editorRef.current.innerHTML = "<p><br></p>";
      previousParagraphs.current = editorRef.current ? essayParagraphs(editorRef.current).map((p) => p.innerText.trim()) : [];
      briefRef.current = restoredBrief; setBrief(restoredBrief); settingsRef.current = restoredSettings; setSettings(restoredSettings);
      focusRef.current?.exit(); setRecovery(null); onInput(); await save(true); // if this save fails, the copy on this device keeps it and saving resumes
      return null;
    } catch (e) { return e instanceof Error ? e.message : String(e); }
    finally { restoreRunning.current = false; }
  };
  const restoreRecovery = async () => { if (!recovery) return; const problem = await restoreDocument(recovery); if (problem) setError(problem); };
  const discardRecovery = () => {
    if (!confirm("Discard the unsaved changes kept on this device? This can’t be undone.")) return;
    setRecovery(null); try { localStorage.removeItem(recoveryKey(essayId)); } catch {}
  };
  // Like Google Docs, these keep this essay and open another; its new id remounts the editor with a clean slate.
  const newEssay = () => leave(async () => `/essay/${encodeURIComponent((await createEssay({ settings: { ...EMPTY_ESSAY_SETTINGS, includeAntigone: settingsRef.current.includeAntigone, profile: { ...settingsRef.current.profile, kind: "" } } })).id)}`); // course, citation and instructions usually carry over
  const copyEssay = () => leave(async () => `/essay/${encodeURIComponent((await createEssay({ copyOf: essayId })).id)}`);
  // Home shows "Moved to …" with Undo for the essay named in the query.
  const shelve = (change: { archived: true } | { trashed: true }) => leave(async () => {
    await patchEssay(essayId, change);
    return `/?moved=${"archived" in change ? "archived" : "trashed"}&essay=${encodeURIComponent(essayId)}`;
  });
  const unarchive = async () => {
    try { await patchEssay(essayId, { archived: false }); setArchived(false); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const restoreFromTrash = async () => {
    try {
      const essay = await patchEssay(essayId, { trashed: false });
      trashedRef.current = false; setTrashed(false); setArchived(!!essay.archivedAt);
      // Only edits made before this tab learned it was trashed are pending; the banner said they weren't saved.
      if (dirty.current) void save(); else setStatus("saved");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const commitTitle = async (value: string) => {
    const next = value.trim().slice(0, TITLE_MAX);
    if (trashedRef.current) { setTitleDraft(title); return; }
    setTitleDraft(next);
    if (next === title) return;
    try { setTitle((await patchEssay(essayId, { title: next })).title); }
    catch (e) { setTitleDraft(title); setError(e instanceof Error ? e.message : String(e)); }
  };
  const renameEssay = () => requestAnimationFrame(() => { titleInput.current?.focus(); titleInput.current?.select(); });
  const shownTitle = displayTitle({ title, text: draftText });
  useEffect(() => {
    if (!loaded) return;
    const before = document.title; document.title = `${shownTitle} – Essay editor`;
    return () => { document.title = before; };
  }, [loaded, shownTitle]);
  const closeSetup = () => {
    try { sessionStorage.setItem(setupClosedKey(essayId), "1"); } catch {}
    setSetupOpen(false); setSetupEditing(false);
    requestAnimationFrame(() => editorRef.current?.focus()); // after the modal closes and restores focus
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
        if (!asking && selectionState.current.toolbar) setToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      // Focusing a toolbar control can temporarily collapse the browser selection.
      // Keep the editor range captured before the control took focus.
      if (document.activeElement?.closest(".docbar")) return;
      savedRange.current = range.cloneRange();
      if (!selectionState.current.formatReady) setFormatReady(true);
      const el = (sel.anchorNode?.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode) as HTMLElement;
      const cs = getComputedStyle(el);
      const block = el.closest<HTMLElement>(BLOCKS);
      const lh = block ? parseFloat(getComputedStyle(block).lineHeight) / parseFloat(getComputedStyle(block).fontSize) : NaN;
      const next = {
        font: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
        size: String(Math.round((parseFloat(cs.fontSize) * 72) / 96)),
        spacing: isNaN(lh) ? "" : String(SPACING.reduce((a, b) => (Math.abs(b * 1.2 - lh) < Math.abs(a * 1.2 - lh) ? b : a))),
        align: block ? getComputedStyle(block).textAlign : "left",
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      };
      if (JSON.stringify(next) !== JSON.stringify(selectionState.current.fmt)) setFmt(next);
      if (sel.isCollapsed) { if (!asking && selectionState.current.toolbar) setToolbar(null); return; }
      setToolbar(toolbarAt(range));
    };
    // The toolbar is fixed to the viewport, so it follows the selection when the essay scrolls.
    const onScroll = () => { const r = savedRange.current; if (selectionState.current.toolbar && r && !r.collapsed) setToolbar(toolbarAt(r)); };
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("selectionchange", onSel); document.removeEventListener("scroll", onScroll, true); };
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
    const root = editorRef.current, selection = window.getSelection();
    const list = cmd === "insertUnorderedList" || cmd === "insertOrderedList";
    // Chrome's list commands drop the caret, so remember it as a text position (the text itself doesn't change).
    const at = list && root && selection?.rangeCount ? [textOffset(root, selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset), textOffset(root, selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset)] : null;
    document.execCommand(cmd, false, value);
    if (root && at) {
      // Chrome can nest a new list inside the styled <p> it came from; lift it out so it stays a valid block.
      root.querySelectorAll(":scope > p > ul, :scope > p > ol").forEach((list) => {
        const p = list.parentElement!;
        if ([...p.childNodes].every((n) => n === list || !n.textContent?.trim())) p.replaceWith(list);
      });
      selectOffsets(root, at[0], at[1]);
      // Switching a list off leaves its text loose in the editor; make it a paragraph again.
      if ([...root.childNodes].some(strayInline)) {
        wrapping.current = true;
        try { document.execCommand("formatBlock", false, "p"); } finally { wrapping.current = false; }
        selectOffsets(root, at[0], at[1]);
      }
    }
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
  // Block styles go through insertHTML so undo/redo can reverse them. Replacing the whole document is the one
  // insertHTML Chrome doesn't merge into the following paragraph; the text, and so the selection, are unchanged.
  const restyleBlocks = (blocks: HTMLElement[], change: (copy: HTMLElement, block: HTMLElement) => void) => {
    const root = editorRef.current, sel = window.getSelection();
    if (!root || !blocks.length || !sel?.rangeCount) return;
    const r = sel.getRangeAt(0);
    const start = textOffset(root, r.startContainer, r.startOffset), end = textOffset(root, r.endContainer, r.endOffset);
    const focused = paragraphs().findIndex((p) => p.dataset.essayFocus === "target");
    blocks.forEach((b) => b.setAttribute("data-restyle", ""));
    const copy = root.cloneNode(true) as HTMLElement;
    blocks.forEach((b) => b.removeAttribute("data-restyle"));
    copy.querySelectorAll<HTMLElement>("[data-restyle]").forEach((c, i) => { c.removeAttribute("data-restyle"); change(c, blocks[i]); });
    copy.querySelectorAll("[data-essay-focus]").forEach((p) => p.removeAttribute("data-essay-focus"));
    const all = document.createRange(); all.selectNodeContents(root);
    sel.removeAllRanges(); sel.addRange(all);
    document.execCommand("insertHTML", false, copy.innerHTML);
    if (focused >= 0) focusRef.current?.focusElement(paragraphs()[focused]); // the focused paragraph was replaced by its copy
    selectOffsets(root, start, end);
    savedRange.current = sel.getRangeAt(0).cloneRange();
  };
  const setSpacing = (v: string) => {
    if (!restore()) return;
    restyleBlocks(selectedBlocks(), (copy) => (copy.style.lineHeight = String(+(+v * 1.2).toFixed(2))));
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
    restyleBlocks(selectedBlocks(), (copy, b) => {
      const cur = (parseFloat(getComputedStyle(b).marginLeft) || 0) * 72 / 96;
      const next = Math.max(0, cur + dir * 36);
      copy.style.marginLeft = next ? `${next}pt` : "";
    });
    onInput();
  };

  // ---------- AI on selection ----------
  const run = async (action: string, q?: string) => {
    const selection = savedRange.current?.toString() ?? "";
    if (!selection.trim() || busy) return;
    focusRef.current?.focusRange(savedRange.current!, q, action === "ask" || action === "evidence" || action === "unclear");
    const source = { quote: selection, range: savedRange.current!.cloneRange(), draft: text(), brief: briefRef.current };
    setBusy(action);
    setError(null);
    setAsking(false);
    setPopover(null);
    openTab("suggestions");
    try {
      // Synonyms only need the surrounding paragraph; sending less makes it ~2x faster
      const para = (savedRange.current?.startContainer.parentElement?.closest<HTMLElement>(BLOCKS))?.innerText;
      const draft = action === "synonyms" && para ? para : text();
      const response = await ai<AiResult>({ mode: "selection", action, selection, question: q, draft, brief: action === "synonyms" ? "" : brief });
      const texts = paragraphs().map((p) => p.innerText.trim());
      const start = source.range.startContainer;
      const own = (start.nodeType === Node.TEXT_NODE ? start.parentElement : start as HTMLElement)?.closest<HTMLElement>(BLOCKS)?.innerText.trim();
      resultSource.current = source;
      setResultAction(action);
      setResult({ ...response, issues: response.issues.map((i) => ({ ...i, id: crypto.randomUUID(), paragraph: own?.includes(i.quote) ? own : texts[anchorParagraph(i.quote, undefined, texts) ?? -1] })) });
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
      const texts = paragraphs().map((p) => p.innerText.trim());
      setReview({ ...result, issues: result.issues.map((i) => ({ ...i, id: crypto.randomUUID(), paragraph: texts[anchorParagraph(i.quote, undefined, texts) ?? -1] })) });
      setReviewDraftSnapshot(draft); lastReviewed.current = `${brief}\u0000${draft}`; setReviewedKey(lastReviewed.current); setReviewBriefSnapshot(brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null); reviewRunning.current = false;
    }
  }, [brief]);

  const autoReviewRef = useRef({ busy, runReview });
  autoReviewRef.current = { busy, runReview };
  useEffect(() => {
    if (!autoReview) return;
    const id = setInterval(() => { if (!autoReviewRef.current.busy && document.visibilityState === "visible") autoReviewRef.current.runReview(); }, REVIEW_EVERY_MS);
    return () => clearInterval(id);
  }, [autoReview]);

  // Resolve against the original passage, never whichever text is selected now.
  const canAccept = (quote: string, paragraphId?: number) => { const scope = paragraphId === undefined ? draftText : paragraphs()[paragraphId]?.innerText ?? ""; return !!quote && scope.includes(quote) && scope.indexOf(quote) === scope.lastIndexOf(quote); };
  const acceptChange = (quote: string, replacement: string, anchoredRange?: Range, paragraphId?: number) => {
    const root = editorRef.current;
    if (!root) return false;
    if (locked()) { setError(trashedRef.current ? TRASHED : `${CONFLICT} Reload the saved version to keep editing.`); return false; }
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
  const liveFresh = !!liveCheck && liveCheck.draft === draftText;
  const reviewDisabled = countWords(draftText) < 80 ? "Write at least 80 words" : `${brief}\u0000${draftText}` === reviewedKey ? "No changes since the last review" : null;

  // Every consumer anchors through Suggestion.paragraphId; undefined means the passage can no longer be located.
  const outlineBlocks = editorRef.current ? essayParagraphs(editorRef.current) : [];
  const outline = outlineBlocks.map((p) => p.innerText.trim());
  const paragraphOf = bodyParagraphOf(outlineBlocks);
  const all = useMemo(() => mergeSuggestions({ selection: result?.issues ?? [], live: liveCheck?.issues ?? [], review: review?.issues ?? [] }, outline), [result, review, liveCheck, draftText]);
  const visible = useMemo(() => quiet ? all.filter((s) => SERIOUS.includes(s.category)) : all, [all, quiet]);
  const active = activeIssue?.id ? all.find((s) => s.id === activeIssue.id) ?? null : activeIssue;
  const outlineIssues = outline.map((_, index) => visible.filter((s) => s.paragraphId === index).length);
  // Hiding the feedback panel hides every mark on the essay too, so you can just write; showing it brings them back.
  const marked = useMemo(() => feedbackVisible ? visible : [], [feedbackVisible, visible]);
  const markedActive = feedbackVisible ? active : null;
  const popoverFor = popover ? visible.find((s) => s.id === popover.id) : undefined;

  // ---------- highlights ----------
  const painted = useRef("");
  useEffect(() => {
    const root = editorRef.current;
    if (!root || !("highlights" in CSS)) return;
    const ranges = (issues: Issue[]) => issues.flatMap((i) => {
      if (i.id !== undefined && i.paragraphId === undefined) return [];
      const range = findRange(root, i.quote, i.paragraphId);
      return range ? [range] : [];
    });
    const paint = () => {
      CSS.highlights.delete("issue");
      CSS.highlights.delete("live");
      for (const category of ISSUE_CATEGORIES) {
        CSS.highlights.set(`essay-${category.toLowerCase().replaceAll(" ", "-")}`, new Highlight(...ranges(marked.filter((s) => s.category === category))));
      }
      CSS.highlights.set("issue-active", new Highlight(...ranges(markedActive ? [markedActive] : [])));
    };
    // Live ranges follow typing, so a text-only change can wait for a pause.
    const key = [...marked.map((s) => s.id), markedActive?.id ?? markedActive?.quote ?? ""].join("|");
    if (key !== painted.current) { painted.current = key; paint(); return; }
    const timer = setTimeout(paint, 120);
    return () => clearTimeout(timer);
  }, [marked, markedActive]);

  // Same test as canAccept, on the paragraph texts this render already read (cards call it on every keystroke).
  const canApply = (s: Suggestion) => {
    const scope = s.paragraphId === undefined ? "" : outline[s.paragraphId] ?? "";
    return !!s.replacement && s.replacement !== s.quote && !!s.quote && scope.includes(s.quote) && scope.indexOf(s.quote) === scope.lastIndexOf(s.quote);
  };
  const closePopover = useCallback(() => setPopover(null), []);
  const removeSuggestion = (s: Suggestion) => {
    const drop = <T extends { issues: Anchored[] }>(current: T | null) => current && { ...current, issues: current.issues.filter((i) => i.id !== s.id) };
    if (s.origin === "live") resolveLive(s, "declined");
    else if (s.origin === "review") setReview(drop);
    else setResult(drop);
    if (activeIssue?.id === s.id) setActiveIssue(null);
    if (popover?.id === s.id) { if (document.activeElement?.closest(".issue-popover")) editorRef.current?.focus({ preventScroll: true }); setPopover(null); }
  };
  const accept = (s: Suggestion) => {
    if (s.paragraphId === undefined || !s.replacement) return;
    const before = liveCheck?.draft;
    if (!acceptChange(s.quote, s.replacement, undefined, s.paragraphId)) return;
    if (s.origin === "live") {
      resolveLive(s, "accepted");
      if (before === draftText) setLiveCheck((c) => c && c.draft === before ? { ...c, draft: text() } : c); // the other suggestions still apply
    } else removeSuggestion(s);
    if (s.origin === "review" && reviewFresh) setReviewDraftSnapshot(text());
    setPopover(null);
  };
  const requestFixes = (s: Suggestion) => { setFixesRequest({ id: s.id, nonce: Date.now() }); setActiveIssue(s); openTab("suggestions"); setPopover(null); };
  const findEvidence = (s: Suggestion) => { setEvidenceRequest({ query: s.quote, nonce: Date.now() }); openTab("sources"); };

  const jumpTo = (issue: Issue) => {
    const root = editorRef.current;
    if (!root) return;
    setActiveIssue(issue);
    const range = issue.id !== undefined && issue.paragraphId === undefined ? null : findRange(root, issue.quote, issue.paragraphId);
    if (!range) { setError("This passage has changed or appears more than once. Select its location in the essay to inspect it."); return; }
    focusRef.current?.focusRange(range);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // ---------- inline card ----------
  const openPopoverAt = (node: Node | null, offset: number, focus = false) => {
    const root = editorRef.current;
    if (!root || !node || !root.contains(node)) { setPopover(null); return; }
    const point = document.createRange();
    point.setStart(node, offset);
    for (const s of marked) {
      if (s.paragraphId === undefined) continue;
      const range = findRange(root, s.quote, s.paragraphId);
      if (!range || !range.isPointInRange(node, offset) || range.compareBoundaryPoints(Range.START_TO_END, point) !== 1) continue;
      setActiveIssue(s);
      setPopover({ id: s.id, rect: range.getBoundingClientRect(), focus });
      return;
    }
    setPopover(null);
  };
  const onEditorClick = (e: React.MouseEvent) => {
    if (!window.getSelection()?.isCollapsed) return;
    const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY);
    if (caret) { openPopoverAt(caret.offsetNode, caret.offset); return; }
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    openPopoverAt(range?.startContainer ?? null, range?.startOffset ?? 0);
  };
  // Google Docs shortcuts, keyed by physical key so ⇧7/⇧8 match on any layout.
  const SHORTCUTS: Record<string, () => void> = {
    KeyB: () => exec("bold"), KeyI: () => exec("italic"), KeyU: () => exec("underline"),
    "Shift+KeyX": () => exec("strikeThrough"),
    "Shift+Digit7": () => exec("insertOrderedList"), "Shift+Digit8": () => exec("insertUnorderedList"),
    "Shift+KeyL": () => setAlignment("left"), "Shift+KeyE": () => setAlignment("center"), "Shift+KeyR": () => setAlignment("right"),
    BracketRight: () => indent(1), BracketLeft: () => indent(-1), Backslash: () => exec("removeFormat"),
  };
  const onEditorKeyDown = (e: React.KeyboardEvent) => {
    const shortcut = (e.metaKey || e.ctrlKey) && !e.altKey && SHORTCUTS[(e.shiftKey ? "Shift+" : "") + (e.code || `Key${e.key.toUpperCase()}`)];
    if (shortcut) {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      e.preventDefault();
      savedRange.current = sel.getRangeAt(0).cloneRange();
      shortcut();
      return;
    }
    if (e.key === "Escape" && toolbar) { e.preventDefault(); setToolbar(null); return; } // preventDefault keeps paragraph focus
    if (!e.altKey || e.key !== "Enter") return;
    e.preventDefault(); // contentEditable must not insert a break
    const sel = window.getSelection();
    if (sel?.rangeCount) openPopoverAt(sel.focusNode, sel.focusOffset, true);
  };

  // Paragraphs are focused only from the outline; any click elsewhere in the essay area returns to the full essay.
  const leaveFocus = (e: React.MouseEvent) => {
    if (editorRef.current?.dataset.focusMode !== "on" || !(e.target instanceof Element)) return;
    if (e.target.closest('[data-essay-focus="target"], .doc-outline')) return;
    focusRef.current?.exit();
  };
  const selectParagraph = (index: number) => {
    const p = paragraphs()[index];
    if (!p) return;
    focusRef.current?.focusElement(p);
    p.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const selectionText = savedRange.current?.toString() ?? "";
  const selectionIsWord = selectionText.trim().split(/\s+/).length === 1;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the editor selection alive

  const selectionCard = result && (result.answer || result.rewrite || result.replacements.length) ? {
    quote: resultSource.current?.quote ?? "", answer: result.answer, rewrite: result.rewrite, replacements: result.replacements, fresh: selectionFresh,
    connections: resultAction === "ask" || resultAction === "evidence" || resultAction === "unclear",
  } : null;
  const jumpToRange = (range: Range) => {
    focusRef.current?.focusRange(range);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const suggestions = <SuggestionsTab suggestions={visible} hiddenByDrafting={all.length - visible.length} activeId={active?.id ?? null} shown={feedbackVisible && tab === "suggestions"}
    draft={draftText} brief={brief} sources={{ manual: settings.sources, includeAntigone: settings.includeAntigone }} words={words} loading={status === "loading"}
    checking={checking} checked={!!liveCheck} checkedAt={liveCheck?.checkedAt} liveFresh={liveFresh} progress={progress}
    onCheck={(grammarOnly) => void runLive(grammarOnly)}
    reviewing={busy === "review"} reviewDisabled={reviewDisabled} onReview={() => void runReview()}
    quiet={quiet} onQuietChange={setQuiet} onAddPrompt={() => openTab("sources")}
    aiCheck={<AiCheck essayId={essayId} shown={feedbackVisible && tab === "suggestions"} brief={brief} root={editorRef} draft={draftText} loaded={loaded} onJump={jumpToRange} />}
    grade={<EssayGrade essayId={essayId} root={editorRef} draft={draftText} brief={brief} words={words} loaded={loaded} onJump={jumpToRange} onAddPrompt={() => openTab("sources")} />}
    selection={selectionCard} selectionBusy={!!busy && busy !== "review"} onReplace={replaceSelection}
    onDismissRewrite={() => setResult((current) => current && ({ ...current, rewrite: "" }))}
    onDismissSelection={() => setResult((current) => current?.issues.length ? { ...current, answer: "", rewrite: "", replacements: [] } : null)}
    onConnections={() => openTab("paragraph")}
    review={review ? { overall: review.overall, fresh: reviewFresh } : null} autoReview={autoReview} onAutoReviewChange={setAutoReview}
    canApply={canApply} onAccept={accept} onApplyFix={(s, revision) => accept({ ...s, replacement: revision })} onDismiss={removeSuggestion} onJump={jumpTo} onFindEvidence={findEvidence}
    fixesRequest={fixesRequest} onFixesStarted={() => setFixesRequest(null)} />;

  if (missing) return (
    <main className="essay-missing">
      <h1>This essay doesn’t exist or isn’t yours</h1>
      <p className="muted">It may have been deleted, or the link may be wrong.</p>
      <Link href="/">Go to all essays</Link>
    </main>
  );

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
        }} onMouseDown={(e) => { if (document.activeElement !== titleInput.current && !(e.target instanceof Element && e.target.closest("select, input"))) e.preventDefault(); }}>
          <a className="doc-home" href="/" aria-label="All essays" title="All essays" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); void leave(() => "/"); }}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6 2.5h8l5 5v14H6z M14 2.5v5h5 M9 12h7 M9 15.5h7 M9 19h4" /></svg>
          </a>
          <input ref={titleInput} className="doc-title" value={titleDraft} placeholder={displayTitle({ title: "", text: draftText })} maxLength={TITLE_MAX}
            aria-label="Essay title" title={trashed ? "Restore this essay to rename it" : "Rename"} disabled={!loaded || trashed || problem === "conflict"} spellCheck={false} onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setTitleDraft(title); skipTitleCommit.current = true; e.currentTarget.blur(); }
            }}
            onBlur={(e) => { if (skipTitleCommit.current) skipTitleCommit.current = false; else void commitTitle(e.currentTarget.value); }} />
          {archived && !trashed && <span className="doc-chip" title="Archived essays are hidden from your recent essays. Unarchive from the File menu.">Archived</span>}
          <FileMenu disabled={!loaded} trashed={trashed} archived={archived} readOnly={trashed || problem === "conflict"} onNewEssay={() => void newEssay()} onOpen={() => void leave(() => "/")} onCopy={() => void copyEssay()} onRename={renameEssay}
            onCheckpoint={() => save(true)} onHistory={() => setHistoryOpen(true)}
            onDownload={(format) => editorRef.current && downloadEssay(editorRef.current, format, shownTitle)} onPrint={() => window.print()} onAssignment={() => openTab("sources")}
            onArchive={() => void (archived ? unarchive() : shelve({ archived: true }))} onTrash={() => void shelve({ trashed: true })} />
          <span className="sep" />
          <fieldset className="format-controls" disabled={!formatReady || trashed || problem === "conflict"} aria-label="Essay formatting">
          <button title="Undo (⌘Z)" aria-label="Undo" onClick={() => exec("undo")}>↶</button>
          <button title="Redo (⇧⌘Z)" aria-label="Redo" onClick={() => exec("redo")}>↷</button>
          <span className="sep" />
          <select title="Font" aria-label="Font" value={FONTS.includes(fmt.font) ? fmt.font : ""} onChange={(e) => setFont(e.target.value)}>
            <option value="" disabled>{fmt.font || "Font"}</option>
            {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <select title="Font size" aria-label="Font size" value={SIZES.includes(+fmt.size) ? fmt.size : ""} onChange={(e) => setSize(e.target.value)}>
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
          <select title="Line spacing" aria-label="Line spacing" value={fmt.spacing} onChange={(e) => setSpacing(e.target.value)}>
            <option value="" disabled>Spacing</option>
            {SPACING.map((s) => <option key={s} value={s}>{s === 1 ? "Single" : s === 2 ? "Double" : s}</option>)}
          </select>
          <button title="Decrease indent" aria-label="Decrease indent" onClick={() => indent(-1)}>⇤</button>
          <button title="Increase indent" aria-label="Increase indent" onClick={() => indent(1)}>⇥</button>
          <button title="Bulleted list" aria-label="Bulleted list" onClick={() => exec("insertUnorderedList")}>•</button>
          <button title="Numbered list" aria-label="Numbered list" onClick={() => exec("insertOrderedList")}>1.</button>
          <button title="Clear formatting" aria-label="Clear formatting" onClick={() => exec("removeFormat")}>T̸</button>
          </fieldset>
          {!formatReady && !trashed && problem !== "conflict" && <span className="format-hint muted">Click in the paper to format</span>}
          <span className="grow" />
          <WordGoal words={words} target={settings.targetWords} onClick={() => openTab("sources")} />
          <span className={`doc-status ${status === "error" && !trashed ? "error" : "muted"}`}
            title={trashed ? TRASHED : status === "saved" ? "All changes saved to your account" : status === "offline" ? "Your changes are kept on this device and will save to your account when you’re back online" : undefined}>
            {trashed ? "In trash · read-only" : status === "error" ? "Not saved" : status === "saving" ? "Saving…" : status === "unsaved" ? "Unsaved" : status === "saved" ? "Saved" : status === "offline" ? "Offline · saved on this device" : "Loading…"}</span>
          {/* On phones the feedback panel sits below the essay, so its AI key button moves up here. */}
          <span className="docbar-ai"><AiAccount compact /></span>
          <AccountMenu account={account} beforeSignOut={flush} />
        </div>
        <div className="essay-scroll" onClick={leaveFocus}>
        {trashed && <div className="recovery-banner" role="status">{status === "error" ? "This essay is in the trash, so your latest changes weren’t saved. Restore it to keep editing and save them." : "This essay is in the trash and can’t be edited."}{" "}<button onClick={() => void restoreFromTrash()}>Restore</button></div>}
        {problem === "signed-out" && <div className="recovery-banner" role="alert">You’ve been signed out. Sign in again in another tab, then click Try again — your changes are kept on this device.{" "}
          <a href={`/login?next=/essay/${encodeURIComponent(essayId)}`} target="_blank" rel="noopener">Sign in</a>{" "}
          <button onClick={() => void (loadedRef.current ? save() : loadDraft())}>Try again</button>
        </div>}
        {loaded && status === "error" && (problem === "conflict" || problem === "failed") && <div className="recovery-banner" role="alert">{problem === "conflict" ? "This essay was changed in another tab or on another device, so this tab stopped saving and is read-only. Download your text to keep this tab’s version, then reload the saved one." : "Couldn’t save to your account."}{" "}
          {problem !== "conflict" && <button onClick={() => void save()}>Try again</button>}
          <button onClick={() => editorRef.current && downloadEssay(editorRef.current, "text", shownTitle)}>Download text</button>
          <button onClick={() => { if (dirty.current && !confirm("Discard this tab's unsaved changes and load the saved version? Download your draft first to keep them.")) return; try { localStorage.removeItem(recoveryKey(essayId)); } catch {} void loadDraft(); }}>Reload saved version</button>
        </div>}
        {recovery && !trashed && <div className="recovery-banner" role="status"><p>This device has newer unsaved changes{recovery.savedAt ? ` from ${whenSaved(recovery.savedAt).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())}` : ""}.</p>
          <button onClick={() => void restoreRecovery()}>Restore</button><button onClick={discardRecovery}>Discard</button></div>}
        {!loaded && error && <div className="recovery-banner" role="alert">{error}<button onClick={() => void loadDraft()}>Retry loading essay</button></div>}
        <div className="page-wrap">
          <ParagraphOutline essayId={essayId} paragraphs={outline} active={focusedParagraph ? outline.indexOf(focusedParagraph) : -1} issueCounts={outlineIssues} paragraphOf={paragraphOf}
            open={outlineOpen} onToggle={() => setOutlineOpen((v) => !v)} onSelect={selectParagraph} onShowAll={() => focusRef.current?.exit()}
            brief={brief} settings={settings} updateSettings={updateSettings} />
          <div className="page-fit" ref={pageFitRef}>
          <div
            ref={editorRef}
            className="page"
            contentEditable={loaded && !trashed && problem !== "conflict"}
            role="textbox"
            aria-label="Essay document"
            aria-multiline="true"
            aria-busy={!loaded}
            onClick={onEditorClick}
            onKeyDown={onEditorKeyDown}
            suppressContentEditableWarning
            spellCheck
            onInput={() => onInput()}
            onPaste={onPaste}
          />
          </div>
        </div>
        </div>
      </div>

      {toolbar && (
        <div className={toolbar.below ? "toolbar below" : "toolbar"} role="toolbar" aria-label="Ask AI about the highlighted text" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={keep}>
          {asking ? (
            <form onSubmit={(e) => { e.preventDefault(); if (!question.trim() || busy) return; run("ask", question); setQuestion(""); }}>
              <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about the highlighted text…"
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAsking(false); } }} // stop: Escape also exits paragraph focus
                onBlur={(e) => { if (e.relatedTarget) { setAsking(false); setToolbar(null); } }} /> {/* only when focus moved within the page, not on app switch */}
            </form>
          ) : (
            <>
              <button disabled={!!busy} title="Ask whether this passage is clear to a reader" onClick={() => run("unclear")}>Unclear?</button>
              {selectionIsWord && <button disabled={!!busy} title="Suggest other words that fit here" onClick={() => run("synonyms")}>Synonyms</button>}
              <button disabled={!!busy} title="Suggest a shorter version" onClick={() => run("tighten")}>Tighten</button>
              <button disabled={!!busy} title="Check whether this claim is supported" onClick={() => run("evidence")}>Evidence?</button>
              {selectionText.trim().length <= 400 && !trashed && problem !== "conflict" && <button title="Pin as your thesis" onClick={() => { updateSettings((s) => ({ ...s, thesis: selectionText.trim().slice(0, 2000) })); setToolbar(null); }}>Set as thesis</button>}
              <button disabled={!!busy} title="Ask your own question about this passage" onClick={() => setAsking(true)}>{busy ? "Working…" : "Ask…"}</button>
            </>
          )}
        </div>
      )}

      <FeedbackPanel visible={feedbackVisible} onVisibleChange={setFeedbackVisible} tab={tab} onTabChange={setTab} busy={!!busy || checking > 0}
        counts={{ suggestions: visible.length, paragraph: settings.tasks.filter((t) => t.kind === "revision" && t.status === "open").length, sources: settings.tasks.filter((t) => t.kind === "source" && t.status === "open").length }}
        error={error} onDismissError={() => setError(null)} suggestions={suggestions}
        paragraph={<fieldset className="read-only-lock" disabled={trashed || problem === "conflict"}><ParagraphTab focusRef={focusRef} editorRef={editorRef} draft={draftText} documentVersion={`${documentRevision}:${documentHtml(editorRef.current)}`} brief={brief}
          settings={settings} updateSettings={updateSettings} focusedParagraph={focusedParagraph} context={essayContext(draftText, brief, settings.sources, settings.includeAntigone)}
          onTargetChange={setFocusedParagraph} onAnalysis={recordPriorities} onJumpTask={jumpToTask} /></fieldset>}
        sources={<fieldset className="read-only-lock" disabled={trashed || problem === "conflict"}><SourcesTab onEditSetup={() => { setSetupEditing(true); setSetupOpen(true); }} editorRef={editorRef} draft={draftText} loaded={loaded} words={words} brief={brief} onBriefChange={changeBrief} getBrief={getBrief}
          settings={settings} getSettings={getSettings} updateSettings={updateSettings} onJumpTask={jumpToTask} onError={setError} evidenceRequest={evidenceRequest} /></fieldset>} />
      {feedbackVisible && popover && popoverFor && <IssuePopover suggestion={popoverFor} rect={popover.rect} autoFocus={popover.focus} canApply={canApply(popoverFor)}
        onAccept={() => accept(popoverFor)} onDismiss={() => removeSuggestion(popoverFor)} onSuggestFixes={() => requestFixes(popoverFor)} onClose={closePopover} />}
      <VersionHistory essayId={essayId} open={historyOpen} onClose={() => setHistoryOpen(false)} versions={versions} onRestore={restoreDocument} />
      <SetupWelcome open={setupOpen} editing={setupEditing} onClose={closeSetup} brief={brief} onBriefChange={changeBrief} settings={settings} updateSettings={updateSettings} />
    </div>
  );
}

const CONFLICT = "This essay was changed in another tab or on another device.";
const TRASHED = "This essay is in the trash. Restore it to keep editing.";

/** Trim settings back inside the schema's limits instead of rejecting them, so one oversized field never blocks loading or saving. */
function fitSettings(raw: unknown): EssaySettings {
  const s = (raw ?? EMPTY_ESSAY_SETTINGS) as Partial<EssaySettings>;
  const parsed = EssaySettingsSchema.safeParse(s);
  if (parsed.success) return parsed.data;
  const cut = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
  const profile = WritingProfileSchema.safeParse({ kind: cut(s.profile?.kind, 100), course: cut(s.profile?.course, 200), citation: cut(s.profile?.citation, 40), instructions: cut(s.profile?.instructions, 4000) });
  const checklist = Object.fromEntries(Object.entries(s.checklist && typeof s.checklist === "object" ? s.checklist : {}).filter(([, v]) => typeof v === "boolean"));
  const fitted = EssaySettingsSchema.safeParse({
    targetWords: clampWords(s.targetWords), checklist, includeAntigone: s.includeAntigone !== false,
    notes: (Array.isArray(s.notes) ? s.notes : []).filter((n) => n?.note).map((n) => ({ paragraph: cut(n.paragraph, 20000), note: cut(n.note, 5000) })).slice(-150), // newest last
    tasks: (Array.isArray(s.tasks) ? s.tasks : []).map((t) => ({ ...t, id: cut(t?.id, 100), paragraph: cut(t?.paragraph, 20000), quote: cut(t?.quote, 20000), task: cut(t?.task, 5000), reason: cut(t?.reason, 5000), context: cut(t?.context, 100), note: cut(t?.note, 5000) }))
      .filter((t) => RevisionTaskSchema.safeParse(t).success).slice(-300),
    thesis: cut(s.thesis, 2000), sources: cut(s.sources, 50000), profile: profile.success ? profile.data : EMPTY_ESSAY_SETTINGS.profile,
  });
  return fitted.success ? fitted.data : { ...EMPTY_ESSAY_SETTINGS, ...s }; // unreachable in practice; never silently erase settings
}

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
