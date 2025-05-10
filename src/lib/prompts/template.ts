/**
 * Prompt template implementation
 */
import {
  PromptVariables,
  PromptVariable,
  PromptSegment,
  PromptTemplate,
  PromptExecutionOptions,
} from './types';
import { ModelRegistry } from '../models';
import { ModelDefinition, ModelProvider } from '../types';
import { store } from '../storage';
import * as z from 'zod';

import { formatForPrompt } from '../utils/formatter';
import { debug } from '../utils/debug';
import { BuilderBase } from '../shared/builder-base';

/* ------------------------------------------------------------------ */
/* helper utils                                                       */
/* ------------------------------------------------------------------ */

const defaultRenderer = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return formatForPrompt(value);
  } catch {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
};

function extractParameterNames(fn: Function): string[] {
  const match =
    fn
      .toString()
      .match(/(?:function)?\s*\w*\s*\(([^)]*)\)|(\w+)\s*=>\s*\w+|\(([^)]*)\)\s*=>/);
  const argsStr = (match?.[1] || match?.[2] || match?.[3] || '').trim();
  return argsStr ? argsStr.split(',').map(s => s.trim()) : [];
}

function isSimpleAccessor(_fn: Function): boolean {
  return true; // keeps compat with old behaviour
}

/* ------------------------------------------------------------------ */
/* template parsing                                                   */
/* ------------------------------------------------------------------ */

export function parseTemplate(
  strings: TemplateStringsArray,
  values: any[],
): { segments: PromptSegment[]; variables: PromptVariable[] } {
  const segments: PromptSegment[] = [strings[0]];
  const variables: PromptVariable[] = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const nextStr = strings[i + 1];

    if (typeof value === 'function') {
      const name = extractParameterNames(value)[0] ?? `var${i}`;
      const variable: PromptVariable = { name, renderer: value, originalFn: value };
      variables.push(variable);
      segments.push(variable);
    } else {
      segments.push(defaultRenderer(value));
    }
    if (nextStr) segments.push(nextStr);
  }

  return { segments, variables };
}

/* ------------------------------------------------------------------ */
/* core template class                                                */
/* ------------------------------------------------------------------ */

const CALLABLE = Symbol('selvedge.callable');

interface TemplateObject<TOut, TIn = PromptVariables> extends BuilderBase<TOut> {
  segments: PromptSegment[];
  variables: PromptVariable[];
  [CALLABLE]?: true;
  render(vars: TIn): string;
  execute<R = TOut>(vars: TIn, opts?: PromptExecutionOptions): Promise<R>;
  inputs<I>(schema: z.ZodType<I>): PromptTemplate<TOut, I>;
  outputs<O>(schema: z.ZodType<O>): PromptTemplate<O, TIn>;
  prefix(txt: string): PromptTemplate<TOut, TIn>;
  suffix(txt: string): PromptTemplate<TOut, TIn>;
  clone(): PromptTemplate<TOut, TIn>;
  train(examples: Array<{ text: any; output: TOut }>): PromptTemplate<TOut, TIn>;
  using(model: string | ModelDefinition): PromptTemplate<TOut, TIn>;
  save(name: string): Promise<PromptTemplate<TOut, TIn>>;
}

