import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AiError, type AiCredentials } from "./ai-config.ts";
import { recordAiUsage } from "./ai-usage.ts";

type Message = { role: "user" | "assistant"; content: string };

export async function openAiText(credentials: AiCredentials, system: string, messages: Message[], maxTokens: number, schema?: z.ZodType): Promise<string> {
  let usageRecorded = false;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${credentials.apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(90000),
      redirect: "error",
      cache: "no-store",
      body: JSON.stringify({
        model: credentials.model, max_completion_tokens: maxTokens, store: false,
        messages: [{ role: "system", content: system }, ...messages],
        ...(schema ? { response_format: { type: "json_schema", json_schema: { name: "essay_response", strict: true, schema: zodOutputFormat(schema).schema } } } : {}),
      }),
    });
    if (!response.ok) {
      const error = new Error("Provider request failed") as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    recordAiUsage(credentials, data.usage, data.model ?? credentials.model);
    usageRecorded = true;
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new AiError("The provider declined this request. Try changing the selection or question.", 422);
    if (choice?.finish_reason === "length") throw new AiError("The response was too long. Try a smaller selection or shorter draft.", 422);
    if (typeof choice?.message?.content !== "string") throw new Error("No model output");
    return choice.message.content;
  } catch (error) {
    if (!usageRecorded) recordAiUsage(credentials, null);
    throw error;
  }
}

// Pin auth and host so server env (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL) never rides along with a visitor's key.
const anthropicClient = (apiKey: string) => new Anthropic({
  apiKey, authToken: null, baseURL: "https://api.anthropic.com", maxRetries: 2, timeout: 90000, fetchOptions: { redirect: "error" },
});

// Sonnet 5.5 and Haiku 5.5 both think by default and that counts against max_tokens, so turn it off.
// Sonnet 5.5 only accepts between_tools for that; Haiku 5.5 rejects it and takes disabled (at effort high or below).
const noThinking = (model: string) => ({ type: model === "claude-sonnet-5-5" ? "between_tools" as const : "disabled" as const });

export async function structuredAi<T extends z.ZodType>(credentials: AiCredentials, schema: T, system: string, user: string, maxTokens: number, effort: "low" | "medium" = "low"): Promise<z.infer<T>> {
  if (credentials.provider === "openai") return schema.parse(JSON.parse(await openAiText(credentials, system, [{ role: "user", content: user }], maxTokens, schema)));
  const result = await anthropicClient(credentials.apiKey).messages.create({
    model: credentials.model, max_tokens: maxTokens, system,
    thinking: noThinking(credentials.model),
    output_config: { format: zodOutputFormat(schema), effort },
    messages: [{ role: "user", content: user }],
  }).catch((error) => { recordAiUsage(credentials, null); throw error; });
  recordAiUsage(credentials, result.usage, result.model);
  if (result.stop_reason === "refusal") throw new AiError("The provider declined this request. Try changing the selection or question.", 422);
  if (result.stop_reason === "max_tokens") throw new AiError("The response was too long. Try a smaller selection or shorter draft.", 422);
  const text = result.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("No model output");
  return schema.parse(JSON.parse(text.text));
}
