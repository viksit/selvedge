// examples/optimizer-fewshot.ts
import { selvedge as s } from '../src';

s.debug('*');

s.models({ gpt35: s.openai('gpt-3.5-turbo') });

const queryWriter = s.prompt`
  QUESTION: ${ q => q }

  Give exactly three distinct web-search queries (one per line) that
  would help answer the question.  No URLs, only plain text queries.
`
  .inputs({ q: s.schema.string() })
  .outputs({ queries: s.schema.array(s.schema.string()) })
  .using('gpt35');

/* ── 3.  Stub retrieval: query → URLs (replace in prod) ─────── */
async function search(query: string): Promise<string[]> {
  return [
    `https://example.com/${query.replace(/\s+/g, '_')}/1`,
    `https://example.com/${query.replace(/\s+/g, '_')}/2`
  ];
}

/* ── 4.  Recall@k metric  (k = all returned URLs) ─────────────── */
async function recallMetric(
  pred: { queries: string[] },
  goldUrls: string[]
): Promise<number> {
  const urls = (await Promise.all(pred.queries.map(search))).flat();
  if (!goldUrls.length) return 0;
  const hits = urls.filter(u => goldUrls.includes(u)).length;
  return hits / goldUrls.length;          // 0 … 1
}

/* ── 5.  Training data with *gold URLs*  ───────────────────────  */
const trainset = [
  {
    input: { q: 'Why did Tesla stock drop in Jan 2023?' },
    goldUrls: [
      'https://news.site/tesla-jan-2023.html',
      'https://finance.site/tesla-earnings-q4.html'
    ]
  },
  {
    input: { q: 'When was Rust 1.0 released?' },
    goldUrls: [
      'https://en.wikipedia.org/wiki/Rust_(programming_language)'
    ]
  }
] as any; 


/* ── 6.  Metric wrapper to match optimiser signature ──────────── */
const metric = (pred, gold) => recallMetric(pred, gold.goldUrls);

/* ── 7.  Optimise (no few-shot demos, 1 trial) ─────────────────── */

const tuned = await s.optimize(
  queryWriter,
  s.optimize.fewShot({
    trainset,
    metric,
    maxDemos: 0,          // <-- no confusing URL demos
    trials:   1,
    costCapUSD: 0.02
  })
);

/* ── 8.  Run on a fresh question ───────────────────────────────── */
const result = await tuned({ q: 'Impact of remote work on cybersecurity 2024' });
console.log('Optimised queries:\n', result.queries.join('\n'));