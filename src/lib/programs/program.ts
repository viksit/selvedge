/**
 * Program generation implementation
 */
import { ProgramBuilder, ProgramExample, ProgramVariables, ProgramExecutionOptions } from './types';
import { ModelDefinition, ModelProvider } from '../types';
import { ModelRegistry } from '../models';
import { createTemplate } from '../prompts/template';
import { store } from '../storage';
import { debug as debugLog } from '../utils/debug';
import * as ts from 'typescript';
import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs/promises';

// Symbol to mark a function as callable
const CALLABLE_MARKER = Symbol('callable');

// Symbol for internal state management
const INTERNAL_STATE = Symbol('internalState');

// Define a type for the internal state to ensure type safety
interface InternalBuilderState<T> {
  _debugConfig?: { showPrompt?: boolean; showIterations?: boolean; explanations?: boolean };
  _executionOptions?: ProgramExecutionOptions;
  persistId?: string;
  needsSave?: boolean;
  explanation?: string;
  iterations?: any[];
  finalPrompt?: string;
  generatedCode?: string;
  // Add any other state properties that need to be preserved
}

// Helper function to initialize or get internal state
function getInternalState<T>(builder: any): InternalBuilderState<T> {
  if (!builder[INTERNAL_STATE]) {
    builder[INTERNAL_STATE] = {
      _debugConfig: builder._debugConfig || {},
      _executionOptions: builder._executionOptions || {},
      persistId: builder.persistId,
      needsSave: builder.needsSave || false,
      explanation: builder.explanation,
      iterations: builder.iterations,
      finalPrompt: builder.finalPrompt,
      generatedCode: builder.generatedCode
    };
  }
  return builder[INTERNAL_STATE] as InternalBuilderState<T>;
}

// Helper function to update internal state
function updateInternalState<T>(builder: any, updates: Partial<InternalBuilderState<T>>): void {
  const state = getInternalState<T>(builder);
  builder[INTERNAL_STATE] = { ...state, ...updates };
  
  // Also update direct properties for backward compatibility
  Object.keys(updates).forEach(key => {
    if (key in builder) {
      (builder as any)[key] = (updates as any)[key];
    }
  });
}

/**
 * Compiles and evaluates TypeScript code, preserving type information
 * @param code The TypeScript code to evaluate
 * @param functionName The name of the function to extract
 * @returns A proxy for the evaluated function
 */
function evaluateTypeScript(code: string, functionName: string): any {
  // Compile the TypeScript code to JavaScript
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: true,
    },
    reportDiagnostics: true
  });

  // Check for compilation errors
  if (result.diagnostics && result.diagnostics.length > 0) {
    const errors = result.diagnostics
      .map(diag => ts.flattenDiagnosticMessageText(diag.messageText, '\n'));
    throw new Error(`TypeScript compilation errors:\n${errors.join('\n')}`);
  }

  // Create a sandbox context for evaluation
  const sandbox: Record<string, any> = { exports: {}, console };
  const context = vm.createContext(sandbox);

  // Wrap the code in a module-like structure
  const wrappedCode = `
    (function(exports) {
      ${result.outputText}
      exports.${functionName} = ${functionName};
    })(exports);
  `;

  // Execute the code in the sandbox
  try {
    vm.runInContext(wrappedCode, context);
  } catch (error) {
    debugLog('typescript', "Error evaluating compiled code:", error);
    debugLog('typescript', "Compiled code:", result.outputText);
    throw error;
  }

  // Extract the function from the sandbox
  const func = sandbox.exports[functionName];
  if (!func) {
    throw new Error(`Function '${functionName}' not found in evaluated code`);
  }

  // Create a proxy for the function
  return new Proxy(func, {
    apply: (target, thisArg, args) => {
      return target.apply(thisArg, args);
    },
    get: (target, prop) => {
      if (prop === functionName) {
        return target;
      }
      return target[prop];
    }
  });
}

