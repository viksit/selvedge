/**
 * Program generation implementation
 */
import { ProgramBuilder, ProgramExample, ProgramVariables, ProgramExecutionOptions } from './types';
import { createTemplate } from '../prompts/template';
import { ModelRegistry } from '../models';
import { ModelDefinition, ModelProvider } from '../types';
import * as ts from 'typescript';
import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { store } from '../storage';
import { debug } from '../utils/debug';
import { PromptTemplate } from '@prompts/types';
import { serialize, deserialize } from 'v8';

/**
 * Symbol used to mark a program builder as already callable
 */
const CALLABLE_MARKER = Symbol('callable');

const CODE_GEN_SYSTEM_PROMPT = `You are a code generation assistant that produces clean, efficient code. Generate only the requested function without console.log statements, test cases, or usage examples. Focus on writing production-ready code with proper error handling and type safety. Return only the implementation code within a code block.`;

/**
 * Compiles and evaluates TypeScript code, preserving type information
 * @param code The TypeScript code to evaluate
 * @param functionName The name of the function to extract
 * @returns A proxy for the evaluated function
 */
function evaluateTypeScript(code: string, functionName: string): any {
  const cleanCode = typeof code === 'string'
    ? code.replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
    : code;

  const result = ts.transpileModule(cleanCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: true
    },
    reportDiagnostics: true
  });

  if (result.diagnostics?.length) {
    const errors = result.diagnostics.map(d =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n')
    );
    throw new Error(`TypeScript compilation errors:\n${errors.join('\n')}`);
  }

  const wrappedCode = `
    const exports = {};
    (function (exports) {
      ${result.outputText}
      exports.${functionName} = ${functionName};
    })(exports);
    exports;
  `;

  const moduleNS = vm.runInThisContext(wrappedCode);
  const func = moduleNS[functionName];
  if (!func) throw new Error(`Function '${functionName}' not found`);
  return func;
}



/**
 * Create a proxy for a generated function that allows direct calls
 * 
 * @param code - The generated function code
 * @returns A proxy object that can be called directly or accessed by function name
 */
function createFunctionProxy(code: string): any {
  // Clean up code that might have been loaded from storage and JSON-escaped
  const cleanCode = typeof code === 'string'
    ? code.replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
    : code;

  // Extract function name using regex - try different patterns
  let match = cleanCode.match(/function\s+([a-zA-Z0-9_]+)/);

  // If no match, try arrow function pattern
  if (!match) {
    match = cleanCode.match(/const\s+([a-zA-Z0-9_]+)\s*=/);
  }

  // If still no match, try class pattern
  if (!match) {
    match = cleanCode.match(/class\s+([a-zA-Z0-9_]+)/);
  }

  if (!match) {
    debug('typescript', "Generated code:", cleanCode);
    throw new Error("No function found in generated code");
  }

  const functionName = match[1];
  debug('program', `Creating function proxy for ${functionName}`);
  debug('program', `Original code type: ${typeof cleanCode}`);
  debug('program', `Original code length: ${cleanCode.length}`);
  debug('program', `Original code sample: ${cleanCode.substring(0, 100)}...`);

  // Use our TypeScript evaluator to get the raw function
  const func = evaluateTypeScript(cleanCode, functionName);

  // Create a comprehensive single proxy that handles all requirements
  // Helper to wrap any function so it always returns a Promise
  function makeAsync(fn: any) {
    return (...args: any[]) => Promise.resolve(fn(...args));
  }

  return new Proxy(func, {
    // Always make the main proxy async
    apply: (target, thisArg, args) => {
      return Promise.resolve(target.apply(thisArg, args));
    },
    // For property access
    get: (target, prop, receiver) => {
      // If accessing the main function by name, return the async wrapper
      if (prop === functionName) {
        return makeAsync(target);
      }
      // If the property is a function, wrap it to always return a Promise
      const value = target[prop as keyof typeof target];
      if (typeof value === 'function') {
        return makeAsync(value);
      }
      // Otherwise, return as-is
      return value;
    }
  });
}

/**
 * Implementation of the ProgramBuilder interface
 */
class ProgramBuilderImpl<T> {
  template: PromptTemplate<T>;
  exampleList: ProgramExample[];
  modelDef: ModelDefinition;
  _executionOptions: ProgramExecutionOptions;
  generatedCode: string | null;
  persistId?: string;
  needsSave: boolean;

  constructor(strings: TemplateStringsArray, values: any[]) {
    this.template = createTemplate(strings, values);
    this.modelDef = { provider: ModelProvider.OPENAI, model: 'gpt-4' };
    this.exampleList = [];
    this._executionOptions = {};
    this.generatedCode = null;
    this.needsSave = false;
  }

