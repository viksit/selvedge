
/**
 * Ultra-cheap token estimator.
 * Good enough for cost-guardrails; replace with tiktoken if you need accuracy.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // rough heuristic: 1 token ≈ 4 characters for English prose
  return Math.ceil(text.length / 4);
}