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
import { appendSchemaTypeHints } from '../schema';

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
  
  // Modified to accept either ZodRawShape or ZodObject
  inputs<S extends z.ZodRawShape | z.ZodObject<any, any, any>>(
    schemaOrShape: S
  ): PromptTemplate<TOut, z.infer<S extends z.ZodRawShape ? z.ZodObject<S> : S>>;

  // Modified to accept either ZodRawShape or ZodObject
  outputs<S extends z.ZodRawShape | z.ZodObject<any, any, any>>(
    schemaOrShape: S
  ): PromptTemplate<z.infer<S extends z.ZodRawShape ? z.ZodObject<S> : S>, TIn>;
  
  prefix(txt: string): PromptTemplate<TOut, TIn>;
  suffix(txt: string): PromptTemplate<TOut, TIn>;
  clone(): PromptTemplate<TOut, TIn>;
  using(model: string | ModelDefinition): PromptTemplate<TOut, TIn>;
  options(o: PromptExecutionOptions): PromptTemplate<TOut, TIn>;
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

  options(opts: PromptExecutionOptions): PromptTemplate<TOut, TIn> {
    this._executionOptions = opts;
    return this as unknown as PromptTemplate<TOut, TIn>;
  }

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
    debug('prompt', 'Rendered prompt for LLM: %s', promptText);
    
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
        ? await adapter.chat(buildMessages(promptText, mergedOpts, this._outputSchema), mergedOpts)
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

  inputs<S extends z.ZodRawShape | z.ZodObject<any, any, any>>(
    schemaOrShape: S
  ): PromptTemplate<TOut, z.infer<S extends z.ZodRawShape ? z.ZodObject<S> : S>> {
    let finalSchema: z.ZodTypeAny;
    let rawShapeForHint: z.ZodRawShape | undefined = undefined;

    if (schemaOrShape instanceof z.ZodObject) {
      debug('prompt', 'Setting input schema with provided ZodObject. Shape: %o', Object.keys(schemaOrShape.shape));
      finalSchema = schemaOrShape;
      rawShapeForHint = schemaOrShape.shape;
    } else {
      debug('prompt', 'Setting input schema with raw shape: %o', Object.keys(schemaOrShape));
      finalSchema = z.object(schemaOrShape as z.ZodRawShape);
      rawShapeForHint = schemaOrShape as z.ZodRawShape;
    }
    this._inputSchema = finalSchema;

    // ---- Add input schema hint for the LLM ----
    try {
      let instruction: string | null = null;
      let example: string | null = null;

      if (finalSchema instanceof z.ZodObject && rawShapeForHint) {
        example = appendSchemaTypeHints(rawShapeForHint); // rawShapeForHint is already the shape for ZodObject
        instruction = `IMPORTANT: The input you receive will be a JSON object matching this structure:\n${example}\n\n`;
        debug('prompt', 'Generated INPUT (object) schema example for LLM prompt: %s', example);
      } else if (finalSchema instanceof z.ZodArray && finalSchema.element instanceof z.ZodObject) {
        const itemShape = (finalSchema.element as z.ZodObject<any>).shape;
        example = appendSchemaTypeHints(itemShape);
        instruction = `IMPORTANT: The input you receive will be a JSON array, where each element matches this object structure:\n${example}\n\n`;
        debug('prompt', 'Generated INPUT (array of objects) schema example for LLM prompt: %s', example);
      } else if (finalSchema instanceof z.ZodArray) {
        let elementTypeName = finalSchema.element._def?.typeName;
        if (elementTypeName) {
            instruction = `IMPORTANT: The input you receive will be a JSON array of ${elementTypeName.replace('Zod', '').toLowerCase()}s.\n\n`;
            debug('prompt', 'Generated INPUT (array of primitives) schema hint for LLM prompt: %s', instruction);
        } else {
            debug('prompt', 'Could not generate detailed INPUT schema hint for this ZodArray structure for LLM prompt.');
        }
      } else {
        debug('prompt', `Could not generate detailed INPUT schema hint for top-level schema type for LLM prompt: ${finalSchema._def?.typeName}`);
      }

      if (instruction) {
        // Prepend to segments so it appears before the main prompt text
        this.segments.unshift(instruction); 
        debug('prompt', 'Prepended input JSON instructions to prompt segments.');
      }
    } catch (err) {
      debug('prompt', 'Failed to append input schema type hints to prompt segments: %o', err);
    }
    // ---- End of input schema hint ----

    return this as unknown as PromptTemplate<TOut, z.infer<S extends z.ZodRawShape ? z.ZodObject<S> : S>>;
  }

  outputs<S extends z.ZodRawShape | z.ZodObject<any, any, any>>(
    schemaOrShape: S
  ): PromptTemplate<z.infer<S extends z.ZodRawShape ? z.ZodObject<S> : S>, TIn> {
    let finalSchema: z.ZodObject<any, any, any>;
    let rawShapeForHint: z.ZodRawShape;

    if (schemaOrShape instanceof z.ZodObject) {
      // It's already a ZodObject
      debug('prompt', 'Setting output schema with provided ZodObject. Shape: %o', Object.keys(schemaOrShape.shape));
      finalSchema = schemaOrShape;
      rawShapeForHint = schemaOrShape.shape; // Get the raw shape for appendSchemaTypeHints
    } else {
      // It's a ZodRawShape
      debug('prompt', 'Setting output schema with raw shape: %o', Object.keys(schemaOrShape));
      finalSchema = z.object(schemaOrShape as z.ZodRawShape); // Cast needed
      rawShapeForHint = schemaOrShape as z.ZodRawShape; // Use the raw shape directly for hints
    }
    
    this._outputSchema = finalSchema;
    
    // Generate a simple example of the expected JSON structure
    const example = appendSchemaTypeHints(rawShapeForHint);
    debug('prompt', 'Generated schema example for LLM: %s', example);
    
    // Add instructions to the prompt for the LLM to return JSON
    this.segments.push(`\n\nIMPORTANT: You must respond with a valid JSON object that matches this structure:\n${example}\n`);
    debug('prompt', 'Added JSON format instructions to prompt');
    
    return this as unknown as PromptTemplate<z.infer<S extends z.ZodRawShape ? z.ZodObject<S> : S>, TIn>;
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
    copy._inputSchema = this._inputSchema;         // Copy the input schema
    copy._outputSchema = this._outputSchema;       // Copy the output schema
    copy._executionOptions = { ...this._executionOptions }; // Shallow copy execution options
    
    // Also copy persistence-related fields if they are part of the state
    if (this.hasOwnProperty('persistId')) { // Or check if this.persistId is not undefined
        (copy as any).persistId = this.persistId;
    }
    if (this.hasOwnProperty('needsSave')) { // Or check if this.needsSave is not undefined
        (copy as any).needsSave = this.needsSave;
    }
    return makeCallable(copy);
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
/* restore factory (for loading from storage)                          */
/* ------------------------------------------------------------------ */

export function restoreTemplate<TOut, TIn = PromptVariables>(
  segments: PromptSegment[],
  variables: PromptVariable[] = [],
): PromptTemplate<TOut, TIn> {
  const tmpl = new PromptTemplateImpl<TOut, TIn>(segments, variables);
  return makeCallable(tmpl);
}

/* ------------------------------------------------------------------ */
/* proxy helper                                                       */
/* ------------------------------------------------------------------ */


function makeCallable<TOut, TIn>(
  // TemplateObject is the interface for PromptTemplateImpl
  tmpl: TemplateObject<TOut, TIn>, 
  // PromptTemplate is the public, callable interface
): PromptTemplate<TOut, TIn> {      
  if (tmpl[CALLABLE]) return tmpl as any; // Already callable

  // This is the function that will be returned, making the template callable
  const fnCallable: any = async (vars: any = {}, opts: PromptExecutionOptions = {}) => {
    // Default action: execute the template
    if (typeof tmpl.execute !== 'function') {
        throw new Error("Internal error: TemplateObject does not have an execute method.");
    }
    const res = await tmpl.execute(vars, opts);

    // Post-processing (same as your existing logic)
    if (typeof res === 'string') {
      const parsed = extractJson(res);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    if (res && typeof res === 'object' && !Array.isArray(res))
      return Object.assign(Object.create(null), res);
    return res;
  };

  // 1. Expose known direct properties (segments, variables) via getters
  //    This ensures they are read from the underlying 'tmpl' instance.
  Object.defineProperty(fnCallable, 'segments', {
    get: () => tmpl.segments,
    enumerable: true,
    configurable: false, // typically false for interface properties
  });
  Object.defineProperty(fnCallable, 'variables', {
    get: () => tmpl.variables,
    enumerable: true,
    configurable: false,
  });
  // Expose persistId and needsSave if they are part of PromptTemplate interface
  if ('persistId' in tmpl) {
    Object.defineProperty(fnCallable, 'persistId', {
      get: () => tmpl.persistId,
      set: (value) => { (tmpl as any).persistId = value; }, // if mutable
      enumerable: true,
    });
  }
  if ('needsSave' in tmpl) {
     Object.defineProperty(fnCallable, 'needsSave', {
      get: () => tmpl.needsSave,
      set: (value) => { (tmpl as any).needsSave = value; }, // if mutable
      enumerable: true,
    });
  }


  // 2. Expose known methods by binding them to the 'tmpl' instance
  //    This ensures 'this' is correct when these methods are called on fnCallable.
  const methodsToBind: (keyof TemplateObject<TOut, TIn>)[] = [
    'render', 
    'execute', // execute is also the default call, but can be called directly
    'inputs', 
    'outputs', 
    'prefix', 
    'suffix', 
    'clone',
    // 'train', // Add if part of your TemplateObject and PromptTemplate interface
    'using', 
    'options', 
    'persist', 
    'save',
    // 'formatResponse' // Add if part of your TemplateObject and PromptTemplate interface
  ];

  methodsToBind.forEach(methodName => {
    const method = tmpl[methodName];
    if (typeof method === 'function') {
      // Important: The result of chainable methods (inputs, outputs, etc.)
      // should also be wrapped by makeCallable if they return a new template instance.
      fnCallable[methodName] = (...args: any[]) => {
        const result = (method as Function).apply(tmpl, args);
        // If the method returns a new template-like object (identified by having 'segments' or being a new builder),
        // then this result also needs to be made callable.
        // This matches your existing chainable logic.
        if (result && typeof result === 'object' && 'segments' in result && typeof result.execute === 'function') {
          return makeCallable(result as TemplateObject<any, any>);
        }
        return result; // For methods like save (Promise) or render (string)
      };
    }
  });
  
  // Mark as callable (your existing logic)
  fnCallable[CALLABLE] = true;
  return fnCallable as PromptTemplate<TOut, TIn>;
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

function buildMessages(prompt: string, opts: PromptExecutionOptions, outputSchema?: z.ZodType<any>) {
  const msgs = [{ role: 'user', content: prompt }];
  let systemMessageContent = opts.system;

  if (!systemMessageContent && outputSchema) {
    systemMessageContent = "You are an AI assistant. Fulfill the user's request directly. If the user asks for a specific JSON output structure, you MUST provide your answer in that exact JSON format and nothing else. Do not provide explanations, code, or conversational filler if a JSON output structure is specified.";
    debug('prompt', 'Injecting default system message for structured JSON output: "%s"', systemMessageContent);
  }

  if (systemMessageContent) msgs.unshift({ role: 'system', content: systemMessageContent });
  return msgs;
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