class PromptTemplateImpl<TOut, TIn = PromptVariables>
  extends BuilderBase<TOut>
  implements TemplateObject<TOut, TIn>
{
  segments: PromptSegment[];
  variables: PromptVariable[];
  _inputSchema?: z.ZodType<any>;
  _outputSchema?: z.ZodType<any>;

  constructor(segments: PromptSegment[], variables: PromptVariable[]) {
    super();
    this.segments = segments;
    this.variables = variables;
  }

  /* ----------------------- rendering ---------------------------- */


  render(vars: TIn = {} as any): string {
    if (vars !== null && typeof vars !== 'object') {
      throw new Error(
        `Invalid input: expected an object, received ${typeof vars}.` +
          ` If you pass a raw string in a flow, wrap it: { text: "..." }.`,
      );
    }
  
    return this.segments
      .map(seg => {
        if (typeof seg === 'string') return seg;
        /* variable segment */
        const val = (vars as any)[seg.name];
        try {
          // Check if renderer exists before using it
          if (!seg.renderer) {
            return defaultRenderer(val);
          }
          return defaultRenderer(
            isSimpleAccessor(seg.renderer) ? seg.renderer(val) : seg.renderer(vars),
          );
        } catch (e) {
          console.error(`Error rendering variable ${seg.name}:`, e);
          return defaultRenderer(val);
        }
      })
      .join('');
  }
  /* ----------------------- execution ---------------------------- */

  async execute<R = TOut>(
    vars: TIn = {} as any,
    opts: PromptExecutionOptions = {},
  ): Promise<R> {
    if (this._inputSchema) this._inputSchema.parse(vars);

    const mergedOpts: PromptExecutionOptions = { ...(this._executionOptions || {}), ...opts };

    /* optional persistence load */
    if (this.persistId && this.needsSave && !mergedOpts.forceRegenerate) {
      try {
        const cached = await store.load('prompt', this.persistId);
        if (cached) {
          this.segments = cached.segments;
          this.variables = cached.variables;
          this.needsSave = false;
        }
      } catch (_) {
        /* ignore load errors */
      }
    }

    const promptText = this.render(vars);
    const modelDef = resolveModel(mergedOpts.model);
    const adapter = ModelRegistry.getAdapter(modelDef);

    if (!adapter) throw new Error(`No adapter for model: ${modelDef.provider}:${modelDef.model}`);

    const response =
      modelDef.provider === ModelProvider.MOCK ||
      modelDef.provider === ModelProvider.ANTHROPIC ||
      modelDef.model.includes('gpt-')
        ? await adapter.chat(buildMessages(promptText, mergedOpts), mergedOpts)
        : await adapter.complete(promptText, mergedOpts);

    debug('prompt', 'Raw response:\n', response);

    let out: any = response;
    if (this._outputSchema) {
      const maybe = extractJson(response);
      out = this._outputSchema.parse(maybe ?? response);
    }

    /* optional persistence save */
    if (this.persistId && this.needsSave) {
      try {
        await this.save(this.persistId);
        this.needsSave = false;
      } catch (_) {
        /* ignore save errors */
      }
    }
    return out as unknown as R;
  }

  /* ----------------------- schema builders ---------------------- */

  inputs<I>(schema: z.ZodType<I>): PromptTemplate<TOut, I> {
    this._inputSchema = schema;
    return this as unknown as PromptTemplate<TOut, I>;
  }

  outputs<O>(schema: z.ZodType<O>): PromptTemplate<O, TIn> {
    this._outputSchema = schema;
    return this as unknown as PromptTemplate<O, TIn>;
  }

  /* ----------------------- convenience builders ----------------- */

  prefix(txt: string): PromptTemplate<TOut, TIn> {
    this.segments.unshift(txt);
    return this as unknown as PromptTemplate<TOut, TIn>;
  }

  suffix(txt: string): PromptTemplate<TOut, TIn> {
    this.segments.push(txt);
    return this as unknown as PromptTemplate<TOut, TIn>;
  }

  clone(): PromptTemplate<TOut, TIn> {
    const copy = new PromptTemplateImpl<TOut, TIn>([...this.segments], [...this.variables]);
    return makeCallable(copy);
  }

  train(examples: Array<{ text: any; output: TOut }>): PromptTemplate<TOut, TIn> {
    const block = examples
      .map(ex => {
        const i = typeof ex.text === 'string' ? ex.text : JSON.stringify(ex.text, null, 2);
        const o = typeof ex.output === 'string' ? ex.output : JSON.stringify(ex.output, null, 2);
        return `Input: ${i}\nOutput: ${o}\n---`;
      })
      .join('\n');
    return this.prefix(`Examples:\n${block}\n\nNow, process the following input:`);
  }

  using(model: string | ModelDefinition): PromptTemplate<TOut, TIn> {
    const originalExecute = this.execute;
    this.execute = (vars, o = {}) =>
      originalExecute.call(this, vars, { ...o, model }) as any;
    return this as unknown as PromptTemplate<TOut, TIn>;
  }

  async save(name: string): Promise<PromptTemplate<TOut, TIn>> {
    await store.save('prompt', name, { segments: this.segments, variables: this.variables });
    return this as unknown as PromptTemplate<TOut, TIn>;
  }
}

/* ------------------------------------------------------------------ */
/* factory & proxy                                                    */
/* ------------------------------------------------------------------ */

export function createTemplate<TOut, TIn = PromptVariables>(
  strings: TemplateStringsArray,
  values: any[],
): PromptTemplate<TOut, TIn> {
  const { segments, variables } = parseTemplate(strings, values);
  const tmpl = new PromptTemplateImpl<TOut, TIn>(segments, variables);
  return makeCallable(tmpl);
}

/* ------------------------------------------------------------------ */
/* proxy helper                                                       */
/* ------------------------------------------------------------------ */

function makeCallable<TOut, TIn>(
  tmpl: TemplateObject<TOut, TIn>,
): PromptTemplate<TOut, TIn> {
  if (tmpl[CALLABLE]) return tmpl as any;

  const fn: any = async (vars: any = {}, opts: PromptExecutionOptions = {}) => {
    const res = await tmpl.execute(vars, opts);
    if (typeof res === 'string') {
      const parsed = extractJson(res);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    if (res && typeof res === 'object' && !Array.isArray(res))
      return Object.assign(Object.create(null), res);
    return res;
  };

  const chainable = [
    'inputs',
    'outputs',
    'prefix',
    'suffix',
    'clone',
    'train',
    'using',
    'options',
    'persist',
    'save',
  ];

  chainable.forEach(m => {
    fn[m] = (...a: any[]) => {
      const r = (tmpl as any)[m](...a);
      return r && r.segments ? makeCallable(r) : r;
    };
  });

  Object.assign(fn, tmpl);
  fn[CALLABLE] = true;
  return fn as PromptTemplate<TOut, TIn>;
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveModel(m?: string | ModelDefinition): ModelDefinition {
  if (!m)
    return { provider: ModelProvider.OPENAI, model: 'gpt-3.5-turbo' };
  if (typeof m === 'string') {
    const found = ModelRegistry.getModel(m);
    if (!found) throw new Error(`Model alias not found: ${m}`);
    return found;
  }
  return m;
}

function buildMessages(prompt: string, opts: PromptExecutionOptions) {
  const msgs = [{ role: 'user', content: prompt }];
  if (opts.system) msgs.unshift({ role: 'system', content: opts.system });
  return msgs;
}

function extractJson(text: string): any | null {
  let t = text.trim();
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (block) t = block[1].trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    try {
      return JSON.parse(t.slice(1, -1));
    } catch {
      try {
        return JSON.parse(t.slice(1, -1).replace(/\\"/g, '"'));
      } catch {
        /* noop */
      }
    }
  }
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t);
    } catch {
      /* noop */
    }
  }
  const m = t.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      try {
        return JSON.parse(
          m[0]
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
            .replace(/'/g, '"'),
        );
      } catch {
        /* noop */
      }
    }
  }
  return null;
}
