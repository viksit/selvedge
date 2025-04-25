/**
 * Core functionality for the Selvedge library
 */
import { ModelRegistry } from './models';
import { ModelProvider, SelvedgeInstance, ModelDefinition } from './types';
import { createTemplate, PromptTemplate } from './prompts';
import { store } from './storage';
import { flow as createFlow } from './flow';
import { enableDebug, enableNamespace, parseDebugString } from './utils/debug';

import { program as createV2Program } from './programs/v2/entry';
import { CallableProgramBuilder } from './programs/v2/proxy';

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
   * List all registered models with their aliases and definitions
   * 
   * @returns An array of objects containing model aliases and their definitions
   * 
   * @example
   * ```typescript
   * // Register some models
   * selvedge.models({
   *   fast: selvedge.openai("gpt-3.5-turbo"),
   *   smart: selvedge.anthropic("claude-3-opus"),
   * });
   * 
   * // List all registered models
   * const models = selvedge.listModels();
   * console.log(models);
   * // [
   * //   { alias: "fast", definition: { provider: "openai", model: "gpt-3.5-turbo", ... } },
   * //   { alias: "smart", definition: { provider: "anthropic", model: "claude-3-opus", ... } }
   * // ]
   * ```
   */
  listModels(): Array<{ alias: string, definition: ModelDefinition }> {
    return ModelRegistry.listModels();
  },

  /**
   * Create a flow pipeline from a series of steps
   * 
   * @param steps - Array of steps to include in the pipeline
   * @returns A flow pipeline that can be executed
   * 
   * @example
   * ```typescript
   * // Create a flow from a series of prompt templates
   * const flow = selvedge.flow([
   *   extractKeyPoints,
   *   analyzeImplications,
   *   generateRecommendations
   * ]);
   * 
   * // Execute the flow
   * const result = await flow(input);
   * ```
   */
  flow<TInput = any, TOutput = any>(
    steps: Array<any>
  ) {
    // Use the existing flow implementation from the flow module
    return createFlow<TInput, TOutput>(...steps);
  },

  /**
   * Create an OpenAI model definition
   * 
   * @param model - The OpenAI model name
   * @param config - Optional configuration (API key will be loaded from OPENAI_API_KEY env var if not provided)
   * @returns A model definition object
   * 
   * @example
   * ```typescript
   * // Uses API key from .env file automatically
   * const gpt4 = selvedge.openai("gpt-4");
   * 
   * // Or with explicit configuration
   * const gpt4 = selvedge.openai("gpt-4", { 
   *   apiKey: "your-api-key",
   *   organization: "your-org-id"
   * });
   * ```
   */
  openai(model: string, config: Record<string, any> = {}): ModelDefinition {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!config.apiKey && apiKey) {
      config.apiKey = apiKey;
    }
    return {
      provider: ModelProvider.OPENAI,
      model,
      config
    };
  },

  /**
   * Create an Anthropic model definition
   * 
   * @param model - The Anthropic model name
   * @param config - Optional configuration (API key will be loaded from ANTHROPIC_API_KEY env var if not provided)
   * @returns A model definition object
   * 
   * @example
   * ```typescript
   * // Uses API key from .env file automatically
   * const claude = selvedge.anthropic("claude-3-opus");
   * 
   * // Or with explicit configuration
   * const claude = selvedge.anthropic("claude-3-opus", { 
   *   apiKey: "your-api-key" 
   * });
   * ```
   */
  anthropic(model: string, config: Record<string, any> = {}): ModelDefinition {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!config.apiKey && apiKey) {
      config.apiKey = apiKey;
    }
    return {
      provider: ModelProvider.ANTHROPIC,
      model,
      config
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
   * 
   * @example
   * ```typescript
   * const generateFunction = selvedge.program`
   *   Generate a JavaScript function that ${task => task}
   * `.withExamples([
   *   {
   *     input: { task: "sorts an array of numbers" },
   *     output: "function sortNumbers(arr) {\n  return [...arr].sort((a, b) => a - b);\n}"
   *   }
   * ]).using("smart");
   * 
   * // Later, generate code
   * const code = await generateFunction.generate({ task: "reverses a string" });
   * ```
   */
  program<T = string>(
    strings: TemplateStringsArray,
    ...values: any[]
  ): CallableProgramBuilder<T> {
    // Call the V2 factory function
    return createV2Program<T>(strings, values);
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
  },

  /**
   * Load a saved prompt by name
   * 
   * @param name - Name of the prompt to load
   * @param version - Optional specific version to load (defaults to latest)
   * @returns A prompt template with the loaded prompt
   * 
   * @example
   * ```typescript
   * // Load the latest version of a saved prompt
   * const myPrompt = await selvedge.loadPrompt("my-sentiment-analyzer");
   * 
   * // Use the loaded prompt
   * const result = await myPrompt.execute({ text: "I love this product!" });
   * ```
   */
  async loadPrompt<T = any>(name: string, version?: string): Promise<PromptTemplate<T>> {
    // Load the prompt data from storage
    const data = await store.load('prompt', name, version);

    // Create a base prompt template with empty segments
    const emptyTemplate = [''] as unknown as TemplateStringsArray;
    const template = createTemplate<T>(emptyTemplate, []);

    // Reconstruct the prompt template with the loaded data
    if (data && data.segments) {
      // Replace the template properties
      template.segments = data.segments;

      if (data.variables) {
        template.variables = data.variables;
      }
    }

    return template;
  },

  /**
   * List all saved prompts
   * 
   * @returns Array of prompt names
   * 
   * @example
   * ```typescript
   * const prompts = await selvedge.listPrompts();
   * console.log("Available prompts:", prompts);
   * ```
   */
  async listPrompts(): Promise<string[]> {
    return store.list('prompt');
  },

  /**
   * List all versions of a saved prompt
   * 
   * @param name - Name of the prompt
   * @returns Array of version IDs
   * 
   * @example
   * ```typescript
   * const versions = await selvedge.listPromptVersions("my-sentiment-analyzer");
   * console.log("Available versions:", versions);
   * ```
   */
  async listPromptVersions(name: string): Promise<string[]> {
    return store.listVersions('prompt', name);
  },

  /**
   * Configure debug logging
   * 
   * @param config - Debug configuration options
   * @example
   * ```typescript
   * // Enable all debug logs
   * selvedge.debug('*');
   * 
   * // Enable specific namespaces
   * selvedge.debug('program,persistence');
   * 
   * // Enable programmatically
   * selvedge.debug({ enabled: true, namespaces: ['program'] });
   * ```
   */
  debug(config: string | { enabled: boolean, namespaces?: string[] }): void {
    if (typeof config === 'string') {
      // Parse debug string (e.g., 'program,persistence')
      parseDebugString(config);
    } else {
      // Enable/disable debug globally
      enableDebug(config.enabled);

      // Enable specific namespaces if provided
      if (config.namespaces) {
        config.namespaces.forEach(ns => enableNamespace(ns, true));
      }
    }
  },
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
