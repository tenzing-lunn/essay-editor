import { withAiUsage } from "@/lib/ai-usage";
import { publicAiError } from "@/lib/ai-config";
import { writingScope } from "@/lib/claude";
import { WritingRequest, writingContext } from "@/lib/essay-workflow";
import { ACTIONS, analyzeParagraph, askAboutSelection, checkEssaySources, checkParagraph, reviewDraft, scorePredictability, suggestFixes } from "@/lib/claude";
import { gradeEssay, mapArgument } from "@/lib/claude";
import { GradeRequest } from "@/lib/essay-grade";
import { ArgumentMapRequest } from "@/lib/argument-map";
import { PredictabilityRequest } from "@/lib/ai-check";
import { FocusRequest } from "@/lib/essay-focus";
import { SourceCheckRequest } from "@/lib/essay-workflow";
import { FixRequest } from "@/lib/essay-fixes";
import { z } from "zod";
import { rejectCrossSite } from "@/lib/same-origin";

// Every mode is size-limited here so oversized or malformed text never reaches a provider.
const Draft = z.string().max(200000);
const Brief = z.string().max(20000).optional();
const ReviewRequest = z.object({ draft: Draft, brief: Brief });
const LiveRequest = z.object({ paragraph: z.string().max(20000).default(""), thesis: z.string().max(40000).default(""), grammarOnly: z.boolean().optional() });
const SelectionRequest = z.object({ action: z.string(), draft: Draft, selection: z.string().min(1).max(15000), question: z.string().max(4000).optional(), brief: Brief });

type AiBody = {
  mode: "selection" | "review" | "live" | "fixes" | "focus" | "sources" | "aicheck" | "outline" | "grade";
  action?: string;
  draft: string;
  selection?: string;
  question?: string;
  brief?: string;
  paragraph?: string;
  thesis?: string;
  grammarOnly?: boolean;
  writing?: unknown;
};

async function handlePost(req: Request) {
  const body = await req.json().catch(() => null) as AiBody | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  const writing = WritingRequest.safeParse(body.writing ?? {});
  if (!writing.success) return Response.json({ error: "Your writing setup is too long. Shorten your notes for the AI or your working thesis." }, { status: 400 });
  return writingScope.run(writingContext(writing.data), () => handleMode(body));
}

async function handleMode(body: AiBody) {
  try {
    if (body.mode === "sources") {
      const parsed = SourceCheckRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid source check." }, { status: 400 });
      return Response.json(await checkEssaySources(parsed.data));
    }
    if (body.mode === "outline") {
      const parsed = ArgumentMapRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid outline request." }, { status: 400 });
      return Response.json(await mapArgument(parsed.data));
    }
    if (body.mode === "grade") {
      const parsed = GradeRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: "The essay is empty or too long to grade." }, { status: 400 });
      return Response.json(await gradeEssay(parsed.data));
    }
    if (body.mode === "aicheck") {
      const parsed = PredictabilityRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: "The essay is too long or empty for an AI check. Check a shorter section." }, { status: 400 });
      return Response.json(await scorePredictability(parsed.data));
    }
    if (body.mode === "focus") {
      const parsed = FocusRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid paragraph selection." }, { status: 400 });
      return Response.json(await analyzeParagraph(parsed.data));
    }
    if (body.mode === "fixes") {
      const parsed = FixRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: "A draft and feedback passage are required." }, { status: 400 });
      return Response.json(await suggestFixes(parsed.data));
    }
    if (body.mode === "review") {
      const parsed = ReviewRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: "The draft is too long to review. Review a shorter section." }, { status: 400 });
      return Response.json(await reviewDraft(parsed.data));
    }
    if (body.mode === "live") {
      const parsed = LiveRequest.safeParse(body);
      if (!parsed.success) return Response.json({ error: "This paragraph is too long to check." }, { status: 400 });
      return Response.json(await checkParagraph({ ...parsed.data, grammarOnly: parsed.data.grammarOnly === true }));
    }
    const parsed = SelectionRequest.safeParse(body);
    if (!parsed.success || !Object.hasOwn(ACTIONS, parsed.data.action)) {
      return Response.json({ error: "Choose an action and select up to 15,000 characters." }, { status: 400 });
    }
    return Response.json(await askAboutSelection({ ...parsed.data, action: parsed.data.action as keyof typeof ACTIONS }));
  } catch (e) {
    const failure = publicAiError(e);
    return Response.json({ error: failure.error }, { status: failure.status });
  }
}

export function POST(req: Request) {
  const blocked = rejectCrossSite(req); if (blocked) return blocked;
  return withAiUsage(() => handlePost(req));
}
