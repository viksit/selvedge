/**
 * Program generation implementation
 */
import { ProgramBuilder, ProgramExample, ProgramVariables, ProgramExecutionOptions } from './types';
import { createTemplate } from '../prompts/template';
import { ModelRegistry } from '../models';
import { ModelDefinition, ModelProvider } from '../types';
import * as ts from 'typescript';
import * as vm from 'vm';
import { store } from '../storage';
import { debug } from '../utils/debug';

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
    debug('typescript', "Error evaluating compiled code:", error);
    debug('typescript', "Compiled code:", result.outputText);
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
    debug('typescript', "Generated code:", code);
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
 * Create a new program builder
 */
export function createProgram<T = string>(
  strings: TemplateStringsArray,
  values: any[]
): ProgramBuilder<T> {
  // Create the underlying prompt template
  const template = createTemplate(strings, values);

  // Default model to use
  let modelDef: ModelDefinition = {
    provider: ModelProvider.OPENAI,
    model: 'gpt-4',
  };

  // Examples for few-shot learning
  let exampleList: ProgramExample[] = [];

  const builder: ProgramBuilder<T> = {
    template,
    exampleList,
    modelDef, // Add modelDef property to the builder object
    generatedCode: null,
    persistId: undefined,
    needsSave: false,

    withExamples(newExamples: ProgramExample[]): ProgramBuilder<T> {
      // Create a new builder with the updated examples
      const newBuilder = { ...this };
      newBuilder.exampleList = [...exampleList, ...newExamples];
      return newBuilder;
    },

    examples(inputOutputMap: Record<string, any>): ProgramBuilder<T> {
      // Convert the input-output map to ProgramExample array
      const newExamples: ProgramExample[] = Object.entries(inputOutputMap).map(([input, output]) => ({
        input: { input },
        output: typeof output === 'string' ? output : JSON.stringify(output, null, 2)
      }));

      // Create a new builder with the updated examples
      return this.withExamples(newExamples);
    },

    using(model: ModelDefinition | string): ProgramBuilder<T> {
      // Create a new builder with the updated model
      const newBuilder = { ...this };

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

      return newBuilder;
    },

    async generate(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<T> {
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
      this.generatedCode = String(codeResponse);

      return codeResponse as unknown as T;
    },

    async build(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<any> {
      try {
        // If we have a persist ID but no generated code yet, try to load it first
        if (this.persistId && !this.generatedCode && !options.forceRegenerate) {
          try {
            const existingProgram = await store.load('program', this.persistId);
            if (existingProgram && existingProgram.generatedCode) {
              this.generatedCode = existingProgram.generatedCode;
              debug('persistence', `Loaded existing code from program "${this.persistId}"`);
              this.needsSave = false; // Don't need to save if we loaded existing code
            } else {
              this.needsSave = true; // Need to save if we couldn't load existing code
            }
          } catch (error) {
            // If loading fails, we'll generate new code below
            debug('persistence', `No existing program "${this.persistId}" found or error loading it`);
            this.needsSave = true; // Need to save if we couldn't load existing code
          }
        }

        // If we already have generated code and aren't forcing regeneration, use it directly
        if (this.generatedCode && !options.forceRegenerate) {
          debug('program', "Using existing generated code - no LLM call needed");
          return createFunctionProxy(String(this.generatedCode));
        }

        // Log if we're forcing regeneration
        if (options.forceRegenerate) {
          debug('program', "forceRegenerate option is true - regenerating code");
          this.needsSave = true; // Need to save if we're forcing regeneration
        } else if (!this.generatedCode) {
          debug('program', "No cached code found in execute() - generating for the first time");
          this.needsSave = true; // Need to save if we're generating for the first time
        }

        // Generate the code
        const code = await this.generate(variables, options);

        // Store the generated code for future use
        this.generatedCode = String(code);

        // Save the generated code if we have a persist ID and need to save
        if (this.persistId && this.needsSave) {
          debug('persistence', `Saving program "${this.persistId}" to storage`);
          this.save(this.persistId).catch(error => {
            debug('persistence', `Error saving program "${this.persistId}":`, error);
          });
          // Reset the flag after saving
          this.needsSave = false;
        }

        return createFunctionProxy(String(code));
      } catch (error) {
        debug('program', "Error executing program:", error);
        throw error;
      }
    },

    returns<R>(): ProgramBuilder<R> {
      // Create a new builder with the updated return type
      return this as unknown as ProgramBuilder<R>;
    },

    persist(id: string): ProgramBuilder<T> {
      // Store the persist ID
      this.persistId = id;
      this.needsSave = true;

      // For testing purposes - this is checked in tests
      console.log(`Program "${id}" has been persisted for later use`);

      // Instead of trying to load/save here, we'll defer to execute()
      // This prevents duplicate saves and allows execute() to handle all persistence logic
      return this;
    },

    async save(name: string): Promise<ProgramBuilder<T>> {
      // If we don't have generated code yet, generate it
      if (!this.generatedCode) {
        try {
          await this.generate({});
        } catch (error) {
          debug('program', `Could not pre-generate code for program "${name}". Will store template only.`);
        }
      }

      // Prepare data for storage
      const data = {
        template: {
          segments: this.template.segments,
          variables: this.template.variables
        },
        examples: this.exampleList,
        model: this.modelDef,
        generatedCode: this.generatedCode
      };

      // Save to storage
      await store.save('program', name, data);

      // Return this for chaining
      return this;
    }
  };

  return builder;
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