/**
 * Create a proxy for a generated function that allows direct calls
 * 
 * @param code - The generated function code
 * @returns A proxy object that can be called directly or accessed by function name
 */
function createFunctionProxy(code: string): any {
  // Extract function name using regex - try different patterns
  let match = code.match(/function\s+([a-zA-Z0-9_]+)/);

  // If no match, try arrow function pattern
  if (!match) {
    match = code.match(/const\s+([a-zA-Z0-9_]+)\s*=/);
  }

  // If still no match, try class pattern
  if (!match) {
    match = code.match(/class\s+([a-zA-Z0-9_]+)/);
  }

  if (!match) {
    debugLog('typescript', "Generated code:", code);
    throw new Error("No function found in generated code");
  }

  const functionName = match[1];

  // Use our TypeScript evaluator to get the base proxy
  const baseProxy = evaluateTypeScript(code, functionName);

  // Create an enhanced proxy that cleans up object results
  return new Proxy(baseProxy, {
    apply: (target, thisArg, args) => {
      const result = target.apply(thisArg, args);

      // If the result is an object, clean it up by removing Object prototype methods
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return Object.fromEntries(
          Object.entries(result).filter(([key]) => !Object.prototype.hasOwnProperty(key))
        );
      }

      return result;
    },
  });
}

/**
 * Helper function to create a callable proxy around a program builder
 */
export function makeProgramCallable<T>(builder: any): ProgramBuilder<T> {
  // Check if the builder is already callable
  if (builder[CALLABLE_MARKER]) {
    return builder as ProgramBuilder<T>;
  }

  // Initialize or get internal state
  const internalState = getInternalState<T>(builder);

  // Create a base function that will be our callable builder
  const baseFunction = async function (...args: any[]) {
    // When called as a function, build the program and then call it with the provided arguments
    const func = await builder._build({}, internalState._executionOptions || {});

    // Call the generated function with the provided arguments
    const result = func.apply(null, args);

    // If the result is a Promise, return it directly, otherwise wrap it in a Promise
    return result instanceof Promise ? result : Promise.resolve(result);
  };

  // Methods that should return a new builder instance
  const methodsThatReturnBuilder = ['examples', 'using', 'options', 'returns', 'debug'];
  
  // Methods that should return the same builder instance (for chaining)
  const methodsThatReturnSameBuilder = ['persist', 'save'];
  
  // Wrap all methods
  const wrappedMethods: Record<string, Function> = {};

  // Wrap methods that return a new builder
  methodsThatReturnBuilder.forEach(methodName => {
    const originalMethod = builder[methodName];
    if (typeof originalMethod === 'function') {
      wrappedMethods[methodName] = function (...args: any[]) {
        // Call the original method
        const result = originalMethod.apply(builder, args);
        
        // Ensure internal state is preserved
        if (result && typeof result === 'object') {
          // Transfer the internal state to the new builder
          updateInternalState<T>(result, getInternalState<T>(builder));
          return makeProgramCallable(result);
        }
        
        return result;
      };
    }
  });

  // Wrap methods that return the same builder
  methodsThatReturnSameBuilder.forEach(methodName => {
    const originalMethod = builder[methodName];
    if (typeof originalMethod === 'function') {
      wrappedMethods[methodName] = function (...args: any[]) {
        // Call the original method
        originalMethod.apply(builder, args);
        
        // For persist method, make sure the internal state is properly updated on the proxy
        if (methodName === 'persist' && args.length > 0) {
          const id = args[0];
          // Update the internal state on the proxy directly
          const state = getInternalState<T>(baseFunction);
          state.persistId = id;
          state.needsSave = true;
        }
        
        // Return the proxy itself to maintain object identity
        return proxy;
      };
    }
  });

  // Copy all properties from the builder to the function
  Object.getOwnPropertyNames(builder).forEach(prop => {
    if (prop !== 'constructor') {
      if (prop in wrappedMethods) {
        (baseFunction as any)[prop] = wrappedMethods[prop];
      } else {
        (baseFunction as any)[prop] = (builder as any)[prop];
      }
    }
  });

  // Mark as callable
  (baseFunction as any)[CALLABLE_MARKER] = true;
  
  // Store internal state on the base function
  (baseFunction as any)[INTERNAL_STATE] = internalState;

  // Create the proxy
  const proxy = new Proxy(baseFunction, {
    apply: (target, thisArg, args) => {
      return target.apply(thisArg, args);
    },
    get: (target, prop, receiver) => {
      // Special handling for debug properties and state properties
      if (typeof prop === 'string') {
        // Define all properties that should be accessible from internal state
        const stateProps = [
          '_debugConfig', '_executionOptions', 'persistId', 
          'needsSave', 'explanation', 'iterations', 'finalPrompt'
        ];
        
        if (stateProps.includes(prop)) {
          // Get from internal state if available
          const state = getInternalState<T>(target);
          if (state && prop in state) {
            return state[prop as keyof InternalBuilderState<T>];
          }
        }
        
        // Special handling for debug properties that might be set during execution
        const debugProps = ['explanation', 'iterations', 'finalPrompt'];
        if (debugProps.includes(prop)) {
          // If it's not in the state but is a debug property, check if it's on the target
          const value = Reflect.get(target, prop, receiver);
          if (value !== undefined) {
            return value;
          }
        }
      }
      
      // Get the property from the target
      const value = Reflect.get(target, prop, receiver);

      // If the property is a function, bind it to the target
      if (typeof value === 'function' && prop !== 'constructor') {
        return function (...args: any[]) {
          return value.apply(target, args);
        };
      }

      return value;
    },
    set: (target, prop, value, receiver) => {
      // Special handling for debug properties and state properties
      if (typeof prop === 'string') {
        const stateProps = [
          '_debugConfig', '_executionOptions', 'persistId', 
          'needsSave', 'explanation', 'iterations', 'finalPrompt'
        ];
        
        if (stateProps.includes(prop)) {
          // Update internal state
          const state = getInternalState<T>(target);
          (state as any)[prop] = value;
          
          // Also set on target for backward compatibility
          Reflect.set(target, prop, value, receiver);
          return true;
        }
      }
      
      // Default behavior
      return Reflect.set(target, prop, value, receiver);
    }
  });

  return proxy as ProgramBuilder<T>;
}

