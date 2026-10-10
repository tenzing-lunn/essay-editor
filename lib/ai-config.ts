export type AiProvider = "anthropic" | "openai";
export type AiSettings = { provider: AiProvider; apiKey: string; economy: boolean };
export type AiCredentials = AiSettings & { model: string };

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

// Shared by the settings form and the server, so a key is never sent to the other company's API.
export function keyProblem(provider: AiProvider, apiKey: string): string | null {
  // Real keys are printable ASCII; this also catches invisible characters copied from chats or PDFs.
  if (!apiKey || apiKey.length > 512 || /[^\x21-\x7e]/.test(apiKey)) return "The API key contains invalid or hidden characters. Copy it again from your provider and paste the key alone.";
  if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) return "Claude keys start with sk-ant-. Check you chose the right provider.";
  if (provider === "openai" && (!apiKey.startsWith("sk-") || apiKey.startsWith("sk-ant-"))) return "OpenAI keys start with sk- (not sk-ant-). Check you chose the right provider.";
  return null;
}

// Resolve on every request; never cache or share a visitor's credentials.
// `fast` always picks Haiku; `ignoreEconomy` keeps Sonnet for a non-fast request even in economy mode. OpenAI has one model.
export function resolveAiCredentials(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, fast: boolean, ignoreEconomy = false): AiCredentials {
  const selected = headers.get("x-ai-provider");
  const provider = selected ?? env.AI_PROVIDER ?? "anthropic";
  if (provider !== "anthropic" && provider !== "openai") throw new AiError("Choose Claude or OpenAI in AI settings.");
  const supplied = headers.get("x-ai-key");
  const serverKey = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const apiKey = (supplied ?? (env.AI_ALLOW_SERVER_KEY === "true" ? serverKey : "") ?? "").trim();
  if (!apiKey) throw new AiError("Connect your API key in AI settings to use AI tools.", 401);
  const problem = keyProblem(provider, apiKey);
  if (problem) throw new AiError(problem);
  const economy = headers.get("x-ai-economy") !== "false";
  const model = provider === "openai" ? "gpt-4.1-mini" : fast || (economy && !ignoreEconomy) ? "claude-haiku-5-5" : "claude-sonnet-5-5";
  return { provider, apiKey, economy, model };
}

export function publicAiError(error: unknown): { error: string; status: number } {
  if (error instanceof AiError) return { error: error.message, status: error.status };
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if (status === 401 || status === 403) return { error: "Your provider rejected this API key. Check the key and its model access.", status: 401 };
  if (status === 402 || status === 429) return { error: "Your provider's credit or rate limit was reached. Check billing or try again shortly.", status: 429 };
  if (status >= 500) return { error: "The AI provider is busy or unavailable. Try again shortly.", status: 503 };
  // Provider messages may contain secrets or submitted text. Never forward them.
  return { error: "The AI request failed. Check your provider account and try again.", status: 502 };
}
