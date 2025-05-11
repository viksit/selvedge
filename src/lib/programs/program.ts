/**
 * Program builder implementation for Selvedge using the new shared BuilderBase.
 * This file is a drop-in replacement for previous program.ts versions.
 */

import { ProgramBuilder, ProgramExample, ProgramVariables, ProgramExecutionOptions } from './types';
import { createTemplate } from '../prompts/template';
import { ModelRegistry } from '../models';
import { ModelDefinition, ModelProvider } from '../types';
import { store } from '../storage';
import { debug } from '../utils/debug';
import * as ts from 'typescript';
import * as vm from 'vm';
import { BuilderBase } from '../shared/builder-base';
import { PromptTemplate } from '../prompts/types';
import * as z from 'zod';
import { appendSchemaTypeHints } from '../schema';

// --- Utility: TypeScript code evaluation ---
function evaluateTypeScript(code: string): any {
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      strict: false,
      noImplicitAny: false,
    }
  });
  if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
    const errors = transpiled.diagnostics.map(d =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n')
    );
    debug('program', "TypeScript compilation errors: %O", errors);
    throw new Error(`TypeScript compilation errors:\n${errors.join('\n')}`);
  }
  try {
    const context = vm.createContext({ console, require, exports: {} });
    const result = vm.runInContext(transpiled.outputText, context);
    if (typeof result === 'function') return result;
    if (context.exports && typeof (context.exports as any).default === 'function')
      return (context.exports as any).default;
    throw new Error('Generated code did not evaluate to an executable function.');
  } catch (e: any) {
    debug('program', "Error executing VM: %O", e);
    throw new Error(`Error executing generated code: ${e.message}`);
  }
}

// --- Utility: Create a function proxy from generated code ---
function createFunctionProxy(code: string): any {
  // Clean up code from possible JSON escapes
  const cleanCode = typeof code === 'string'
    ? code.replace(/\\n/g, '\\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\\t')
      .replace(/\\\\/g, '\\\\')
    : code;

  // Try to extract function name (function, const, class)
  let match = cleanCode.match(/function\s+([a-zA-Z0-9_]+)/);
  if (!match) match = cleanCode.match(/const\s+([a-zA-Z0-9_]+)\s*=/);
  if (!match) match = cleanCode.match(/class\s+([a-zA-Z0-9_]+)/);

  if (!match) {
    debug('typescript', "Generated code:", cleanCode);
    throw new Error("No function found in generated code");
  }
  const functionName = match[1];
  debug('program', `Creating function proxy for ${functionName}`);

  // Wrap and evaluate code, extract function
  const transpiled = ts.transpileModule(cleanCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      strict: false,
      noImplicitAny: false,
    }
  });
  if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
    const errors = transpiled.diagnostics.map(d =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n')
    );
    debug('program', "TypeScript compilation errors: %O", errors);
    throw new Error(`TypeScript compilation errors:\n${errors.join('\n')}`);
  }
  const wrappedCode = `
    const exports = {};
    (function (exports) {
      ${transpiled.outputText}
      exports.${functionName} = ${functionName};
    })(exports);
    exports;
  `;
  let moduleNS: any;
  try {
    moduleNS = vm.runInThisContext(wrappedCode);
  } catch (e: any) {
    debug('program', "Error executing VM: %O", e);
    throw new Error(`Error executing generated code: ${e.message}`);
  }
  const func = moduleNS[functionName];
  if (!func) throw new Error(`Function '${functionName}' not found`);

  // Proxy for async and named property access
  function makeAsync(fn: any) {
    return (...args: any[]) => Promise.resolve(fn(...args));
  }
  return new Proxy(func, {
    apply: (target, thisArg, args) => {
      const callResult = target.apply(thisArg, args);
      return Promise.resolve(callResult).then((result: any) => {
        if (result && typeof result === 'object' && !Array.isArray(result) && typeof result !== 'function') {
          return Object.assign(Object.create(null), result);
        }
        return result;
      });
    },
    get: (target, prop, receiver) => {
      if (prop === functionName) return makeAsync(target);
      const value = target[prop as keyof typeof target];
      if (typeof value === 'function') return makeAsync(value);
      return value;
    }
  });
}


