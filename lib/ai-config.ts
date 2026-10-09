export type AiProvider = "anthropic" | "openai";
export type AiSettings = { provider: AiProvider; apiKey: string; economy: boolean };
export type AiCredentials = AiSettings & { model: string };

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

// Resolve on every request; never cache or share a visitor's credentials.
export function resolveAiCredentials(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, fast: boolean): AiCredentials {
  const selected = headers.get("x-ai-provider");
  const provider = selected ?? env.AI_PROVIDER ?? "anthropic";
  if (provider !== "anthropic" && provider !== "openai") throw new AiError("Choose Claude or OpenAI in AI settings.");
  const supplied = headers.get("x-ai-key");
  const serverKey = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const apiKey = (supplied ?? (env.AI_ALLOW_SERVER_KEY === "true" ? serverKey : "") ?? "").trim();
  if (!apiKey) throw new AiError("Open AI settings and connect your own API key to use AI tools.", 401);
  if (apiKey.length > 512 || /[\s\x00-\x1f\x7f]/.test(apiKey)) throw new AiError("The API key contains invalid characters. Paste the key alone.");
  const economy = headers.get("x-ai-economy") !== "false";
  const model = provider === "openai" ? "gpt-4.1-mini" : fast || economy ? "claude-haiku-5-5" : "claude-sonnet-5-5";
  return { provider, apiKey, economy, model };
}

export function publicAiError(error: unknown): { error: string; status: number } {
  if (error instanceof AiError) return { error: error.message, status: error.status };
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if (status === 401 || status === 403) return { error: "Your provider rejected this API key. Check the key and model access in AI settings.", status: 401 };
  if (status === 402 || status === 429) return { error: "Your provider's credit or rate limit was reached. Check billing or try again shortly.", status: 429 };
  if (status >= 500) return { error: "The AI provider is busy or unavailable. Try again shortly.", status: 503 };
  // Provider messages may contain secrets or submitted text. Never forward them.
  return { error: "The AI request failed. Check your provider account and try again.", status: 502 };
}
