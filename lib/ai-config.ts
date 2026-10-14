export type AiProvider = "anthropic" | "openai";
export type AiSettings = { provider: AiProvider; apiKey: string; economy: boolean };
export type AiCredentials = AiSettings & { model: string };
/** This month's free checks; every response that ran on the allowance carries it as the x-ai-free header. */
export type AiFree = { used: number; limit: number; resetsAt: string };

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

// Whether the current request holds a reserved free check. That decision needs the database and request-scoped storage,
// which live in lib/server/ai-quota.ts; it registers its reader here because this file is bundled for the browser too
// (the settings form uses keyProblem) and lib/claude.ts calls resolveAiCredentials with three arguments.
let freeReader = () => false;
export const registerFreeReader = (reader: () => boolean) => { freeReader = reader; };

// Resolve on every request; never cache or share a visitor's credentials.
export function resolveAiCredentials(headers: Pick<Headers, "get">, env: NodeJS.ProcessEnv, fast: boolean, free = freeReader()): AiCredentials {
  const supplied = headers.get("x-ai-key");
  // A visitor key is never on the allowance; a free check runs on the server key for AI_PROVIDER with the economy model.
  const onFree = free && supplied == null;
  const provider = (onFree ? null : headers.get("x-ai-provider")) ?? env.AI_PROVIDER ?? "anthropic";
  if (provider !== "anthropic" && provider !== "openai") throw new AiError("Choose Claude or OpenAI in AI settings.");
  const serverKey = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const apiKey = (supplied ?? (env.AI_ALLOW_SERVER_KEY === "true" || onFree ? serverKey : "") ?? "").trim();
  if (!apiKey) throw new AiError("Connect your API key in AI settings to use AI tools.", 401);
  const problem = keyProblem(provider, apiKey);
  if (problem) throw new AiError(problem);
  const economy = onFree || headers.get("x-ai-economy") !== "false";
  const model = provider === "openai" ? "gpt-4.1-mini" : fast || economy ? "claude-haiku-5-5" : "claude-sonnet-5-5";
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