  /**
   * Create a shallow clone of this builder with shared methods
   */
  private clone(): ProgramBuilderImpl<T> {
    const copy = new ProgramBuilderImpl<T>([] as any, []);
    copy.template = this.template;
    copy.exampleList = [...this.exampleList];
    copy.modelDef = this.modelDef;
    copy._executionOptions = { ...this._executionOptions };
    copy.generatedCode = this.generatedCode;
    copy.persistId = this.persistId;
    copy.needsSave = this.needsSave;
    return copy;
  }

  /**
   * Set execution options for this program
   */
  options(opts: ProgramExecutionOptions): ProgramBuilder<T> {
    const newBuilder = this.clone();
    newBuilder._executionOptions = { ...this._executionOptions, ...opts };
    return makeProgramCallable(newBuilder);
  }

  /**
   * Add examples for few-shot learning
   */
  withExamples(newExamples: ProgramExample[]): ProgramBuilder<T> {
    const newBuilder = this.clone();
    newBuilder.exampleList = [...this.exampleList, ...newExamples];
    return makeProgramCallable(newBuilder);
  }

  /**
   * Add examples using a simpler input-output map
   */
  examples(inputOutputMap: Record<string, any>): ProgramBuilder<T> {
    const newExamples: ProgramExample[] = Object.entries(inputOutputMap).map(([input, output]) => ({
      input: { input },
      output: typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    }));

    return this.withExamples(newExamples);
  }

  /**
   * Specify which model to use for code generation
   */
  using(model: ModelDefinition | string): ProgramBuilder<T> {
    const newBuilder = this.clone();

    if (typeof model === 'string') {
      // Try to find model by alias
      const resolvedModel = ModelRegistry.getModel(model);

      if (!resolvedModel) {
        throw new Error(`Model alias not found: ${model}`);
      }

      newBuilder.modelDef = resolvedModel;
    } else {
      // Use the provided model definition
      newBuilder.modelDef = model;
    }

    return makeProgramCallable(newBuilder);
  }

