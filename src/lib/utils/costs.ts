/**
 * Minimal per-1K-tokens price map (USD).
 * Extend as your model registry grows; numbers are illustrative.
 */
export const openaiCostUSD: Record<string, number> = {
  'gpt-3.5-turbo': 0.0015,
  'gpt-4':         0.03,     // input price per 1K tokens
  'gpt-4o':        0.015
};

/**
 * Get cost for model id or fallback to 0.02 USD / 1K tokens.
 */
export function pricePer1K(model: string): number {
  return openaiCostUSD[model] ?? 0.02;
}