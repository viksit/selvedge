// tests/programs/v2/builder.test.ts
import {
  prompt, model, options, persist, examples, returns
} from '../../../src/lib/programs/v2/builder';
import { createState } from '../../../src/lib/programs/v2/state';

describe('Pure builder methods', () => {
  it('withPrompt should set prompt immutably', () => {
    const state1 = createState();
    const state2 = prompt(state1, 'my prompt');
    expect(state2).not.toBe(state1);
    expect(state2.prompt).toBe('my prompt');
    expect(state1.prompt).toBeUndefined();
  });

  it('withModel should set model immutably', () => {
    const state1 = createState();
    const state2 = model(state1, 'gpt-4');
    expect(state2).not.toBe(state1);
    expect(state2.model).toBe('gpt-4');
    expect(state1.model).toBeUndefined();
  });

  it('withOptions should merge and set options immutably', () => {
    const state1 = createState({ options: { a: 1 } });
    const state2 = options(state1, { b: 2 });
    expect(state2).not.toBe(state1);
    expect(state2.options).toEqual({ a: 1, b: 2 });
    expect(state1.options).toEqual({ a: 1 });
  });

  it('persist should set persistId immutably', () => {
    const state1 = createState({ options: { temperature: 0.5 } });
    const state2 = persist(state1, 'foo');
    expect(state2).not.toBe(state1);
    expect(state2.persistId).toBe('foo');
    expect(state1.persistId).toBeUndefined();
    expect(state2.options).toEqual(state1.options);
  });

  it('withExamples should set examples immutably', () => {
    const state1 = createState();
    const exampleData = [{ input: 1, output: 2 }];
    const state2 = examples(state1, exampleData);
    expect(state2).not.toBe(state1);
    expect(state2.examples).toEqual(exampleData);
    expect(state1.examples).toBeUndefined();
  });

  it('withReturnsType should set returnsType immutably', () => {
    const state1 = createState();
    const state2 = returns(state1, { foo: 'bar' });
    expect(state2).not.toBe(state1);
    expect(state2.returnsType).toEqual({ foo: 'bar' });
    expect(state1.returnsType).toBeUndefined();
  });

  it('should allow chaining builder methods', () => {
    const state1 = createState();
    const state2 = prompt(state1, 'prompt');
    const state3 = model(state2, 'model');
    const state4 = options(state3, { x: 1 });
    expect(state4.prompt).toBe('prompt');
    expect(state4.model).toBe('model');
    expect(state4.options).toEqual({ x: 1 });
    // Ensure previous states are unchanged
    expect(state1.prompt).toBeUndefined();
    expect(state2.model).toBeUndefined();
    expect(state3.options).toBeUndefined();
  });
});
