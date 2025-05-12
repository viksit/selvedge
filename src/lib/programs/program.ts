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
    const sandbox = { exports: {} };
    vm.createContext(sandbox);
    moduleNS = vm.runInContext(wrappedCode, sandbox);
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
    const systemPrompt = process.env.CODE_GEN_SYSTEM_PROMPT || "You are an expert TypeScript code generation AI. Given a description or a task, you will generate high-quality, runnable TypeScript code. The code should be a single TypeScript function. Only output the code itself, with no additional explanation, commentary, or markdown formatting unless it's part of the code (e.g. in a comment block).";
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

    // --- Attempt to load first if persistId exists and not forcing regeneration ---
    if (this.persistId && !forceRegenerate) {
      try {
        const loadedProgram = await store.load('program', this.persistId);
        // Ensure loadedProgram and its code are valid before using
        if (loadedProgram?.generatedCode && typeof loadedProgram.generatedCode === 'string' && loadedProgram.generatedCode.trim().length > 0) {
          debug('program', 'Using loaded code from persisted program: %s', this.persistId);
          this.generatedCode = loadedProgram.generatedCode;
          this.needsSave = false; // We successfully loaded, no immediate need to save
          return createFunctionProxy(this.generatedCode!); // Safe: checked non-empty string above
        } else {
          debug('program', 'Loaded program %s did not contain valid code. Will generate.', this.persistId);
        }
      } catch (loadError: any) {
        debug('program', 'Failed to load persisted program %s: %s. Will generate.', this.persistId, loadError.message);
      }
    }

    // --- Determine if generation is needed --- 
    const needsToGenerate = !this.generatedCode || forceRegenerate;
    debug('program', 'Build: needsToGenerate = %s (generatedCode exists: %s, forceRegenerate: %s)',
          needsToGenerate, !!this.generatedCode, forceRegenerate);

    if (needsToGenerate) {
      const finalOptions = { ...this._executionOptions, ...executionOpts };
      debug('program', 'Build: Calling generate with variables: %o, finalOptions: %o', variables, finalOptions);
      await this.generate(variables, finalOptions);

      if (!this.generatedCode) {
        debug('program', 'Error: Generation completed but this.generatedCode is still null.');
        throw new Error("Code generation failed to produce code.");
      }

      if (this.persistId) {
        debug('program', 'Build: Attempting to save program after generation: %s', this.persistId);
        try {
          await this.save(this.persistId);
        } catch (e: any) {
          debug('program', 'Build: Save failed for %s: %s', this.persistId, e.message);
          this.needsSave = true;
        }
      }
    } else if (!this.generatedCode) {
        debug('program', 'Error: build determined no generation needed, but no generated code exists. Regenerating.');
        const finalOptions = { ...this._executionOptions, ...executionOpts };
        await this.generate(variables, finalOptions);
        if (!this.generatedCode) {
            debug('program', 'Error: Safeguard generation failed to produce code.');
            throw new Error("Code generation failed to produce code.");
        }
        if (this.persistId) { 
          await this.save(this.persistId).catch(e => debug('program', 'Build: Safeguard save failed: %s', e.message));
        }
    }
    
    if (!this.generatedCode) {
       debug('program', 'Error: Reached end of build without generatedCode.');
       throw new Error("Failed to obtain executable code.");
    }
    // Safe: We explicitly check and throw if generatedCode is null/undefined above
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

    try {
      let instruction: string | null = null;
      let example: string | null = null;

      if (schema instanceof z.ZodObject) {
        example = appendSchemaTypeHints(schema.shape);
        instruction = `IMPORTANT: Your function **must** accept an input matching this JSON object structure:\n${example}\n\n`;
        debug('program', 'Generated INPUT (object) schema example for LLM: %s', example);
      } else if (schema instanceof z.ZodArray && schema.element instanceof z.ZodObject) {
        const itemShape = (schema.element as z.ZodObject<any>).shape;
        example = appendSchemaTypeHints(itemShape);
        instruction = `IMPORTANT: Your function **must** accept an input that is a JSON array, where each element matches this object structure:\n${example}\n\n`;
        debug('program', 'Generated INPUT (array of objects) schema example for LLM: %s', example);
      } else if (schema instanceof z.ZodArray) {
        let elementTypeName = schema.element._def?.typeName;
        if (elementTypeName) {
            instruction = `IMPORTANT: Your function **must** accept an input that is a JSON array of ${elementTypeName.replace('Zod', '').toLowerCase()}s.\n\n`;
            debug('program', 'Generated INPUT (array of primitives) schema hint for LLM: %s', instruction);
        } else {
            debug('program', 'Could not generate detailed INPUT schema hint for this ZodArray structure.');
        }
      } else {
        debug('program', `Could not generate detailed INPUT schema hint for top-level schema type: ${schema._def?.typeName}`);
      }

      if (instruction) {
        this.template.segments.unshift(instruction); // Add to the beginning
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

    try {
      let instruction: string | null = null;
      let example: string | null = null;

      if (schema instanceof z.ZodObject) {
        example = appendSchemaTypeHints(schema.shape);
        instruction = `\n\nIMPORTANT: You must respond with a valid JSON object that matches this structure:\n${example}\n`;
        debug('program', 'Generated OUTPUT (object) schema example for LLM: %s', example);
      } else if (schema instanceof z.ZodArray && schema.element instanceof z.ZodObject) {
        const itemShape = (schema.element as z.ZodObject<any>).shape;
        example = appendSchemaTypeHints(itemShape);
        instruction = `\n\nIMPORTANT: You must respond with a JSON array, where each element matches this object structure:\n${example}\n`;
        debug('program', 'Generated OUTPUT (array of objects) schema example for LLM: %s', example);
      } else if (schema instanceof z.ZodArray) {
        let elementTypeName = schema.element._def?.typeName;
        if (elementTypeName) {
            instruction = `\n\nIMPORTANT: You must respond with a JSON array of ${elementTypeName.replace('Zod', '').toLowerCase()}s.\n`;
            debug('program', 'Generated OUTPUT (array of primitives) schema hint for LLM: %s', instruction);
        } else {
            debug('program', 'Could not generate detailed OUTPUT schema hint for this ZodArray structure.');
        }
      } else {
        debug('program', `Could not generate detailed OUTPUT schema hint for top-level schema type: ${schema._def?.typeName}`);
      }

      if (instruction) {
        this.template.segments.push(instruction); // Add to the end
        debug('program', 'Added JSON format instructions to program prompt');
      }
    } catch (err) {
      debug('program', 'Failed to append output schema type hints: %o', err);
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
  let lastBuildOptions: any = {};

  const callable = async (...args: any[]) => {
    // Check if options have changed since last build
    const currentOptions = { ...builder._executionOptions };
    const optionsChanged = JSON.stringify(lastBuildOptions) !== JSON.stringify(currentOptions);
    
    // Force rebuild if options changed, especially forceRegenerate
    const needsRebuild = !finalExecutableFn || 
                         optionsChanged || 
                         currentOptions.forceRegenerate === true;
    
    // If we need to rebuild or haven't built yet
    if (needsRebuild) {
      // Capture current options for future comparisons
      lastBuildOptions = { ...currentOptions };
      
      // Prepare variables for build. Only use user args if an input schema exists;
      // otherwise pass an empty object to avoid rendering errors when the prompt
      // has no variables and callers supply primitives (e.g., number).
      let sampleVars: any = {};
      if (builder._inputSchema) {
        sampleVars = args.length === 1 ? args[0] : args;
      }
      debug('program', 'Rebuilding function with options: %o, needsRebuild: %s', currentOptions, needsRebuild);
      
      buildPromise = builder.build(sampleVars, currentOptions);
      finalExecutableFn = await buildPromise;
      buildPromise = null;
      
      // Clear forceRegenerate after use to prevent continuous regeneration
      if (builder._executionOptions.forceRegenerate) {
        const optsCopy = { ...builder._executionOptions };
        delete optsCopy.forceRegenerate;
        builder._executionOptions = optsCopy;
      }
    }

    // ---------------- Input validation ----------------
    let processedArgs: any[] = args;
    if (builder._inputSchema) {
      try {
        const validated = args.length === 1
          ? builder._inputSchema.parse(args[0])
          : builder._inputSchema.parse(args);
        processedArgs = args.length === 1 && typeof validated === 'object' && !Array.isArray(validated) 
          ? [validated] 
          : Array.isArray(validated) ? validated : [validated];
      } catch (e) {
        debug('program', 'Input validation failed: %o', e);
        throw e; // Re-throw ZodError
      }
    }

    // Execute the generated function
    let result;
    try {
      result = await finalExecutableFn(...processedArgs);
    } catch (execError) {
       debug('program', 'Error executing generated function: %o', execError);
       throw execError;
    }

    // ---------------- Output validation ---------------
    if (builder._outputSchema) {
      try {
        result = builder._outputSchema.parse(result);
      } catch (e) {
        debug('program', 'Output validation failed: %o', e);
        throw e; // Re-throw ZodError
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