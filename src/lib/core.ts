/**
 * Core functionality for the Selvedge library
 */
import { ModelRegistry } from './models';
import { ModelProvider, SelvedgeInstance, ModelDefinition } from './types';
import { createTemplate } from './prompts/template';
import { PromptTemplate } from './prompts/types';

/**
 * The main Selvedge instance that provides access to all library functionality
 */
export const selvedge: SelvedgeInstance = {
  /**
   * Register models with simple alias names
   * 
   * @param modelMap - Object mapping aliases to model definitions
   * @returns The updated Selvedge instance for chaining
   * 
   * @example
   * ```typescript
   * selvedge.models({
   *   fast: selvedge.openai("gpt-3.5-turbo"),
   *   smart: selvedge.anthropic("claude-3-opus"),
   * });
   * ```
   */
  models(modelMap: Record<string, ModelDefinition>): SelvedgeInstance {
    return ModelRegistry.registerModels(modelMap, this);
  },

  /**
   * Create an OpenAI model definition
   * 
   * @param model - The OpenAI model name
   * @returns A model definition object
   * 
   * @example
   * ```typescript
   * const gpt4 = selvedge.openai("gpt-4");
   * ```
   */
  openai(model: string): ModelDefinition {
    return {
      provider: ModelProvider.OPENAI,
      model,
    };
  },

  /**
   * Create an Anthropic model definition
   * 
   * @param model - The Anthropic model name
   * @returns A model definition object
   * 
   * @example
   * ```typescript
   * const claude = selvedge.anthropic("claude-3-opus");
   * ```
   */
  anthropic(model: string): ModelDefinition {
    return {
      provider: ModelProvider.ANTHROPIC,
      model,
    };
  },
  
  /**
   * Create a mock model definition (for testing)
   * 
   * @param model - The mock model identifier
   * @returns A model definition object
   * 
   * @example
   * ```typescript
   * const testModel = selvedge.mock("test-model", {
   *   responses: { completion: "Mock response" }
   * });
   * ```
   */
  mock(model: string): ModelDefinition {
    return {
      provider: ModelProvider.MOCK,
      model,
    };
  },

  /**
   * Create a template for program generation
   * 
   * @param strings - Template string parts
   * @param values - Values for template substitution
   * @returns A program builder object
   */
  program(strings: TemplateStringsArray, ...values: any[]): any {
    // This is a temporary placeholder implementation for Phase 1
    // Will be properly implemented in Phase 3
    const templateText = strings.reduce((result, str, i) => {
      return result + str + (values[i] || '');
    }, '');
    
    return {
      examples: () => ({ using: () => ({ persist: () => ({
        _template: templateText // Store but don't use yet
      }) }) })
    };
  },

  /**
   * Create a prompt template
   * 
   * @param strings - Template string parts
   * @param values - Values for template substitution
   * @returns A prompt template object
   * 
   * @example
   * ```typescript
   * const sentiment = selvedge.prompt`
   *   Analyze the sentiment in this text: ${text}
   *   Rate from -1.0 (negative) to 1.0 (positive)
   * `.returns<{ score: number }>();
   * 
   * // Later, execute the prompt
   * const result = await sentiment.execute({ text: "I love this product!" });
   * console.log(result.score); // 0.9
   * ```
   */
  prompt<T = any>(strings: TemplateStringsArray, ...values: any[]): PromptTemplate<T> {
    return createTemplate<T>(strings, values);
  }
};

/**
 * Version information for the library
 */
export const version = {
  major: 0,
  minor: 1,
  patch: 0,
  toString: () => `${version.major}.${version.minor}.${version.patch}`
};
