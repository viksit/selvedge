import { MetricFn } from './types';

/** Generic exact-match metric. */
export function exactMatch(): MetricFn<any, any> {
  return (pred, gold) => (JSON.stringify(pred) === JSON.stringify(gold) ? 1 : 0);
}

/** Simple F-1 for sets of strings. */
export function f1(): MetricFn<string[] | string, string[] | string> {
  return (p, g) => {
    const pred = Array.isArray(p) ? new Set(p) : new Set([p]);
    const gold = Array.isArray(g) ? new Set(g) : new Set([g]);
    const hits = [...pred].filter(x => gold.has(x)).length;
    if (!hits) return 0;
    const precision = hits / pred.size;
    const recall    = hits / gold.size;
    return 2 * precision * recall / (precision + recall);
  };
}