/**
 * Create a new program builder
 */
export function createProgram<T = any>(strings: TemplateStringsArray, ...values: any[]): ProgramBuilder<T> {
  debugLog('program', 'createProgram called with template string');
  // Create the underlying prompt template
  const template = createTemplate(strings, values);

  // Default model to use
  let modelDef: ModelDefinition = {
    provider: ModelProvider.OPENAI,
    model: 'gpt-4',
  };

  // Examples for few-shot learning
  let exampleList: ProgramExample[] = [];

  // Private storage for execution options
  let _executionOptions: ProgramExecutionOptions = {};

  // Using an interface without the callable signature for the initial builder
  // The makeProgramCallable function will convert this to a fully callable ProgramBuilder<T>
  const builder = {
    // Debug properties
    _debugConfig: undefined as undefined | { showPrompt?: boolean; showIterations?: boolean; explanations?: boolean },
    explanation: undefined as string | undefined,
    iterations: undefined as any[] | undefined,
    finalPrompt: undefined as string | undefined,

    // Execution options
    _executionOptions: _executionOptions,

    // Core properties
    template,
    exampleList,
    modelDef,
    generatedCode: null as unknown as string | null,
    persistId: undefined as string | undefined,
    needsSave: false,

    options(opts: ProgramExecutionOptions): ProgramBuilder<T> {
      // Create a new builder with the updated options
      const newBuilder = { ...this } as unknown as ProgramBuilder<T>;
      newBuilder._executionOptions = { ...this._executionOptions, ...opts };
      return makeProgramCallable(newBuilder);
    },

    /**
     * Returns a new builder with debug config attached.
     */
    debug(config: { showPrompt?: boolean; showIterations?: boolean; explanations?: boolean }): ProgramBuilder<T> {
      debugLog('program', 'Debug enabled with config:', config);
      
      // Create a new builder with the updated debug config
      const newBuilder = { ...this } as unknown as ProgramBuilder<T>;
      
      // Update internal state with debug config
      updateInternalState<T>(newBuilder, {
        _debugConfig: { ...config },
        explanation: undefined,
        iterations: undefined,
        finalPrompt: undefined
      });
      
      return makeProgramCallable(newBuilder);
    },

    /**
     * Add examples for few-shot learning
     * @param examples Array of input-output pairs
     */
    examples(examples: ProgramExample[]): ProgramBuilder<T> {
      // Create a new builder with the updated examples
      const newBuilder = { ...this } as unknown as ProgramBuilder<T>;
      newBuilder.exampleList = [...(this.exampleList || []), ...examples];
      return makeProgramCallable(newBuilder);
    },

    using(model: ModelDefinition | string): ProgramBuilder<T> {
      // Create a new builder with the updated model
      const newBuilder = { ...this } as unknown as ProgramBuilder<T>;

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
    },

    async _generate(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<T> {
      // Get internal state
      const internalState = getInternalState<T>(this);
      
      // Reset debug info at the start of each generation
      updateInternalState<T>(this, {
        explanation: undefined,
        iterations: undefined,
        finalPrompt: undefined
      });
      
      // Also reset on the object itself for backward compatibility
      this.explanation = undefined;
      this.iterations = undefined;
      this.finalPrompt = undefined;

      // If debug is enabled, collect debug info
      if (internalState._debugConfig) {
        if (internalState._debugConfig.showPrompt) {
          try {
            const promptText = this.template.render(variables);
            // Update both internal state and the object itself
            updateInternalState<T>(this, { finalPrompt: promptText });
            this.finalPrompt = promptText;
          } catch {
            // Update both internal state and the object itself
            updateInternalState<T>(this, { finalPrompt: '(error rendering prompt)' });
            this.finalPrompt = '(error rendering prompt)';
          }
        }

        if (internalState._debugConfig.showIterations) {
          // Update both internal state and the object itself
          const iterations: any[] = [];
          updateInternalState<T>(this, { iterations });
          this.iterations = iterations;
        }
      }

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
        return this.generatedCode as unknown as T;
      }

      // We'll let execute() handle all the logging to avoid duplication
      // This method is called by execute(), so we don't need to log here

      // Prepare the execution options
      const execOptions = {
        temperature: options.temperature || 0.2,
        maxTokens: options.maxTokens,
        ...options
      };

      // Prepare the messages for the chat
      let messages = [
        {
          role: 'system',
          content: 'You are a code generation assistant that produces clean, efficient code. Generate only the requested function without console.log statements, test cases, or usage examples. Focus on writing production-ready code with proper error handling and type safety. Return only the implementation code within a code block.'
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

      // Add the current request
      messages.push({
        role: 'user',
        content: this.template.render(variables)
      });

      // Execute the model
      const response = await adapter.chat(messages, execOptions);

      // Process the response to extract just the code
      const codeResponse = extractCodeFromResponse(response);

      // Cache the generated code
      this.generatedCode = String(codeResponse) as unknown as typeof this.generatedCode;

      // Store the explanation if requested
      // Use the already defined internalState from above
      if (internalState._debugConfig?.explanations) {
        // Try to extract explanation from the response
        const fullResponse = response.toString();
        const codeString = String(codeResponse);

        // If the response contains more than just the code, use that as the explanation
        let explanation;
        if (fullResponse.length > codeString.length) {
          explanation = fullResponse.replace(codeString, '').trim();
        } else {
          explanation = 'No explanation provided by the model.';
        }
        
        // Update both internal state and the object itself
        updateInternalState<T>(this, { explanation });
        this.explanation = explanation;
      }

      // Store iteration if requested
      if (internalState._debugConfig?.showIterations) {
        // For now, just store the final result as the only iteration
        // In the future, we could implement multiple generation attempts
        const iterations = [{ code: String(codeResponse) }];
        
        // Update both internal state and the object itself
        updateInternalState<T>(this, { iterations });
        this.iterations = iterations;
      }

      // Log basic information about the generated code
      const codeLines = String(codeResponse).split('\n').length;
      debugLog('program', `Generated code: ${codeLines} lines`);

      return codeResponse as unknown as T;
    },

    async _build(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<any> {
      try {
        // Get internal state
        const internalState = getInternalState<T>(this);
        
        // If we have a persist ID but no generated code yet, try to load it first
        if (internalState.persistId && !this.generatedCode && !options.forceRegenerate) {
          try {
            const existingProgram = await store.load('program', internalState.persistId);
            if (existingProgram && existingProgram.generatedCode) {
              // Update both the direct property and internal state
              this.generatedCode = existingProgram.generatedCode;
              updateInternalState<T>(this, {
                generatedCode: existingProgram.generatedCode,
                needsSave: false // Don't need to save if we loaded existing code
              });
              
              // Restore debug properties from persisted data if available
              if (existingProgram.debug) {
                // Restore debug config if available
                if (existingProgram.debug.config) {
                  this._debugConfig = existingProgram.debug.config;
                  updateInternalState<T>(this, { _debugConfig: existingProgram.debug.config });
                }
                
                // Restore finalPrompt if available
                if (existingProgram.debug.finalPrompt) {
                  this.finalPrompt = existingProgram.debug.finalPrompt;
                  updateInternalState<T>(this, { finalPrompt: existingProgram.debug.finalPrompt });
                }
                
                // Restore iterations if available
                if (existingProgram.debug.iterations) {
                  this.iterations = existingProgram.debug.iterations;
                  updateInternalState<T>(this, { iterations: existingProgram.debug.iterations });
                }
                
                // Restore explanation if available
                if (existingProgram.debug.explanation) {
                  this.explanation = existingProgram.debug.explanation;
                  updateInternalState<T>(this, { explanation: existingProgram.debug.explanation });
                }
              }
              // If no persisted debug data but debug is enabled, generate placeholder values
              else if (internalState._debugConfig) {
                // Set finalPrompt if debug is enabled and showPrompt is true
                if (internalState._debugConfig.showPrompt) {
                  try {
                    const promptText = this.template.render(variables);
                    this.finalPrompt = promptText;
                    updateInternalState<T>(this, { finalPrompt: promptText });
                  } catch {
                    this.finalPrompt = '(error rendering prompt for loaded program)';
                    updateInternalState<T>(this, { finalPrompt: '(error rendering prompt for loaded program)' });
                  }
                }
                
                // Set iterations if debug is enabled and showIterations is true
                if (internalState._debugConfig.showIterations) {
                  const iterations = [{ code: String(existingProgram.generatedCode) }];
                  this.iterations = iterations;
                  updateInternalState<T>(this, { iterations });
                }
                
                // Set explanation if debug is enabled and explanations is true
                if (internalState._debugConfig.explanations) {
                  const explanation = 'Explanation not available for loaded program';
                  this.explanation = explanation;
                  updateInternalState<T>(this, { explanation });
                }
              }
              
              debugLog('persistence', `Loaded existing code from program "${internalState.persistId}"`);
            } else {
              // Need to save if we couldn't load existing code
              updateInternalState<T>(this, { needsSave: true });
            }
          } catch (error) {
            // If loading fails, we'll generate new code below
            debugLog('persistence', `No existing program "${internalState.persistId}" found or error loading it`);
            updateInternalState<T>(this, { needsSave: true }); // Need to save if we couldn't load existing code
          }
        }

        // If we already have generated code and aren't forcing regeneration, use it directly
        if (this.generatedCode && !options.forceRegenerate) {
          debugLog('program', "Using existing generated code - no LLM call needed");
          
          // Make sure debug properties are set even when using existing code
          if (internalState._debugConfig) {
            // Only set these if they're not already set
            if (internalState._debugConfig.showPrompt && !this.finalPrompt) {
              try {
                const promptText = this.template.render(variables);
                this.finalPrompt = promptText;
                updateInternalState<T>(this, { finalPrompt: promptText });
              } catch {
                this.finalPrompt = '(error rendering prompt for existing code)';
                updateInternalState<T>(this, { finalPrompt: '(error rendering prompt for existing code)' });
              }
            }
            
            if (internalState._debugConfig.showIterations && !this.iterations) {
              const iterations = [{ code: String(this.generatedCode) }];
              this.iterations = iterations;
              updateInternalState<T>(this, { iterations });
            }
            
            if (internalState._debugConfig.explanations && !this.explanation) {
              const explanation = 'Explanation not available for existing code';
              this.explanation = explanation;
              updateInternalState<T>(this, { explanation });
            }
          }
          
          const proxy = createFunctionProxy(String(this.generatedCode));
          return proxy;
        }

        // Log if we're forcing regeneration
        if (options.forceRegenerate) {
          debugLog('program', "forceRegenerate option is true - regenerating code");
          updateInternalState<T>(this, { needsSave: true }); // Need to save if we're forcing regeneration
        } else if (!this.generatedCode) {
          debugLog('program', "No cached code found - generating for the first time");
          updateInternalState<T>(this, { needsSave: true }); // Need to save if we're generating for the first time
        }

        // Debug the model information
        const modelProvider = this.modelDef.provider;
        const modelName = this.modelDef.model;
        debugLog('program', `Using model: ${modelProvider}/${modelName}`);

        // Generate the code
        const code = await this._generate(variables, options);

        // Store the generated code for future use
        this.generatedCode = String(code) as unknown as typeof this.generatedCode;

        // Try to extract function name for better logging
        const functionNameMatch = String(code).match(/function\s+([a-zA-Z0-9_]+)/);
        const functionName = functionNameMatch ? functionNameMatch[1] : 'anonymous';
        debugLog('program', `Generated function: ${functionName}`);

        // Save the generated code if we have a persist ID and need to save
        // Use the already defined internalState from above
        if (internalState.persistId && internalState.needsSave) {
          debugLog('persistence', `Saving program "${internalState.persistId}" to storage`);
          try {
            // Use await to properly wait for the save operation to complete
            await this.save(internalState.persistId);
            debugLog('persistence', `Successfully saved program "${internalState.persistId}" to storage`);
            // Reset the flag after successful save
            updateInternalState<T>(this, { needsSave: false });
          } catch (error) {
            debugLog('persistence', `Error saving program "${internalState.persistId}":`, error);
            // Don't reset the needsSave flag if saving failed
          }
        }

        const proxy = createFunctionProxy(String(code));
        return proxy;
      } catch (error) {
        debugLog('program', "Error executing program:", error);
        throw error;
      }
    },

    returns<R>(): ProgramBuilder<R> {
      debugLog('program', 'Original returns<R>() method called');
      // Create a new builder with the updated return type
      const typedBuilder = { ...this } as any;
      debugLog('program', 'returns() created new builder, making callable');
      const result = makeProgramCallable<R>(typedBuilder);
      debugLog('program', 'returns() final result callable?', typeof result === 'function');
      return result;
    },

    persist(id: string): ProgramBuilder<T> {
      // Store the persist ID in internal state
      updateInternalState<T>(this, {
        persistId: id,
        needsSave: true
      });

      // For testing purposes - this is checked in tests
      debugLog('program', `Program "${id}" has been persisted for later use`);

      // Instead of trying to load/save here, we'll defer to execute()
      // This prevents duplicate saves and allows execute() to handle all persistence logic
      return this as unknown as ProgramBuilder<T>;
    },

    async save(name: string): Promise<ProgramBuilder<T>> {
      // Get internal state - we'll use this later for updating state
      getInternalState<T>(this);
      
      debugLog('persistence', `--------------- PROGRAM SAVE DEBUG ---------------`);
      debugLog('persistence', `Saving program: ${name}`);
      debugLog('persistence', `Store base path: ${store.getBasePath()}`);
      debugLog('persistence', `Store instance ID: ${(store as any).testId || 'undefined'}`);

      // If we don't have generated code yet, generate it
      if (!this.generatedCode) {
        try {
          debugLog('persistence', `No generated code, generating now...`);
          await this._generate({});
          debugLog('persistence', `Code generated successfully`);
        } catch (error) {
          debugLog('persistence', `Error generating code:`, error);
          debugLog('program', `Could not pre-generate code for program "${name}". Will store template only.`);
        }
      } else {
        debugLog('persistence', `Using existing generated code`);
      }

      // Prepare data for storage
      const data = {
        template: {
          segments: this.template.segments,
          variables: this.template.variables
        },
        examples: this.exampleList,
        model: this.modelDef,
        generatedCode: this.generatedCode,
        // Include debug properties in the persisted data
        debug: {
          config: this._debugConfig,
          finalPrompt: this.finalPrompt,
          iterations: this.iterations,
          explanation: this.explanation
        }
      };

      debugLog('persistence', `Data prepared for storage, calling store.save...`);

      try {
        // Save to storage - only do this once
        const versionId = await store.save('program', name, data);
        debugLog('persistence', `Program saved with version ID: ${versionId}`);

        // Update internal state with the new persistId and reset needsSave flag
        updateInternalState<T>(this, {
          persistId: name,
          needsSave: false
        });

        // Verify the program exists after saving
        const programDir = path.join(store.getBasePath(), 'programs', name);
        
        // Add a small delay to ensure filesystem sync
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const dirExists = await fs.access(programDir).then(() => true).catch(() => false);
        debugLog('persistence', `Program directory exists after save: ${dirExists ? 'YES' : 'NO'} - ${programDir}`);

        if (dirExists) {
          const files = await fs.readdir(programDir);
          debugLog('persistence', `Files in program directory: ${files.join(', ')}`);
        } else {
          // If the directory doesn't exist after saving, this is a critical error
          // Try to create it manually as a last resort
          debugLog('persistence', `Critical error: Program directory does not exist after save. Attempting manual creation...`);
          await fs.mkdir(programDir, { recursive: true });
          
          // Write a placeholder latest.json file
          const latestPath = path.join(programDir, 'latest.json');
          await fs.writeFile(latestPath, JSON.stringify({ version: versionId }, null, 2));
          
          // Write the version file
          const versionPath = path.join(programDir, `${versionId}.json`);
          await fs.writeFile(versionPath, JSON.stringify(data, null, 2));
          
          debugLog('persistence', `Manual directory and file creation completed`);
        }
        
        // Return this for chaining
        return this as unknown as ProgramBuilder<T>;
      } catch (error) {
        debugLog('persistence', `Error saving program: ${(error as Error).message}`);
        // Don't reset needsSave flag if saving failed
        throw error; // Propagate the error
      }
    }
  };

  // Options method is already added to the builder object

  // Store the execution options on the builder
  (builder as any)._executionOptions = _executionOptions;

  // Make the builder callable
  const callableBuilder = makeProgramCallable(builder as unknown as ProgramBuilder<T>);
  return callableBuilder as ProgramBuilder<T>;
}

/**
 * Extract code blocks from a response
 */
function extractCodeFromResponse(response: string): string {
  // Look for code blocks with markdown-style backticks
  const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
  const matches = [...response.matchAll(codeBlockRegex)];

  if (matches.length > 0) {
    // Return the content of the first code block
    return matches[0][1].trim();
  }

  // If no code blocks found, return the entire response
  // but try to clean it up a bit
  return response.trim();
}