  /**
   * Generate code using the specified model
   */
  async generate(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<string> {
    // Get the model to use
    const modelToUse = options.model
      ? (typeof options.model === 'string' ? ModelRegistry.getModel(options.model) : options.model)
      : this.modelDef;

    if (!modelToUse) {
      throw new Error('No model specified for code generation');
    }

    // Get the adapter for this model
    const adapter = ModelRegistry.getAdapter(modelToUse);
    if (!adapter) {
      throw new Error(`No adapter found for model ${modelToUse.provider}/${modelToUse.model}`);
    }

    // If we have cached code and aren't forcing regeneration, use it
    if (this.generatedCode && !options.forceRegenerate) {
      return this.generatedCode;
    }

    // Prepare the execution options
    const execOptions = {
      temperature: options.temperature || 0.2,
      maxTokens: options.maxTokens,
      ...options
    };

    // Prepare the messages for the chat
    const messages = [
      {
        role: 'system',
        content: CODE_GEN_SYSTEM_PROMPT
      }
    ];

    // Add examples if available
    if (this.exampleList.length > 0) {
      for (const example of this.exampleList) {
        messages.push({
          role: 'user',
          content: this.template.render(example.input)
        });

        messages.push({
          role: 'assistant',
          content: example.output
        });
      }
    }

    // Add the user message with the rendered template
    messages.push({
      role: 'user',
      content: this.template.render(variables)
    });

    // Call the adapter to generate the code

    const response = await adapter.chat(messages, execOptions);

    // Extract the code from the response
    const codeResponse = extractCodeFromResponse(response);

    // Cache the generated code
    this.generatedCode = String(codeResponse);
    debug('program', `Generated code: ${String(codeResponse)}`);

    // Mark as needing save if we have a persistId
    if (this.persistId) {
      this.needsSave = true;
    }

    return codeResponse;
  }

  /**
   * Load program code from storage if available
   * @private
   */
  private async loadProgramFromStorage(): Promise<void> {
    if (!this.persistId) return;

    try {
      debug('persistence', `Loading program "${this.persistId}" from storage`);
      debug('persistence', `--------------- LOAD PROGRAM DEBUG ---------------`);
      debug('persistence', `Load store ID: ${(store as any).testId || 'undefined'}`);
      debug('persistence', `Load store instance: ${store.constructor.name}`);
      debug('persistence', `Load base path: ${store.getBasePath()}`);
      debug('persistence', `Loading program: ${this.persistId}`);
      debug('persistence', `---------------------------------------------------`);

      const loadedProgram = await store.load('program', this.persistId);
      if (loadedProgram && loadedProgram.generatedCode) {
        debug('persistence', `Found cached code for program "${this.persistId}"`);
        this.generatedCode = loadedProgram.generatedCode;
        debug('program', `Loaded code: ${this.generatedCode}`);
        // If the model has changed, we should regenerate
        if (loadedProgram.model &&
          (loadedProgram.model.provider !== this.modelDef.provider ||
            loadedProgram.model.model !== this.modelDef.model)) {
          debug('program', "Model has changed, forcing regeneration");
          this.generatedCode = null;
          this.needsSave = true; // Need to save with the new model
        }
      } else {
        debug('program', "No cached code found - generating for the first time");
        this.needsSave = true; // Need to save if we're generating for the first time
      }

      // Debug the model information
      const modelProvider = this.modelDef.provider;
      const modelName = this.modelDef.model;
      debug('program', `Using model: ${modelProvider}/${modelName}`);
    } catch (error) {
      debug('persistence', `Error loading program: ${error}`);
    }
  }

  /**
   * Build the program and return a callable function
   */
  async build(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<any> {
    // Merge _executionOptions (from .options()) with incoming options (call-time)
    const mergedOptions = { ...this._executionOptions, ...options };
    // Check if we need to load code from storage
    if (this.persistId && !this.generatedCode && !mergedOptions.forceRegenerate) {
      debug('program', `Loading program code from storage for program: ${this.persistId}`)
      await this.loadProgramFromStorage();
    }
    // Generate code if we don't have it yet
    if (!this.generatedCode || mergedOptions.forceRegenerate) {
      debug('program', 'No cached code found - generating for the first time');
      const code = await this.generate(variables, mergedOptions);

      // Store the generated code for future use
      this.generatedCode = String(code);
      debug('program', `Generated code from LLM: ${this.generatedCode}`);

      // Try to extract function name for better logging
      const functionNameMatch = String(code).match(/function\s+([a-zA-Z0-9_]+)/);
      const functionName = functionNameMatch ? functionNameMatch[1] : 'anonymous';
      debug('program', `Generated function: ${functionName}`);

      // Save the generated code if we have a persist ID and need to save
      if (this.persistId && this.needsSave) {
        debug('persistence', `Needs saving, saving program "${this.persistId}" to storage`);
        try {
          await this.save(this.persistId);
          this.needsSave = false; // Reset the flag after successful save
        } catch (error) {
          debug('persistence', `Error saving program: ${error}`);
          // Keep the needsSave flag true so we can retry later
        }
      }
    }

    // Create a function proxy from the generated code
    const func = createFunctionProxy(this.generatedCode);
    return func;
  }

  /**
   * Specify the return type for the program
   */
  returns<U>(): ProgramBuilder<U> {
    // This is just a type cast, no runtime behavior changes
    return makeProgramCallable(this as unknown as ProgramBuilderImpl<U>);
  }

  /**
   * Mark this program for persistence
   */
  persist(id: string): ProgramBuilder<T> {
    this.persistId = id;
    this.needsSave = true;
    return makeProgramCallable(this);
  }

  /**
   * Save this program to storage
   */
  async save(name: string): Promise<string> {
    debug('persistence', `Saving program: ${name}`);
    debug('persistence', `Store base path: ${store.getBasePath()}`);
    debug('persistence', `Store instance ID: ${(store as any).testId || 'undefined'}`);

    // If we don't have generated code yet, generate it
    if (!this.generatedCode) {
      try {
        await this.generate();
      } catch (error) {
        debug('persistence', `Error generating code for save: ${error}`);
        throw error;
      }
    }

    // Set the persist ID if not already set
    if (!this.persistId) {
      this.persistId = name;
    }

    // Prepare the data to save
    const data = {
      template: {
        segments: this.template.segments,
        variables: this.template.variables
      },
      examples: this.exampleList,
      model: this.modelDef,
      generatedCode: this.generatedCode
    };

    debug('persistence', `Data prepared for storage, calling store.save...`);

    try {
      // Save to storage
      const versionId = await store.save('program', name, data);
      debug('persistence', `Program saved with version ID: ${versionId}`);

      // Verify the program exists after saving
      const programDir = path.join(store.getBasePath(), 'programs', name);
      const dirExists = await fs.access(programDir).then(() => true).catch(() => false);
      debug('persistence', `Program directory exists after save: ${dirExists ? 'YES' : 'NO'}`);

      if (dirExists) {
        const files = await fs.readdir(programDir);
        debug('persistence', `Files in program directory: ${files}`);
      }
      return versionId;
    } catch (error) {
      debug('persistence', `Error saving program: ${error}`);
      throw error;
    }
    // Save to storage (retry outside try/catch to propagate errors)
    //return await store.save('program', name, data);

  }
}

/**
 * Helper function to create a callable proxy around a program builder
 */
// function makeProgramCallable<T>(builder: ProgramBuilderImpl<T>): ProgramBuilder<T> {
//   // Create a base function that forwards to builder.build
//   const baseFunction = function (...args: any[]) {
//     return builder.build(...args);
//   } as any as { [key: string]: any } & ((...args: any[]) => Promise<any>);

//   // Properties that need to be synchronized between proxy and builder
//   const syncedProps = [
//     'generatedCode', 'persistId', 'needsSave', 'modelDef',
//     'exampleList', '_executionOptions', 'template'
//   ];

//   // Create a shared state object

//   const sharedState: { [key: string]: any } = {};

//   // Initialize shared state with current builder values
//   syncedProps.forEach(prop => {
//     if (prop in builder) {
//       sharedState[prop] = (builder as any)[prop];
//     }
//   });

//   // Replace direct property access with accessors that use the shared state
//   syncedProps.forEach(prop => {
//     if (prop in builder) {
//       Object.defineProperty(builder as any, prop, {
//         get: () => sharedState[prop],
//         set: (value) => { sharedState[prop] = value; },
//         enumerable: true,
//         configurable: true
//       });
//     }
//   });

//   // Copy all methods from the builder to the function
//   for (const key of Object.getOwnPropertyNames(ProgramBuilderImpl.prototype)) {
//     if (key !== 'constructor' && typeof (builder as any)[key] === 'function') {
//       baseFunction[key] = (builder as any)[key].bind(builder);
//     }
//   }

//   // Create a proxy that forwards property access to the shared state
//   const proxy = new Proxy(baseFunction, {
//     apply: (target, thisArg, args) => target.apply(thisArg, args),
//     get: (target, prop, receiver) => {
//       // If the property is in our shared state, return from there
//       if (typeof prop === 'string' && syncedProps.includes(prop)) {
//         return sharedState[prop];
//       }

//       // Otherwise get it from the target
//       return Reflect.get(target, prop, receiver);
//     },
//     set: (target, prop, value, receiver) => {
//       // If the property is in our shared state, set it there
//       if (typeof prop === 'string' && syncedProps.includes(prop)) {
//         sharedState[prop] = value;
//         return true;
//       }

//       // Otherwise set it on the target
//       return Reflect.set(target, prop, value, receiver);
//     }
//   }) as ProgramBuilder<T>;

//   return proxy;
// }

function makeProgramCallable<T>(builder: ProgramBuilderImpl<T>): ProgramBuilder<T> {
  // compiled function cache (shared across all calls)
  let compiledFn: any | null = null;
  let compiling: Promise<void> | null = null;       // guards concurrent builds

  const baseFunction = async function (...args: any[]) {
    // step 1: compile once, lazily
    if (!compiledFn) {
      if (!compiling) {
        // first arrival: start the build and remember the promise
        compiling = builder.build().then(fn => {
          compiledFn = fn;
          compiling = null;
        });
      }
      await compiling;                               // wait if another call is compiling
    }

    // step 2: execute compiled function with original arguments
    return await compiledFn(...args);
  } as any as { [k: string]: any } & ((...a: any[]) => Promise<any>);

  const syncedProps = [
    'generatedCode', 'persistId', 'needsSave', 'modelDef',
    'exampleList', '_executionOptions', 'template'
  ];

  const sharedState: Record<string, any> = {};
  syncedProps.forEach(p => (sharedState[p] = (builder as any)[p]));

  syncedProps.forEach(p => Object.defineProperty(builder as any, p, {
    get: () => sharedState[p],
    set: v => { sharedState[p] = v; }
  }));

  for (const k of Object.getOwnPropertyNames(ProgramBuilderImpl.prototype)) {
    if (k !== 'constructor' && typeof (builder as any)[k] === 'function') {
      baseFunction[k] = (builder as any)[k].bind(builder);
    }
  }

  return new Proxy(baseFunction, {
    apply: (t, thisArg, a) => t.apply(thisArg, a),
    get: (t, prop, r) =>
      typeof prop === 'string' && syncedProps.includes(prop) ? sharedState[prop] : Reflect.get(t, prop, r),
    set: (t, prop, val, r) =>
      typeof prop === 'string' && syncedProps.includes(prop) ? (sharedState[prop] = val, true) : Reflect.set(t, prop, val, r)
  }) as ProgramBuilder<T>;
}

/**
 * Create a new program builder
 */
export function createProgram<T = string>(
  strings: TemplateStringsArray,
  values: any[]
): ProgramBuilder<T> {
  debug('program', 'createProgram called with template string');
  debug('program', `Template string: ${strings}`);
  debug('program', `Values: ${values}`);
  // Create a new builder instance
  const builder = new ProgramBuilderImpl<T>(strings, values);

  // Make it callable
  return makeProgramCallable(builder);
}

/**
 * Extract code blocks from a response
 */
function extractCodeFromResponse(response: string): string {
  const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
  const matches = [...response.matchAll(codeBlockRegex)];

  if (matches.length > 0) {
    return matches[0][1].trim();
  }

  return response.trim();
}