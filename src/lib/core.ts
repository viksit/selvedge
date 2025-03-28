/**
 * Core functionality for the Selvedge library
 */

import { ModelRegistry } from './models';
import { ModelProvider, SelvedgeInstance, ModelDefinition } from './types';

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
   * @returns A prompt builder object
   */
  prompt(strings: TemplateStringsArray, ...values: any[]): any {
    // This is a temporary placeholder implementation for Phase 1
    // Will be properly implemented in Phase 2
    const templateText = strings.reduce((result, str, i) => {
      return result + str + (values[i] || '');
    }, '');
    
    return {
      returns: () => ({
        _template: templateText // Store but don't use yet
      })
    };
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
