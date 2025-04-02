/**
 * Prompt template implementation
 */
import { PromptVariables, PromptVariable, PromptSegment, PromptTemplate, PromptExecutionOptions } from './types';
import { ModelRegistry } from '../models';
import { ModelDefinition, ModelProvider } from '../types';
import { store } from '../storage';
import * as z from 'zod';
import { inferSchema, generateJsonExampleFromSchema, validateWithSchema } from '@schema/index';

/**
 * Default variable renderer
 */
const defaultRenderer = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  // For objects and arrays, stringify with nice formatting
  return JSON.stringify(value, null, 2);
};

/**
 * Extract parameter names from a function
 */
function extractParameterNames(fn: Function): string[] {
  const fnStr = fn.toString();
  // Using a more robust regex to extract parameter names
  const argsMatch = fnStr.match(/(?:function)?\s*\w*\s*\(([^)]*)\)|(\w+)\s*=>\s*\w+|\(([^)]*)\)\s*=>/);
  
  if (!argsMatch) {
    return [];
  }
  
  // Find the first non-undefined capture group
  const argsStr = argsMatch[1] || argsMatch[2] || argsMatch[3] || '';
  
  if (!argsStr) {
    return [];
  }
  
  return argsStr.split(',').map(arg => arg.trim());
}

/**
 * Parse template string parts and values into segments and variables
 */
export function parseTemplate(
  strings: TemplateStringsArray,
  values: any[]
): { segments: PromptSegment[], variables: PromptVariable[] } {
  const segments: PromptSegment[] = [];
  const variables: PromptVariable[] = [];
  
  // Always start with the first string part
  segments.push(strings[0]);
  
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const nextString = strings[i + 1];
    
    if (typeof value === 'function') {
      // This is a variable with a custom renderer
      const paramNames = extractParameterNames(value);
      const name = paramNames.length > 0 ? paramNames[0] : `var${i}`;
      
      const variable: PromptVariable = {
        name,
        renderer: value,
        originalFn: value,
      };
      
      variables.push(variable);
      segments.push(variable);
    } else {
      // This is a literal value
      segments.push(defaultRenderer(value));
    }
    
    // Add the next string part
    if (nextString) {
      segments.push(nextString);
    }
  }
  
  return { segments, variables };
}

/**
 * Create a new template with custom props from a base template
 */
function createTemplateFromBase<T>(base: PromptTemplate<any>, overrides: Partial<PromptTemplate<T>>): PromptTemplate<T> {
  // Create a new template that uses the provided segments but keeps the original methods
  const newTemplate: PromptTemplate<T> = { 
    // Copy the original properties
    segments: [...base.segments],
    variables: [...base.variables],
    
    // Create a new render function that uses the new segments
    render: function(variables: PromptVariables): string {
      // Use the segments from this template, not the base template
      return this.segments.map(segment => {
        if (typeof segment === 'string') {
          return segment;
        }
        
        // This is a variable segment
        if (segment.name && segment.renderer) {
          // Get the value from the provided variables or use empty string
          const value = segment.name in variables ? variables[segment.name] : '';
          // Apply the renderer function
          try {
            return defaultRenderer(segment.renderer(value));
          } catch (e) {
            console.error(`Error rendering variable ${segment.name}:`, e);
            return defaultRenderer(value);
          }
        }
        
        return '';
      }).join('');
    },
    
    // Copy the other methods from the base template
    execute: base.execute,
    returns: base.returns,
    formatResponse: base.formatResponse,
    prefix: base.prefix,
    suffix: base.suffix,
    clone: base.clone,
    train: base.train,
    using: base.using,
    
    // Apply any overrides
    ...overrides
  } as PromptTemplate<T>;
  
  return newTemplate;
}

/**
 * Create a new prompt template
 */
