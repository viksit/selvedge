import { z } from 'zod';
import { PromptTemplate } from '../prompts';
import { TrainExample, MetricFn, OptimizerSpec } from './types';
import { estimateTokens } from '../utils/tokens';
import { openaiCostUSD } from '../utils/costs';
import { debug } from '../utils/debug';

/** Options for the few-shot optimiser. */
export interface FewShotOpts<I, O> {
  trainset:   TrainExample<I, O>[];
  metric:     MetricFn<O, O>;
  maxDemos?:  number;     // default 4
  trials?:    number;     // default 80
  costCapUSD?: number;    // default Infinity
}

/** Factory exported to users. */
export function fewShot<I, O>(
  opts: FewShotOpts<I, O>
): OptimizerSpec<PromptTemplate<O, I>> {

  const {
    trainset,
    metric,
    maxDemos = 4,
    trials   = 80,
    costCapUSD = Number.POSITIVE_INFINITY
  } = opts;

  return {
    async run(base: PromptTemplate<O, I>): Promise<PromptTemplate<O, I>> {
      let bestScore = -Infinity;
      let bestClone: PromptTemplate<O, I> = base;
      debug('optimizer:few-shot', 'Starting run with base prompt:', base);

      const demoPool = trainset.slice(0, 12);            // cap brute pool
      const demoCombos: TrainExample<I, O>[][] = [];

      /* --- enumerate / sample demo sets --------------------------------- */
      const brute = demoPool.length <= maxDemos && demoPool.length <= 6;
      if (brute) {
        // brute force every subset up to maxDemos
        debug('optimizer:few-shot', 'Using brute force for demo sets.');
        const subsets = (arr: any[]): any[][] =>
          arr.length === 0
            ? [[]]
            : subsets(arr.slice(1)).flatMap(s => [s, [arr[0], ...s]]);
        subsets(demoPool).forEach(set => {
          if (set.length && set.length <= maxDemos) demoCombos.push(set);
        });
      } else {
        // random sample
        debug('optimizer:few-shot', 'Using random sampling for demo sets.');
        for (let i = 0; i < trials; i++) {
          const shuffled = [...demoPool].sort(() => Math.random() - 0.5);
          demoCombos.push(shuffled.slice(0, maxDemos));
        }
      }
      debug('optimizer:few-shot', `Generated ${demoCombos.length} demo combinations.`);

      /* --- evaluate each candidate -------------------------------------- */
      let runningCost = 0;

      for (const demos of demoCombos) {
        debug('optimizer:few-shot', 'Evaluating demo set:', demos);
        if (demos.length === 0) {
          debug('optimizer:few-shot', 'Skipping empty demo set.');
          continue;
        }
        const promptCost =
          (estimateTokens(base.render(demos[0].input)) / 1000) *
          openaiCostUSD['gpt-4o'];
        if (runningCost + promptCost > costCapUSD) {
          debug('optimizer:few-shot', `Cost cap exceeded: ${runningCost + promptCost} > ${costCapUSD}. Stopping evaluation.`);
          break;
        }

        // Build a few‑shot prefix manually (safer than relying on .train())
        const fewShotPrefix = buildFewShotPrefix(demos);

        const variant = base.clone().prefix(fewShotPrefix);

        let scoreSum = 0;
        for (const ex of trainset) {
          const pred = await variant(ex.input);
          scoreSum += await metric(pred, ex.output);
        }
        const avg = scoreSum / trainset.length;

        if (avg > bestScore) {
          bestScore = avg;
          bestClone = variant;
          debug('optimizer:few-shot', `New best score: ${bestScore}. Variant:`, bestClone);
        }
        runningCost += promptCost;
      }

      debug('optimizer:few-shot', `Finished run. Best score: ${bestScore}. Returning prompt:`, bestClone);
      return bestClone;
    }
  };
}

/* Helper: convert demo tuples to readable prompt text  */
function buildFewShotPrefix<I, O>(demos: TrainExample<I, O>[]): string {
  const blocks = demos.map(({ input, output }) => {
    const inStr  = typeof input  === 'string' ? input  : JSON.stringify(input);
    const outStr = typeof output === 'string' ? output : JSON.stringify(output);
    return `### Example\nInput: ${inStr}\nOutput: ${outStr}\n`;
  });
  return blocks.join('\n') + '\n\n';
}