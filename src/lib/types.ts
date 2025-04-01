/**
 * Type definitions for the Selvedge library
 */

/**
 * Supported model providers
 */
export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  MOCK = 'mock',
}

/**
 * Definition of a model including provider and model ID
 */
export interface ModelDefinition {
  /** The LLM provider (OpenAI, Anthropic, etc.) */
  provider: ModelProvider;
  
  /** The specific model identifier */
  model: string;
  
  /** Optional configuration for the model */
  config?: Record<string, any>;
}

/**
 * The core Selvedge instance interface
 */
export interface SelvedgeInstance {
  /**
   * Register models with simple alias names
   */
  models(modelMap: Record<string, ModelDefinition>): SelvedgeInstance;
  
  /**
   * Create an OpenAI model definition
   */
  openai(model: string): ModelDefinition;
  
  /**
   * Create an Anthropic model definition
   */
  anthropic(model: string): ModelDefinition;
  
  /**
   * Create a mock model definition (for testing)
   */
  mock(model: string): ModelDefinition;
  
  /**
   * Create a template for program generation
   */
  program<T = string>(strings: TemplateStringsArray, ...values: any[]): import('./programs/types').ProgramBuilder<T>;
  
  /**
   * Create a prompt template
   */
  prompt<T = any>(strings: TemplateStringsArray, ...values: any[]): import('./prompts/types').PromptTemplate<T>;
  
  /**
   * Load a saved program by name
   * @param name Name of the program to load
   * @param version Optional specific version to load (defaults to latest)
   * @returns A program builder with the loaded program
   */
  loadProgram<T = string>(name: string, version?: string): Promise<import('./programs/types').ProgramBuilder<T>>;
  
  /**
   * List all saved programs
   * @returns Array of program names
   */
  listPrograms(): Promise<string[]>;
  
  /**
   * List all versions of a saved program
   * @param name Name of the program
   * @returns Array of version IDs
   */
  listProgramVersions(name: string): Promise<string[]>;
  
  /**
   * Load a saved prompt by name
   * @param name Name of the prompt to load
   * @param version Optional specific version to load (defaults to latest)
   * @returns A prompt template with the loaded prompt
   */
  loadPrompt<T = any>(name: string, version?: string): Promise<import('./prompts/types').PromptTemplate<T>>;
  
  /**
   * List all saved prompts
   * @returns Array of prompt names
   */
  listPrompts(): Promise<string[]>;
  
  /**
   * List all versions of a saved prompt
   * @param name Name of the prompt
   * @returns Array of version IDs
   */
  listPromptVersions(name: string): Promise<string[]>;
}

/**
 * Common configuration options for API clients
 */
export interface ApiClientConfig {
  /** API key to use for authentication */
  apiKey?: string;
  
  /** Base URL to use for API requests */
  baseUrl?: string;
  
  /** Maximum number of retries for failed requests */
  maxRetries?: number;
  
  /** Timeout in milliseconds for requests */
  timeout?: number;
}

/**
 * Generic model adapter that handles communication with LLM APIs
 */
export interface ModelAdapter {
  /** Send a completion request to the model */
  complete(prompt: string, options?: Record<string, any>): Promise<string>;
  
  /** Generate chat completions */
  chat(messages: any[], options?: Record<string, any>): Promise<any>;
  
  /** Optional method to set mock responses for testing */
  setResponses?(responses: { completion?: string; chat?: string | ((messages: any[]) => string); promptMap?: Record<string, string> }): void;
}
