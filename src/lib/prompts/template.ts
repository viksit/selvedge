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
  debug('prompt', 'Parsing template with %d string parts and %d values', strings.length, values.length);
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
      debug('prompt', 'Added variable placeholder: %s', name);
    } else {
      segments.push(defaultRenderer(value));
      debug('prompt', 'Added static value to template');
    }
    if (nextStr) segments.push(nextStr);
  }

  debug('prompt', 'Template parsed with %d segments and %d variables', segments.length, variables.length);
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
  inputs<S extends z.ZodRawShape>(shape: S): PromptTemplate<TOut, z.infer<z.ZodObject<S>>>;
  outputs<S extends z.ZodRawShape>(shape: S): PromptTemplate<z.infer<z.ZodObject<S>>, TIn>;
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
    debug('prompt', 'Rendering template with variables: %o', vars);
    
    if (vars !== null && typeof vars !== 'object') {
      debug('prompt', 'Invalid input - expected object but received %s', typeof vars);
      throw new Error(
        `Invalid input: expected an object, received ${typeof vars}.` +
          ` If you pass a raw string in a flow, wrap it: { text: "..." }.`,
      );
    }
  
    const rendered = this.segments
      .map(seg => {
        if (typeof seg === 'string') return seg;
        /* variable segment */
        const val = (vars as any)[seg.name];
        debug('prompt', 'Rendering variable %s with value: %o', seg.name, val);
        
        try {
          // Check if renderer exists before using it
          if (!seg.renderer) {
            debug('prompt', 'No renderer for variable %s, using default', seg.name);
            return defaultRenderer(val);
          }
          const result = isSimpleAccessor(seg.renderer) 
            ? seg.renderer(val) 
            : seg.renderer(vars);
          
          debug('prompt', 'Rendered variable %s result: %o', seg.name, result);
          return defaultRenderer(result);
        } catch (e) {
          console.error(`Error rendering variable ${seg.name}:`, e);
          debug('prompt', 'Error rendering variable %s: %o', seg.name, e);
          return defaultRenderer(val);
        }
      })
      .join('');
      
    debug('prompt', 'Rendered template length: %d characters', rendered.length);
    return rendered;
  }
  /* ----------------------- execution ---------------------------- */

  async execute<R = TOut>(
    vars: TIn = {} as any,
    opts: PromptExecutionOptions = {},
  ): Promise<R> {
    debug('prompt', 'Executing template with options: %o', opts);
    
    if (this._inputSchema) {
      debug('prompt', 'Validating input against schema');
      this._inputSchema.parse(vars);
      debug('prompt', 'Input validation successful');
    }

    const mergedOpts: PromptExecutionOptions = { ...(this._executionOptions || {}), ...opts };
    debug('prompt', 'Merged execution options: %o', mergedOpts);

    /* optional persistence load */
    if (this.persistId && this.needsSave && !mergedOpts.forceRegenerate) {
      debug('prompt', 'Attempting to load cached template: %s', this.persistId);
      try {
        const cached = await store.load('prompt', this.persistId);
        if (cached) {
          debug('prompt', 'Loaded cached template successfully');
          this.segments = cached.segments;
          this.variables = cached.variables;
          this.needsSave = false;
        }
      } catch (_) {
        debug('prompt', 'No cached template found or error loading it');
      }
    }

    const promptText = this.render(vars);
    debug('prompt', 'Rendered prompt for LLM: %s', promptText.substring(0, 100) + (promptText.length > 100 ? '...' : ''));
    
    const modelDef = resolveModel(mergedOpts.model);
    debug('prompt', 'Using model: %s/%s', modelDef.provider, modelDef.model);
    
    const adapter = ModelRegistry.getAdapter(modelDef);
    if (!adapter) {
      debug('prompt', 'No adapter found for model: %s/%s', modelDef.provider, modelDef.model);
      throw new Error(`No adapter for model: ${modelDef.provider}:${modelDef.model}`);
    }

    debug('prompt', 'Sending request to LLM');
    const response =
      modelDef.provider === ModelProvider.MOCK ||
      modelDef.provider === ModelProvider.ANTHROPIC ||
      modelDef.model.includes('gpt-')
        ? await adapter.chat(buildMessages(promptText, mergedOpts), mergedOpts)
        : await adapter.complete(promptText, mergedOpts);

    debug('prompt', 'Raw response from LLM:\n%s', response);

    let out: any = response;
    if (this._outputSchema) {
      debug('prompt', 'Processing response with output schema');
      const maybe = extractJson(response);
      debug('prompt', 'Extracted JSON from response: %o', maybe);
      
      try {
        out = this._outputSchema.parse(maybe ?? response);
        debug('prompt', 'Schema validation successful');
      } catch (error) {
        debug('prompt', 'Schema validation failed: %o', error);
        throw error;
      }
    }

    /* optional persistence save */
    if (this.persistId && this.needsSave) {
      debug('prompt', 'Saving template to storage: %s', this.persistId);
      try {
        await this.save(this.persistId);
        this.needsSave = false;
        debug('prompt', 'Template saved successfully');
      } catch (error) {
        debug('prompt', 'Error saving template: %o', error);
      }
    }
    
    debug('prompt', 'Template execution complete with result type: %s', typeof out);
    return out as unknown as R;
  }

  /* ----------------------- schema builders ---------------------- */

  inputs<S extends z.ZodRawShape>(shape: S): PromptTemplate<TOut, z.infer<z.ZodObject<S>>> {
    debug('prompt', 'Setting input schema: %o', Object.keys(shape));
    this._inputSchema = z.object(shape);
    return this as unknown as PromptTemplate<TOut, z.infer<z.ZodObject<S>>>;
  }

  outputs<S extends z.ZodRawShape>(shape: S): PromptTemplate<z.infer<z.ZodObject<S>>, TIn> {
    debug('prompt', 'Setting output schema: %o', Object.keys(shape));
    this._outputSchema = z.object(shape);
    
    // Generate a simple example of the expected JSON structure
    const example = appendSchemaTypeHints(shape);
    debug('prompt', 'Generated schema example for LLM: %s', example);
    
    // Add instructions to the prompt for the LLM to return JSON
    this.segments.push(`\n\nIMPORTANT: You must respond with a valid JSON object that matches this structure:\n${example}\n`);
    debug('prompt', 'Added JSON format instructions to prompt');
    
    return this as unknown as PromptTemplate<z.infer<z.ZodObject<S>>, TIn>;
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

/**
 * Generates a simple JSON example for a given schema shape
 */
function appendSchemaTypeHints(shape: z.ZodRawShape): string {
  const example: Record<string, any> = {};
  debug('prompt', 'Building schema type hints for: %o', Object.keys(shape));
  
  // Process each property in the shape
  Object.entries(shape).forEach(([key, schema]) => {
    if (schema instanceof z.ZodString) {
      example[key] = "string";
      debug('prompt', 'Field %s is a string type', key);
    } else if (schema instanceof z.ZodNumber) {
      example[key] = 0;
      debug('prompt', 'Field %s is a number type', key);
    } else if (schema instanceof z.ZodBoolean) {
      example[key] = false;
      debug('prompt', 'Field %s is a boolean type', key);
    } else if (schema instanceof z.ZodArray) {
      example[key] = ["item"];
      debug('prompt', 'Field %s is an array type', key);
    } else if (schema instanceof z.ZodObject) {
      example[key] = { "nested": "object" };
      debug('prompt', 'Field %s is an object type', key);
    } else {
      example[key] = null;
      debug('prompt', 'Field %s has unknown type: %s', key, schema.constructor.name);
    }
  });
  
  return JSON.stringify(example, null, 2);
}

function extractJson(text: string): any | null {
  debug('prompt', 'Attempting to extract JSON from text (%d chars)', text.length);
  let t = text.trim();
  
  // Check for code blocks
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (block) {
    debug('prompt', 'Found code block, extracting content');
    t = block[1].trim();
  }
  
  // Try to parse directly quoted strings
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    debug('prompt', 'Found quoted string, attempting to parse');
    try {
      const parsed = JSON.parse(t.slice(1, -1));
      debug('prompt', 'Successfully parsed quoted JSON string');
      return parsed;
    } catch (error) {
      debug('prompt', 'Failed to parse quoted string, trying with escape replacements');
      try {
        const parsed = JSON.parse(t.slice(1, -1).replace(/\\"/g, '"'));
        debug('prompt', 'Successfully parsed quoted JSON string with escape replacements');
        return parsed;
      } catch {
        debug('prompt', 'Failed to parse quoted string with escape replacements');
      }
    }
  }
  
  // Try to parse JSON objects/arrays directly
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    debug('prompt', 'Found JSON object/array, attempting to parse');
    try {
      const parsed = JSON.parse(t);
      debug('prompt', 'Successfully parsed JSON object/array');
      return parsed;
    } catch {
      debug('prompt', 'Failed to parse JSON object/array');
    }
  }
  
  // Try to find and extract a JSON object/array within the text
  const m = t.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (m) {
    debug('prompt', 'Found JSON-like pattern in text, attempting to parse');
    try {
      const parsed = JSON.parse(m[0]);
      debug('prompt', 'Successfully parsed extracted JSON pattern');
      return parsed;
    } catch {
      debug('prompt', 'Failed to parse extracted pattern, trying with field name fixing');
      try {
        const fixed = m[0]
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
          .replace(/'/g, '"');
        const parsed = JSON.parse(fixed);
        debug('prompt', 'Successfully parsed JSON with field name fixes');
        return parsed;
      } catch {
        debug('prompt', 'Failed to parse JSON even with field name fixes');
      }
    }
  }
  
  debug('prompt', 'Could not extract JSON from text');
  return null;
}