// --- Utility: Extract code from LLM response ---
function extractCodeFromResponse(response: string): string {
  const match = response.match(/```(?:[a-zA-Z0-9_\-]+)?\n([\s\S]*?)\n```/);
  return match && match[1] ? match[1].trim() : response.trim();
}

// --- Main ProgramBuilder Implementation ---
class ProgramBuilderImpl<TOut = any, TIn = ProgramVariables> extends BuilderBase<ProgramExecutionOptions> {
  template: PromptTemplate<TOut>;
  exampleList: ProgramExample[];
  generatedCode: string | null;
  /** Optional Zod schemas for runtime validation */
  _inputSchema?: z.ZodTypeAny;
  _outputSchema?: z.ZodTypeAny;

  constructor(strings: TemplateStringsArray, values: any[]) {
    super();
    this.template = createTemplate(strings, values);
    this.exampleList = [];
    this.generatedCode = null;
    this._executionOptions.model = { provider: ModelProvider.OPENAI, model: 'gpt-4' };
  }

  // Fluent API: options
  options(opts: ProgramExecutionOptions): ProgramBuilder<TOut, TIn> {
    const copy = this._clone();
    copy._executionOptions = { ...this._executionOptions, ...opts };
    return makeProgramCallable(copy);
  }

  // Fluent API: examples
  withExamples(newExamples: ProgramExample[]): ProgramBuilder<TOut, TIn> {
    const copy = this._clone();
    copy.exampleList = [...this.exampleList, ...newExamples];
    return makeProgramCallable(copy);
  }
  examples(inputOutputMap: Record<string, any>): ProgramBuilder<TOut, TIn> {
    const newExamples: ProgramExample[] = Object.entries(inputOutputMap).map(([input, output]) => ({
      input: { input },
      output: typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    }));
    return this.withExamples(newExamples);
  }

  // Fluent API: using
  using(model: string | ModelDefinition): ProgramBuilder<TOut, TIn> {
    const copy = this._clone();
    copy._executionOptions = { ...this._executionOptions, model };
    return makeProgramCallable(copy);
  }

  // Persistence
  persist(id: string): ProgramBuilder<TOut, TIn> {
    this.persistId = id;
    this.needsSave = true;
    return makeProgramCallable(this);
  }

  async save(name: string): Promise<string> {
    debug('persistence', `Saving program: ${name}`);
    debug('persistence', `Store base path: ${store.getBasePath()}`);
    debug('persistence', `PersistId: ${this.persistId}`);
    debug('persistence', `NeedsSave: ${this.needsSave}`);
    if (!this.generatedCode) {
      debug('persistence', `No generated code found, generating before save...`);
      await this.generate();
    }
    if (!this.persistId) this.persistId = name;
    const data = {
      template: {
        segments: this.template.segments,
        variables: this.template.variables
      },
      examples: this.exampleList,
      model: this._executionOptions.model,
      generatedCode: this.generatedCode,
    };
    try {
      const versionId = await store.save('program', name, data);
      this.needsSave = false;

      // --- Post-save verification and debug ---
      const programDir = require('path').join(store.getBasePath(), 'programs', name);
      const fs = require('fs/promises');
      let dirExists = false;
      let files: string[] = [];
      try {
        await fs.access(programDir);
        dirExists = true;
        files = await fs.readdir(programDir);
      } catch (e) {
        dirExists = false;
      }
      debug('persistence', `Program directory after save: ${programDir}`);
      debug('persistence', `Directory exists: ${dirExists}`);
      debug('persistence', `Files in program directory: ${files}`);
      if (!dirExists) {
        debug('persistence', `WARNING: Program directory does not exist after save!`);
      }
      return versionId;
    } catch (error: any) {
      debug('persistence', `Error saving program: %s`, error.message);
      throw error;
    }
  }

