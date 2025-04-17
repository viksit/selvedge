/**
 * Type definitions for the program generation system
 */
import { ModelDefinition } from '../types';
import { PromptTemplate } from '../prompts/types';

/**
 * Configuration options for program execution
 */
export interface ProgramExecutionOptions {
  /** Model to use for this program execution */
  model?: ModelDefinition | string;

  /** Temperature setting (0.0-1.0) for controlling randomness */
  temperature?: number;

  /** Maximum number of tokens to generate */
  maxTokens?: number;

  /** Number of code samples to generate */
  samples?: number;

  /** Whether to include explanations with the generated code */
  includeExplanations?: boolean;

  /** Additional model-specific parameters */
  [key: string]: any;
}

/**
 * Variables passed to program templates
 */
export type ProgramVariables = Record<string, any>;

/**
 * A program example for few-shot learning
 */
export interface ProgramExample {
  /** Input for the example */
  input: any;
  /** Expected output (code) for the example */
  output: string;
}

/**
 * A program builder for constructing code generation programs
 */
export interface ProgramBuilder<T = string> {
  /** Call signature - makes the program directly callable */
  (...args: any[]): Promise<T>;

  /** The underlying prompt template */
  template: PromptTemplate;

  /** Examples for few-shot learning */
  exampleList: ProgramExample[];

  /** The model definition to use for generation */
  modelDef: ModelDefinition;

  /** Cached generated code */
  generatedCode: string | null;

  /** ID used for persistence, if this program has been persisted */
  persistId?: string;

  /** Flag to track if the program needs to be saved */
  needsSave?: boolean;

  /** Debug configuration */
  _debugConfig?: { showPrompt?: boolean; showIterations?: boolean; explanations?: boolean };

  /** Explanation of the generated code (when debug with explanations is enabled) */
  explanation?: string;

  /** Iterations of code generation (when debug with showIterations is enabled) */
  iterations?: any[];

  /** Final prompt sent to the LLM (when debug with showPrompt is enabled) */
  finalPrompt?: string;

  /** Add examples for few-shot learning */
  examples(examples: ProgramExample[]): ProgramBuilder<T>;

  /** Specify the model to use for generation */
  using(model: ModelDefinition | string): ProgramBuilder<T>;

  /** Generate code with the given variables */
  _generate(variables: ProgramVariables, options?: ProgramExecutionOptions): Promise<T>;

  /** 
   * Execute the generated function with the given variables
   * Returns a proxy that allows direct function calls
   */
  _build(variables?: ProgramVariables, options?: ProgramExecutionOptions): Promise<any>;

  /** Specify the return type of the program */
  returns<R>(): ProgramBuilder<R>;

  /** Set execution options for this program */
  options(opts: ProgramExecutionOptions): ProgramBuilder<T>;

  /** Enable debug mode for this program builder */
  debug(config: { showPrompt?: boolean; showIterations?: boolean; explanations?: boolean }): ProgramBuilder<T>;

  /** Save this program for later use (legacy method) */
  persist(id: string): ProgramBuilder<T>;

  /** 
   * Save this program with versioning
   * @param name Name to save the program under
   * @returns The program builder for chaining
   */
  save(name: string): Promise<ProgramBuilder<T>>;
}
