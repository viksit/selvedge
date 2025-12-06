/**
 * Optimizer (few-shot) unit tests
 *
 * Run with:  bun test
 */

// @ts-ignore  – Bun test global typings
import { expect, describe, it, beforeEach } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { ModelRegistry } from '../../src/lib/models';
import { ModelProvider } from '../../src/lib/types';
import { MockModelAdapter } from '../../src/lib/providers/mock/mock';
import * as z from 'zod';

/* ── Dummy search helper (no network) ─────────────────────────── */
async function searchStub(query: string): Promise<string[]> {
  return [`https://stub/${query.replace(/\s+/g, '_')}`];
}

/* ── Recall metric for unit test (k = all URLs) ───────────────── */
async function recallMetric(
  pred: { queries: string[] },
  goldUrls: string[]
): Promise<number> {
  const returned = (await Promise.all(pred.queries.map(searchStub))).flat();
  const hits = returned.filter(u => goldUrls.includes(u)).length;
  return goldUrls.length ? hits / goldUrls.length : 0;
}

describe('Few-shot optimiser', () => {
  beforeEach(() => {
    ModelRegistry.clear();
    selvedge.models({
      testModel: selvedge.mock('test-model')
    });
  });

  it('optimises a prompt and preserves callable behaviour', async () => {
    /* 1.   Set up mock model response (always 3 queries) */
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model:    'test-model'
    }) as MockModelAdapter;

    mockAdapter.setResponses({
      chat: JSON.stringify({
        queries: ['alpha query', 'beta query', 'gamma query']
      })
    });

    /* 2.  Base prompt */
    const writeQueries = selvedge.prompt`
      QUESTION: ${q => q}
      Return JSON { "queries": [string, string, string] }
    `
      .inputs({ q: selvedge.schema.string() })
      .outputs({ queries: selvedge.schema.array(selvedge.schema.string()) })
      .using('testModel');

    /* 3.  Tiny trainset (question + gold URLs) */
    const trainset = [
      {
        input: { q: 'Why did Tesla stock drop?' },
        goldUrls: ['https://stub/alpha_query']
      }
    ] as any;                 // cast to satisfy FewShot typings

    const metric = (pred, gold) => recallMetric(pred, gold.goldUrls);

    /* 4.  Optimise with zero demos (just metric pass-through) */
    const tuned = await selvedge.optimize(
      writeQueries,
      selvedge.optimize.fewShot({
        trainset,
        metric,
        maxDemos: 0,
        trials:   1
      })
    );

    /* 5.  Call tuned prompt and check structure */
    const res = await tuned({ q: 'Any question' });

    expect(Array.isArray(res.queries)).toBe(true);
    expect(res.queries.length).toBe(3);
    expect(res.queries[0]).toBe('alpha query');
  });
});