export function createTemplate<T = any>(
  strings: TemplateStringsArray,
  values: any[]
): PromptTemplate<T> {
  const { segments, variables } = parseTemplate(strings, values);
  
  const template: PromptTemplate<any> = {
    segments,
    variables,
    
    render(variables: PromptVariables = {}): string {
      return segments.map(segment => {
        if (typeof segment === 'string') {
          return segment;
        }
        
        // This is a variable segment
        if (segment.name && segment.renderer) {
          // Get the value from the provided variables or use empty string
          const value = segment.name in variables ? variables[segment.name] : '';
          // Apply the renderer function
          try {
            return defaultRenderer(segment.renderer(value));
          } catch (e) {
            console.error(`Error rendering variable ${segment.name}:`, e);
            return defaultRenderer(value);
          }
        }
        
        return '';
      }).join('');
    },
    
    async execute<R = T>(
      variables: PromptVariables = {},
      options: PromptExecutionOptions = {}
    ): Promise<R> {
      // Render the prompt
      const prompt = this.render(variables);
      
      // Determine which model to use
      let modelDef: ModelDefinition;
      
      if (typeof options.model === 'string') {
        // Try to find model by alias
        const resolvedModel = ModelRegistry.getModel(options.model);
        
        if (!resolvedModel) {
          throw new Error(`Model alias not found: ${options.model}`);
        }
        
        modelDef = resolvedModel;
      } else if (options.model) {
        // Use the provided model definition
        modelDef = options.model;
      } else {
        // Default to OpenAI's GPT-3.5 Turbo
        modelDef = {
          provider: ModelProvider.OPENAI,
          model: 'gpt-3.5-turbo',
        };
      }
      
      // Get the adapter for this model
      const adapter = ModelRegistry.getAdapter(modelDef);
      
      if (!adapter) {
        throw new Error(`No adapter found for model: ${modelDef.provider}:${modelDef.model}`);
      }
      
      // Determine if we should use chat or completion based on provider and model
      let response: string;
      
      // For tests, we'll use chat for mock models
      if (modelDef.provider === ModelProvider.MOCK ||
          modelDef.provider === ModelProvider.ANTHROPIC || 
          modelDef.model.includes('gpt-')) {
        // Use chat interface
        const messages = [
          { role: 'user', content: prompt }
        ];
        
        // Add system message if provided
        if (options.system) {
          messages.unshift({ role: 'system', content: options.system });
        }
        
        response = await adapter.chat(messages, options);
      } else {
        // Use completion interface
        response = await adapter.complete(prompt, options);
      }
      
      // Format the response based on the expected return type
      return this.formatResponse(response) as unknown as R;
    },
    
    returns<R>(schema?: z.ZodType<R>): PromptTemplate<R> {
      // If no schema is provided, try to infer one from the type parameter
      const zodSchema = schema || inferSchema<R>();
      
      // Generate an example from the schema
      const example = generateJsonExampleFromSchema(zodSchema);
      
      // Create a new template with the example format appended
      const enhancedTemplate = this.clone();
      
      // Only append format information if we have a non-empty example
      if (example && example !== '{}' && example !== '[]') {
        // Add the format example as a string segment
        enhancedTemplate.segments.push(`\n\nYour response must be in this JSON format:\n${example}`);
      }
      
      // Return a new template with the enhanced prompt and response handling
      return createTemplateFromBase<R>(enhancedTemplate, {
        formatResponse: (response: string): R => {
          const extractedJson = extractJsonFromString(response);
          if (extractedJson) {
            try {
              // Validate the extracted JSON against the schema
              // Use silent option to avoid showing validation errors in the console
              const validated = validateWithSchema(zodSchema, extractedJson, { silent: true });
              if (validated) {
                return validated as R;
              }
            } catch (e) {
              // This catch block is less likely to be reached now with the silent option
              console.warn('Response validation failed:', e);
            }
            // If validation fails, return as-is
            return extractedJson as R;
          }
          return response as unknown as R;
        },
        
        // Preserve the save method
        save: async (name: string): Promise<PromptTemplate<R>> => {
          // Prepare data for storage
          const data = {
            segments: this.segments,
            variables: this.variables
          };
          
          // Save to storage
          await store.save('prompt', name, data);
          
          // Return this for chaining
          return enhancedTemplate as unknown as PromptTemplate<R>;
        }
      });
    },
    
    formatResponse(response: string): T {
      // Default implementation just returns the string
      return response as unknown as T;
    },
    
    prefix(text: string): PromptTemplate<T> {
      // Create a new template with the prefix text added
      return createTemplateFromBase<T>(this, {
        segments: [text, ...this.segments]
      });
    },
    
    suffix(text: string): PromptTemplate<T> {
      // Create a new template with the suffix text added
      return createTemplateFromBase<T>(this, {
        segments: [...this.segments, text]
      });
    },
    
    clone(): PromptTemplate<T> {
      // Create a deep copy of the template
      return createTemplateFromBase<T>(this, {});
    },
    
    train(examples: Array<{ text: any, output: T }>): PromptTemplate<T> {
      // Create a new template with training examples
      const examplesText = examples.map(ex => {
        const input = typeof ex.text === 'string' ? ex.text : JSON.stringify(ex.text, null, 2);
        const output = typeof ex.output === 'string' ? ex.output : JSON.stringify(ex.output, null, 2);
        return `Input: ${input}\nOutput: ${output}\n---\n`;
      }).join('\n');
      
      // Add examples as a prefix
      const prefixText = `Examples:\n${examplesText}\n\nNow, process the following input:`;
      return this.prefix(prefixText);
    },
    
    using(model: string | ModelDefinition): PromptTemplate<T> {
      // Create a new template with the specified model
      const self = this;
      return createTemplateFromBase<T>(this, {
        execute: async function<R = T>(
          variables: PromptVariables,
          options: PromptExecutionOptions = {}
        ): Promise<R> {
          // Override the model in options
          const newOptions = {
            ...options,
            model
          };
          
          // Call the original execute method with the new options
          return self.execute<R>(variables, newOptions);
        }
      });
    },
    
    async save(name: string): Promise<PromptTemplate<T>> {
      // Prepare data for storage
      const data = {
        segments: this.segments,
        variables: this.variables
      };
      
      // Save to storage
      await store.save('prompt', name, data);
      
      // Return this for chaining
      return this;
    }
  };
  
  return template;
}

