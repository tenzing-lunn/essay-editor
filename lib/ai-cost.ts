export const PRICING_DATE = "October 9, 2026";
export type AiReceipt = { model: string; inputTokens: number; outputTokens: number; costUsd: number | null };
export type AiCost = { costUsd: number; requests: number; unpriced: number; inputTokens: number; outputTokens: number; last: AiReceipt | null };
export const EMPTY_AI_COST: AiCost = { costUsd: 0, requests: 0, unpriced: 0, inputTokens: 0, outputTokens: 0, last: null };

// Standard USD per million tokens. Sources linked in AI settings and README.
// `long` replaces the rates when the prompt (input plus cache tokens) exceeds LONG_PROMPT_TOKENS.
const LONG_PROMPT_TOKENS = 100_000;
const RATES = [
  { prefix: "gpt-4.1-mini", input: 0.4, output: 1.6, read: 0.1 },
  { prefix: "claude-haiku-5-5", input: 0.1, output: 0.5, read: 0.01, long: { input: 0.5, output: 2.5, read: 0.05 } },
  { prefix: "claude-sonnet-5-5", input: 2, output: 10, read: 0.2 },
];
const tokens = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function estimateAiCost(provider: "anthropic" | "openai", model: string, usage: unknown): AiReceipt {
  const data = usage as Record<string, unknown> | null;
  const input = data?.[provider === "openai" ? "prompt_tokens" : "input_tokens"];
  const output = data?.[provider === "openai" ? "completion_tokens" : "output_tokens"];
  const rate = RATES.find((r) => model === r.prefix || model.startsWith(`${r.prefix}-`));
  if (!rate || typeof input !== "number" || typeof output !== "number" || !Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0) {
    return { model, inputTokens: tokens(input), outputTokens: tokens(output), costUsd: null };
  }
  if (provider === "openai") {
    const details = data?.prompt_tokens_details as Record<string, unknown> | undefined;
    const cached = Math.min(input, tokens(details?.cached_tokens));
    return { model, inputTokens: input, outputTokens: output, costUsd: ((input - cached) * rate.input + cached * rate.read + output * rate.output) / 1e6 };
  }
  const read = tokens(data?.cache_read_input_tokens);
  const created = tokens(data?.cache_creation_input_tokens);
  const creation = data?.cache_creation as Record<string, unknown> | undefined;
  const hour = Math.min(created, tokens(creation?.ephemeral_1h_input_tokens));
  const prompt = input + read + created;
  const r = rate.long && prompt > LONG_PROMPT_TOKENS ? rate.long : rate;
  return { model, inputTokens: prompt, outputTokens: output,
    costUsd: (input * r.input + read * r.read + (created - hour) * r.input * 1.25 + hour * r.input * 2 + output * r.output) / 1e6 };
}

export function validReceipt(value: unknown): value is AiReceipt {
  if (!value || typeof value !== "object") return false;
  const r = value as AiReceipt;
  return typeof r.model === "string" && r.model.length < 100 && Number.isSafeInteger(r.inputTokens) && r.inputTokens >= 0 && Number.isSafeInteger(r.outputTokens) && r.outputTokens >= 0 && (r.costUsd === null || typeof r.costUsd === "number" && Number.isFinite(r.costUsd) && r.costUsd >= 0);
}

export function addAiReceipts(total: AiCost, receipts: AiReceipt[]): AiCost {
  return receipts.filter(validReceipt).reduce((sum, receipt) => ({
    costUsd: sum.costUsd + (receipt.costUsd ?? 0), requests: sum.requests + 1,
    unpriced: sum.unpriced + (receipt.costUsd === null ? 1 : 0),
    inputTokens: sum.inputTokens + receipt.inputTokens, outputTokens: sum.outputTokens + receipt.outputTokens, last: receipt,
  }), total);
}

export function formatAiCost(usd: number): string {
  return usd === 0 ? "$0.0000" : usd < 0.0001 ? "<$0.0001" : `$${usd.toFixed(4)}`;
}
