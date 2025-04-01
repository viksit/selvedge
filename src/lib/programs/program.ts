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
    console.error("Error evaluating compiled code:", error);
    console.error("Compiled code:", result.outputText);
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
 * Creates a proxy for a generated function that allows direct calls
 * @param code The generated TypeScript code
 * @returns A proxy object that can be called directly or accessed by function name
 */
function createFunctionProxy(code: string): any {
  // Extract function name using regex
  const match = code.match(/function\s+([a-zA-Z0-9_]+)/);
  if (!match) {
    throw new Error("No function found in generated code");
  }

  const functionName = match[1];
  
  // Use our TypeScript evaluator
  return evaluateTypeScript(code, functionName);
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

    async generate(variables: ProgramVariables, options: ProgramExecutionOptions = {}): Promise<T> {
      // Combine the template, examples, and variables to create a prompt for code generation
      let prompt = '';

      // Add system instruction
      prompt += 'You are an expert programmer. Generate code based on the following instructions and examples.\n\n';

      // Add examples if available
      if (this.exampleList.length > 0) {
        prompt += 'EXAMPLES:\n\n';

        for (const example of this.exampleList) {
          prompt += 'Input:\n';
          prompt += JSON.stringify(example.input, null, 2) + '\n\n';
          prompt += 'Output:\n';
          prompt += example.output + '\n\n';

          if (example.explanation && options.includeExplanations) {
            prompt += 'Explanation:\n';
            prompt += example.explanation + '\n\n';
          }

          prompt += '---\n\n';
        }
      }

      // Add the main instruction from the template
      prompt += 'INSTRUCTION:\n';
      prompt += template.render(variables) + '\n\n';

      // Add the input variables
      prompt += 'INPUT:\n';
      prompt += JSON.stringify(variables, null, 2) + '\n\n';

      // Add the output instruction
      prompt += 'OUTPUT (code only, no explanations unless requested):\n';

      // Determine which model to use
      const modelToUse = options.model ?
        (typeof options.model === 'string' ? ModelRegistry.getModel(options.model) : options.model) :
        this.modelDef;

      if (!modelToUse) {
        throw new Error('No model specified for code generation');
      }

      // Get the adapter for this model
      const adapter = ModelRegistry.getAdapter(modelToUse);

      if (!adapter) {
        throw new Error(`No adapter found for model: ${modelToUse.provider}:${modelToUse.model}`);
      }

      // Execute the prompt
      let response: string;

      // For most models, we'll use the chat interface
      const messages = [
        { role: 'system', content: 'You are an expert programmer. Generate code based on the instructions and examples provided.' },
        { role: 'user', content: prompt }
      ];

      // Set execution options
      const execOptions = {
        temperature: options.temperature ?? 0.2, // Lower temperature for code generation
        maxTokens: options.maxTokens,
        ...options
      };

      response = await adapter.chat(messages, execOptions);

      // Process the response to extract just the code
      const codeResponse = extractCodeFromResponse(response);

      return codeResponse as unknown as T;
    },

    async execute(variables: ProgramVariables = {}, options: ProgramExecutionOptions = {}): Promise<any> {
      try {
        // Generate the function code
        const code = await this.generate(variables, options);
        
        // Create and return a proxy for the function
        return createFunctionProxy(String(code));
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('TypeScript compilation errors')) {
          console.error("TypeScript compilation failed for generated code");
        }
        throw error;
      }
    },

    returns<R>(): ProgramBuilder<R> {
      // Create a new builder with the updated return type
      return this as unknown as ProgramBuilder<R>;
    },

    persist(id: string): ProgramBuilder<T> {
      // In a real implementation, this would store the program in a persistent store
      // For now, we'll just log it and return the same builder
      console.log(`Program "${id}" has been persisted for later use`);

      // We could add the program to a registry for later retrieval
      // This would be similar to how the ModelRegistry works
      // ProgramRegistry.registerProgram(id, this);

      // For demonstration purposes, we'll attach the ID to the builder
      const newBuilder = { ...this, id };
      return newBuilder;
    },
    
    async save(name: string): Promise<ProgramBuilder<T>> {
      // Prepare data for storage
      const data = {
        template: {
          segments: this.template.segments,
          variables: this.template.variables
        },
        examples: this.exampleList,
        model: this.modelDef
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
