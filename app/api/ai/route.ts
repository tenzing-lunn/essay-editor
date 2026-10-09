import { withAiUsage } from "@/lib/ai-usage";
import { publicAiError } from "@/lib/ai-config";
import { ACTIONS, analyzeParagraph, askAboutSelection, checkEssaySources, checkParagraph, reviewDraft, scorePredictability, suggestFixes } from "@/lib/claude";
import { mapArgument } from "@/lib/claude";
import { ArgumentMapRequest } from "@/lib/argument-map";
import { PredictabilityRequest } from "@/lib/ai-check";
import { FocusRequest } from "@/lib/essay-focus";
import { SourceCheckRequest } from "@/lib/essay-workflow";
import { z } from "zod";
import { rejectCrossSite } from "@/lib/same-origin";

const FixRequest = z.object({
  draft: z.string().trim().min(1),
  brief: z.string().optional(),
  issue: z.object({ quote: z.string().trim().min(1), note: z.string().trim().min(1) }),
});

async function handlePost(req: Request) {
  try {
  const body = (await req.json()) as {
    mode: "selection" | "review" | "live" | "fixes" | "focus" | "sources" | "aicheck" | "outline";
    action?: string;
    draft: string;
    selection?: string;
    question?: string;
    brief?: string;
    paragraph?: string;
    thesis?: string;
    grammarOnly?: boolean;
  };
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
      return Response.json(await reviewDraft({ draft: body.draft, brief: body.brief }));
    }
    if (body.mode === "live") {
      return Response.json(await checkParagraph({ paragraph: body.paragraph ?? "", thesis: body.thesis ?? "", grammarOnly: body.grammarOnly === true }));
    }
    if (!body.action || !Object.hasOwn(ACTIONS, body.action) || !body.selection) {
      return Response.json({ error: "action and selection are required" }, { status: 400 });
    }
    return Response.json(
      await askAboutSelection({
        action: body.action as keyof typeof ACTIONS,
        draft: body.draft,
        selection: body.selection,
        question: body.question,
        brief: body.brief,
      }),
    );
  } catch (e) {
    const failure = publicAiError(e);
    return Response.json({ error: failure.error }, { status: failure.status });
  }
}

export function POST(req: Request) {
  const blocked = rejectCrossSite(req); if (blocked) return blocked;
  return withAiUsage(() => handlePost(req));
}