  // --- Core: Generate code using LLM ---
  async generate(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<string> {
    debug('program', 'generate called %o', { variables, options });
    const modelIdentifier: (string | ModelDefinition) | undefined = options.model || this._executionOptions.model;
    if (!modelIdentifier) throw new Error('No model specified for code generation.');
    let finalModelDef: ModelDefinition | undefined;
    if (typeof modelIdentifier === 'string') {
      finalModelDef = ModelRegistry.getModel(modelIdentifier);
      if (!finalModelDef) throw new Error(`Model alias '${modelIdentifier}' not found in ModelRegistry.`);
    } else {
      finalModelDef = modelIdentifier;
    }
    const modelAdapter = ModelRegistry.getAdapter(finalModelDef);
    if (!modelAdapter) throw new Error(`Model adapter not found for: ${finalModelDef.provider}/${finalModelDef.model}`);
    let fullPrompt = this.template.render(variables as any);
    if (this.exampleList.length > 0) {
      const examplesString = this.exampleList.map(ex => `Input: ${JSON.stringify(ex.input)}\nOutput: ${ex.output}`).join('\n\n');
      fullPrompt = `${examplesString}\n\n${fullPrompt}`;
    }
    const systemPrompt = process.env.CODE_GEN_SYSTEM_PROMPT || "You are an expert code generation AI. Given a description or a task, you will generate high-quality, runnable code. Only output the code itself, with no additional explanation, commentary, or markdown formatting unless it's part of the code (e.g. in a comment block).";
    const llmOptions = {
      temperature: options.temperature ?? this._executionOptions.temperature,
      maxTokens: options.maxTokens ?? this._executionOptions.maxTokens,
    };
    let response: string;
    
    // Debug the final prompt being sent to the LLM
    debug('program', '========== FINAL PROMPT TO LLM ==========');
    debug('program', 'System prompt: %s', systemPrompt);
    debug('program', 'Full prompt: %s', fullPrompt);
    debug('program', '=========================================');
    
    // Use chat endpoint for chat models, completion otherwise
    if (
      finalModelDef.provider === ModelProvider.MOCK ||
      finalModelDef.provider === ModelProvider.ANTHROPIC ||
      finalModelDef.model.includes('gpt-')
    ) {
      // Use chat interface: system prompt as system message, prompt as user message
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: fullPrompt });
      response = await modelAdapter.chat(messages, llmOptions);
    } else {
      // Use completion interface, prepend system prompt if present
      let completionPrompt = fullPrompt;
      if (systemPrompt) completionPrompt = `${systemPrompt}\n\n${fullPrompt}`;
      response = await modelAdapter.complete(completionPrompt, llmOptions);
    }
    
    // Debug the raw response from the LLM
    debug('program', '========== RAW LLM RESPONSE ==========');
    debug('program', response);
    debug('program', '======================================');
    
