/**
 * Core functionality for the Selvedge library
 */
import { ModelRegistry } from './models';
import { ModelProvider, SelvedgeInstance, ModelDefinition } from './types';
import { createTemplate, PromptTemplate, PromptVariables } from './prompts';
import { createProgram, ProgramBuilder } from './programs';
import { store } from './storage';
import { flow as createFlow } from './flow';
import { enableDebug, enableNamespace, parseDebugString, debug } from './utils/debug';
import schemaHelpers from './schema'; // Import the schema helpers

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
  listModels(): Array<{ alias: string; definition: ModelDefinition; }> {
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
   * ]).using("smart");
   *
   * // Later, generate code
   * const code = await generateFunction.generate({ task: "reverses a string" });
   * ```
   */
  program<T = string>(strings: TemplateStringsArray, ...values: any[]): ProgramBuilder<T> {
    return createProgram<T>(strings, values);
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
   * Load a saved program by name
   *
   * @param name - Name of the program to load
   * @param version - Optional specific version to load (defaults to latest)
   * @returns A program builder with the loaded program
   *
   * @example
   * ```typescript
   * // Load the latest version of a saved program
   * const myProgram = await selvedge.loadProgram("my-code-generator");
   *
   * // Use the loaded program
   * const result = await myProgram.generate({ task: "reverse a string" });
   * ```
   */
  async loadProgram<T = string>(name: string, version?: string): Promise<ProgramBuilder<T>> {
    // Debug store instance
    console.log('--------------- LOAD PROGRAM DEBUG ---------------');
    console.log(`Load store ID: ${(store as any).testId || 'undefined'}`);
    console.log(`Load store instance: ${store.constructor.name}`);
    console.log(`Load base path: ${store.getBasePath()}`);
    console.log(`Loading program: ${name}`);
    console.log('---------------------------------------------------');

    // Load the program data from storage
    const data = await store.load('program', name, version);

    // Create a base program builder with an empty template
    // Use a minimal template string to initialize the program builder
    const emptyTemplate = [''] as unknown as TemplateStringsArray;
    const builder = createProgram<T>(emptyTemplate, []);

    // Reconstruct the program builder with the loaded data
    if (data && data.template) {
      // Replace the template properties
      builder.template.segments = data.template.segments;
      builder.template.variables = data.template.variables;
      if (data.model) {
        // First, store the original model definition
        builder.modelDef = data.model;

        // For mock models, ensure we use the currently registered mock adapter
        if (data.model.provider === ModelProvider.MOCK) {
          const currentModel = ModelRegistry.getModel(data.model.model);
          if (currentModel) {
            debug('program', `Reconnecting mock model "${data.model.model}" to current adapter`);
            builder.modelDef = currentModel;
          }
        }
      }

      // Set the generated code if available
      if (data.generatedCode) {
        // Try to validate the code using TypeScript's parser
        try {
          const ts = require('typescript');
          const sourceFile = ts.createSourceFile(
            'temp.ts',
            String(data.generatedCode),
            ts.ScriptTarget.Latest,
                        /*setParentNodes*/ false
          );

          // Check if we have at least one valid statement or declaration
          const hasValidCode = sourceFile &&
            sourceFile.statements &&
            sourceFile.statements.length > 0 &&
            // Check if it has at least one function declaration or expression
            sourceFile.statements.some((stmt: any) => ts.isFunctionDeclaration(stmt) ||
              (ts.isVariableStatement(stmt) &&
                stmt.declarationList.declarations.some((decl: any) => decl.initializer &&
                  (ts.isFunctionExpression(decl.initializer) ||
                    ts.isArrowFunction(decl.initializer))
                ))
            );

          if (hasValidCode) {
            debug('program', `Loaded valid code from storage (${data.generatedCode})`);
            builder.generatedCode = data.generatedCode;
          } else {
            debug('program', `Loaded code does not contain valid functions, will regenerate`);
            builder.generatedCode = null;
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          debug('program', `Error validating loaded code: ${errorMessage}`);
          builder.generatedCode = null;
        }
      } else {
        builder.generatedCode = null;
      }
    }

    return builder as ProgramBuilder<T>;
  },

  /**
   * List all saved programs
   *
   * @returns Array of program names
   *
   * @example
   * ```typescript
   * const programs = await selvedge.listPrograms();
   * console.log("Available programs:", programs);
   * ```
   */
  async listPrograms(): Promise<string[]> {
    return store.list('program');
  },

  /**
   * List all versions of a saved program
   *
   * @param name - Name of the program
   * @returns Array of version IDs
   *
   * @example
   * ```typescript
   * const versions = await selvedge.listProgramVersions("my-code-generator");
   * console.log("Available versions:", versions);
   * ```
   */
  async listProgramVersions(name: string): Promise<string[]> {
    return store.listVersions('program', name);
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
  debug(config: string | { enabled: boolean; namespaces?: string[]; }): void {
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

  /**
   * Access to schema helper functions (string, number, array, etc.)
   */
  schema: schemaHelpers,

  /**
   * Create a Chain of Thought prompt
   */
  ChainOfThought: (t: TemplateStringsArray, ...v: any[]) =>
    selvedge.prompt(t, ...v).prefix('Think step-by-step before answering.\n'),

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
