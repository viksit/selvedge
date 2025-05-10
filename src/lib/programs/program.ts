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
import { PromptTemplate } from '@prompts/types';

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

  // Added schemas for runtime validation
  _inputSchema?: import('zod').ZodTypeAny;
  _outputSchema?: import('zod').ZodTypeAny;

  constructor(strings: TemplateStringsArray, values: any[]) {
    super();
    this.template = createTemplate(strings, values);
    this.exampleList = [];
    this.generatedCode = null;
    this._executionOptions.model = { provider: ModelProvider.OPENAI, model: 'gpt-4' };
  }

  /* ----------------------- schema helpers ---------------------- */

  inputs<I extends import('zod').ZodTypeAny>(schema: I): ProgramBuilder<I extends any ? TOut : never, import('zod').infer<I>> {
    this._inputSchema = schema;
    return makeProgramCallable(this as unknown as ProgramBuilderImpl<TOut, import('zod').infer<I>>);
  }

  outputs<O extends import('zod').ZodTypeAny>(schema: O): ProgramBuilder<import('zod').infer<O>, TIn> {
    this._outputSchema = schema;
    return makeProgramCallable(this as unknown as ProgramBuilderImpl<import('zod').infer<O>, TIn>);
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
    copy._inputSchema = this._inputSchema;
    copy._outputSchema = this._outputSchema;
    copy.persistId = this.persistId;
    copy.needsSave = this.needsSave;
    return copy;
  }

  // DEPRECATED: returns for backward compatibility
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
    if (!finalExecutableFn) {
      if (!buildPromise) {
        // Call builder.build() which returns the fully processed, callable function proxy
        buildPromise = builder.build();
      }
      // The result of builder.build() is the function proxy itself
      finalExecutableFn = await buildPromise;
      buildPromise = null; // Reset for potential future re-builds if builder state changes
    }

    // ------------------ runtime input validation ------------------
    if (builder._inputSchema) {
      try {
        // If there's exactly one argument, validate that arg; otherwise validate the args tuple
        const toValidate = args.length === 1 ? args[0] : args;
        builder._inputSchema.parse(toValidate);
      } catch (e) {
        // Surface the ZodError directly
        throw e;
      }
    }

    let result = await finalExecutableFn(...args);

    // ------------------ runtime output validation -----------------
    if (builder._outputSchema) {
      try {
        result = builder._outputSchema.parse(result);
      } catch (e) {
        throw e;
      }
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
  ['generatedCode', 'persistId', 'needsSave', '_executionOptions', 'exampleList', 'template'].forEach(p => {
    Object.defineProperty(callable, p, {
      get: () => (builder as any)[p],
      set: v => { (builder as any)[p] = v; }
    });
  });
  return callable as ProgramBuilder<TOut, TIn>;
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