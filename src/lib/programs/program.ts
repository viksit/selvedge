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
    ? code.replace(/\\n/g, '\n')
      .replace(/\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
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
class ProgramBuilderImpl<T> extends BuilderBase<ProgramExecutionOptions> {
  template: PromptTemplate<T>;
  exampleList: ProgramExample[];
  generatedCode: string | null;

  constructor(strings: TemplateStringsArray, values: any[]) {
    super();
    this.template = createTemplate(strings, values);
    this.exampleList = [];
    this.generatedCode = null;
    this._executionOptions.model = { provider: ModelProvider.OPENAI, model: 'gpt-4' };
  }

  // Fluent API: options
  options(opts: ProgramExecutionOptions): ProgramBuilder<T> {
    const copy = this._clone();
    copy._executionOptions = { ...this._executionOptions, ...opts };
    return makeProgramCallable(copy);
  }

  // Fluent API: examples
  withExamples(newExamples: ProgramExample[]): ProgramBuilder<T> {
    const copy = this._clone();
    copy.exampleList = [...this.exampleList, ...newExamples];
    return makeProgramCallable(copy);
  }
  examples(inputOutputMap: Record<string, any>): ProgramBuilder<T> {
    const newExamples: ProgramExample[] = Object.entries(inputOutputMap).map(([input, output]) => ({
      input: { input },
      output: typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    }));
    return this.withExamples(newExamples);
  }

  // Fluent API: returns
  returns<U>(): ProgramBuilder<U> {
    return makeProgramCallable(this as unknown as ProgramBuilderImpl<U>);
  }

  // Fluent API: using
  using(model: string | ModelDefinition): ProgramBuilder<T> {
    const copy = this._clone();
    copy._executionOptions = { ...this._executionOptions, model };
    return makeProgramCallable(copy);
  }

  // Persistence
  persist(id: string): ProgramBuilder<T> {
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
  async build(forceRegenerate = false): Promise<any> {
    debug('program', 'build called, forceRegenerate:', forceRegenerate);
    if (this.persistId && !this.needsSave && !forceRegenerate) {
      const loadedProgram = await store.load('program', this.persistId);
      if (loadedProgram && loadedProgram.code && !this.generatedCode) {
        this.generatedCode = loadedProgram.code;
        if (this.generatedCode == null)
          throw new Error("No code generated");
        return createFunctionProxy(this.generatedCode);
      }
    }
    if (!this.generatedCode || forceRegenerate || this.needsSave) {
      await this.generate();
      if (this.persistId && this.needsSave) {
        try {
          await this.save(this.persistId);
        } catch (e) {
          // needsSave remains true if save fails
        }
      }
      return createFunctionProxy(this.generatedCode!);
    }
    return createFunctionProxy(this.generatedCode!);
  }

  // --- Private: clone for immutability ---
  private _clone(): ProgramBuilderImpl<T> {
    const copy = new ProgramBuilderImpl<T>([] as any, []);
    copy.template = this.template;
    copy.exampleList = [...this.exampleList];
    copy.generatedCode = this.generatedCode;
    copy._executionOptions = { ...this._executionOptions };
    copy.persistId = this.persistId;
    copy.needsSave = this.needsSave;
    return copy;
  }
}

// --- Proxy shell to make builder callable ---
function makeProgramCallable<T>(builder: ProgramBuilderImpl<T>): ProgramBuilder<T> {
  let compiledFn: any | null = null;
  let compiling: Promise<void> | null = null;
  const callable = async (...args: any[]) => {
    if (!compiledFn) {
      if (!compiling) {
        compiling = builder.build().then(code => {
          compiledFn = evaluateTypeScript(code);
          compiling = null;
        });
      }
      await compiling;
    }
    return await compiledFn(...args);
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
  return callable as ProgramBuilder<T>;
}

// --- Exported API ---
export function createProgram<T = string>(
  strings: TemplateStringsArray,
  values: any[]
): ProgramBuilder<T> {
  debug('program', 'createProgram called');
  const builder = new ProgramBuilderImpl<T>(strings, values);
  return makeProgramCallable(builder);
}