/**
 * Attempts to extract valid JSON from a string that might contain other text
 * 
 * @param text - The string that might contain JSON
 * @returns The parsed JSON object if found, otherwise null
 */
function extractJsonFromString(text: string): any | null {
  // Clean the input text
  const cleanedText = text.trim();
  
  // First, try direct parsing if it looks like JSON
  if ((cleanedText.startsWith('{') && cleanedText.endsWith('}')) || 
      (cleanedText.startsWith('[') && cleanedText.endsWith(']'))) {
    try {
      return JSON.parse(cleanedText);
    } catch (e) {
      // Direct parsing failed, continue to more advanced methods
    }
  }
  
  // Try to find JSON objects using regex
  try {
    // Look for objects: {...}
    const objectMatches = cleanedText.match(/\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g);
    if (objectMatches && objectMatches.length > 0) {
      // Try each match, starting with the largest one (most likely to be the complete object)
      const sortedMatches = objectMatches.sort((a, b) => b.length - a.length);
      
      for (const match of sortedMatches) {
        try {
          return JSON.parse(match);
        } catch (e) {
          // This match failed, try the next one
          continue;
        }
      }
    }
    
    // Look for arrays: [...]
    const arrayMatches = cleanedText.match(/\[(?:[^\[\]]|(?:\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\]))*\]/g);
    if (arrayMatches && arrayMatches.length > 0) {
      // Try each match, starting with the largest one
      const sortedMatches = arrayMatches.sort((a, b) => b.length - a.length);
      
      for (const match of sortedMatches) {
        try {
          return JSON.parse(match);
        } catch (e) {
          // This match failed, try the next one
          continue;
        }
      }
    }
  } catch (e) {
    console.error('Error while trying to extract JSON with regex:', e);
  }
  
  // If we're dealing with markdown code blocks, try to extract JSON from them
  try {
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
    const codeBlocks = [...cleanedText.matchAll(codeBlockRegex)];
    
    for (const block of codeBlocks) {
      const codeContent = block[1].trim();
      try {
        return JSON.parse(codeContent);
      } catch (e) {
        // This code block didn't contain valid JSON, try the next one
        continue;
      }
    }
  } catch (e) {
    console.error('Error while trying to extract JSON from code blocks:', e);
  }
  
  // No valid JSON found
  return null;
}