    const generated = extractCodeFromResponse(response);
    debug('program', 'Generated code: %s', generated.substring(0, 100) + '...');
    this.generatedCode = generated;
    return generated;
  }

  // --- Core: Build (generate or load from storage) ---
  async build(variables: ProgramVariables = {}, buildOptions: ProgramExecutionOptions & { forceRegenerate?: boolean } = {}): Promise<any> {
    const { forceRegenerate = false, ...executionOpts } = buildOptions;
    debug('program', 'build called with variables: %o, executionOptions: %o, forceRegenerate: %s', variables, executionOpts, forceRegenerate);

    if (this.persistId && !this.needsSave && !forceRegenerate) {
      const loadedProgram = await store.load('program', this.persistId);
      if (loadedProgram && loadedProgram.code && !this.generatedCode) {
        // TODO: Consider if loadedProgram was generated with different variables than `variables` now passed to build.
        // For now, if loaded, use its code. A more robust solution might compare/invalidate.
        debug('program', 'Using loaded code from persisted program: %s', this.persistId);
        this.generatedCode = loadedProgram.code;
        if (this.generatedCode == null) {
          debug('program', 'Error: Loaded program has null code for %s', this.persistId);
          throw new Error("No code generated or loaded");
        }
        return createFunctionProxy(this.generatedCode);
      }
    }

    // Determine if generation is needed
    const needsToGenerate = !this.generatedCode || forceRegenerate || this.needsSave;
    debug('program', 'Build: needsToGenerate = %s (generatedCode: %s, forceRegenerate: %s, needsSave: %s)',
      needsToGenerate, !!this.generatedCode, forceRegenerate, this.needsSave);

    if (needsToGenerate) {
      // Use variables passed to build(), fallback to empty if none.
      // Merge executionOpts from build() with existing this._executionOptions.
      const finalOptions = { ...this._executionOptions, ...executionOpts };
      debug('program', 'Build: Calling generate with variables: %o, finalOptions: %o', variables, finalOptions);
      await this.generate(variables, finalOptions);

      if (this.persistId && this.needsSave) {
        debug('program', 'Build: Attempting to save program after generation: %s', this.persistId);
        try {
          await this.save(this.persistId);
        } catch (e: any) {
          debug('program', 'Build: Save failed for %s: %s', this.persistId, e.message);
          // needsSave remains true if save fails
        }
      }
      if (!this.generatedCode) {
        debug('program', 'Error: Generation completed but this.generatedCode is still null.');
        throw new Error("Code generation failed to produce code.");
      }
      return createFunctionProxy(this.generatedCode!);
    }
    
    // If not needsToGenerate and this.generatedCode exists (e.g. from a previous .generate() call without build, or loaded then build called again without force)
    if (!this.generatedCode) {
        // This case should ideally not be reached if logic is correct, but as a safeguard:
        debug('program', 'Error: build determined no generation needed, but no generated code exists. Regenerating.');
        const finalOptions = { ...this._executionOptions, ...executionOpts };
        await this.generate(variables, finalOptions);
        if (!this.generatedCode) {
            debug('program', 'Error: Safeguard generation failed to produce code.');
            throw new Error("Code generation failed to produce code.");
        }
    }
    return createFunctionProxy(this.generatedCode!);
  }

  // --- Private: clone for immutability ---
  private _clone(): ProgramBuilderImpl<TOut, TIn> {
    const copy = new ProgramBuilderImpl<TOut, TIn>([] as any, []);
    copy.template = this.template;
    copy.exampleList = [...this.exampleList];
    copy.generatedCode = this.generatedCode;
    copy._executionOptions = { ...this._executionOptions };
    copy.persistId = this.persistId;
    copy.needsSave = this.needsSave;
    copy._inputSchema = this._inputSchema;
    copy._outputSchema = this._outputSchema;
    return copy;
  }

  /** Attach a Zod schema for validating program inputs */
  inputs<I extends z.ZodTypeAny>(schema: I): ProgramBuilder<TOut, z.infer<I>> {
    this._inputSchema = schema;

    // Add a hint so the LLM sees the expected input structure
    try {
      let rawShape: z.ZodRawShape | undefined;
      if (schema instanceof z.ZodObject) {
        rawShape = schema.shape;
      } else if (schema && typeof (schema as any)._def === 'object') {
        if ((schema as any)._def.schema instanceof z.ZodObject) {
          rawShape = ((schema as any)._def.schema as z.ZodObject<any>).shape;
        }
      }
      if (rawShape) {
        const example = appendSchemaTypeHints(rawShape);
        debug('program', 'Generated INPUT schema example for LLM: %s', example);
        this.template.segments.unshift(`IMPORTANT: Your function **must** accept an input matching this JSON shape:\n${example}\n\n`);
        debug('program', 'Prepended input JSON instructions to program prompt');
      }
    } catch (err) {
      debug('program', 'Failed to append input schema type hints: %o', err);
    }
    return makeProgramCallable(this as unknown as ProgramBuilderImpl<TOut, z.infer<I>>);
  }

  /** Attach a Zod schema for validating program outputs */
  outputs<O extends z.ZodTypeAny>(schema: O): ProgramBuilder<z.infer<O>, TIn> {
    this._outputSchema = schema;

    // ------------------------------------------------------------------
    // Add type-hint instructions for the LLM, mirroring prompt.outputs()
    // ------------------------------------------------------------------
    try {
      let rawShape: z.ZodRawShape | undefined;

      if (schema instanceof z.ZodObject) {
        rawShape = schema.shape;
      } else if (schema && typeof (schema as any)._def === 'object') {
        // If the user passed a raw shape wrapped via z.object(shape)
        if ((schema as any)._def.schema instanceof z.ZodObject) {
          rawShape = ((schema as any)._def.schema as z.ZodObject<any>).shape;
        }
      }

      if (rawShape) {
        const example = appendSchemaTypeHints(rawShape);
        debug('program', 'Generated schema example for LLM: %s', example);
        this.template.segments.push(`\n\nIMPORTANT: You must respond with a valid JSON object that matches this structure:\n${example}\n`);
        debug('program', 'Added JSON format instructions to program prompt');
      }
    } catch (err) {
      debug('program', 'Failed to append schema type hints: %o', err);
    }

    return makeProgramCallable(this as unknown as ProgramBuilderImpl<z.infer<O>, TIn>);
  }

  /** @deprecated Use .outputs() instead */
  returns<U>(): ProgramBuilder<U, TIn> {
    return makeProgramCallable(this as unknown as ProgramBuilderImpl<U, TIn>);
  }
}

// --- Proxy shell to make builder callable ---
function makeProgramCallable<TOut = any, TIn = ProgramVariables>(builder: ProgramBuilderImpl<TOut, TIn>): ProgramBuilder<TOut, TIn> {
  let finalExecutableFn: any | null = null;
  let buildPromise: Promise<any> | null = null;

  const callable = async (...args: any[]) => {
    // If we haven't built the executable yet, use this first call's arguments
    if (!finalExecutableFn) {
      if (!buildPromise) {
        // Derive a representative variables object for build()
        let sampleVars: any = {};
        if (builder._inputSchema) {
          sampleVars = args.length === 1 ? args[0] : args;
          debug('program', 'Using first-call inputs as sampleVars for build(): %o', sampleVars);
        }
        buildPromise = builder.build(sampleVars, { forceRegenerate: true });
      }
      finalExecutableFn = await buildPromise;
      buildPromise = null;
    }

    // ---------------- Input validation ----------------
    let processedArgs: any[] = args;
    if (builder._inputSchema) {
      const validated = args.length === 1
        ? builder._inputSchema.parse(args[0])
        : builder._inputSchema.parse(args);
      processedArgs = args.length === 1 ? [validated] : validated;
    }

    // Execute the generated function
    let result = await finalExecutableFn(...processedArgs);

    // ---------------- Output validation ---------------
    if (builder._outputSchema) {
      result = builder._outputSchema.parse(result);
    }
    return result;
  };
  // Attach all builder methods/properties
  Object.getOwnPropertyNames(ProgramBuilderImpl.prototype).forEach(k => {
    if (k !== 'constructor' && typeof (builder as any)[k] === 'function') {
      (callable as any)[k] = (builder as any)[k].bind(builder);
    }
  });
  // Forward properties
  ['generatedCode', 'persistId', 'needsSave', '_executionOptions', 'exampleList', 'template', '_inputSchema', '_outputSchema'].forEach(p => {
    Object.defineProperty(callable, p, {
      get: () => (builder as any)[p],
      set: v => { (builder as any)[p] = v; }
    });
  });
  return callable as unknown as ProgramBuilder<TOut, TIn>;
}

// --- Exported API ---
export function createProgram<TOut = any, TIn = ProgramVariables>(
  strings: TemplateStringsArray,
  values: any[]
): ProgramBuilder<TOut, TIn> {
  debug('program', 'createProgram called');
  const builder = new ProgramBuilderImpl<TOut, TIn>(strings, values);
  return makeProgramCallable(builder);
}