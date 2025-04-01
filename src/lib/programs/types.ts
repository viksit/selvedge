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
  /** Input variables for this example */
  input: ProgramVariables;

  /** Expected output code for this example */
  output: string;

  /** Optional explanation of the example */
  explanation?: string;
}

/**
 * A program builder for constructing code generation programs
 */
export interface ProgramBuilder<T = string> {
  /** The underlying prompt template */
  template: PromptTemplate;

  /** Examples for few-shot learning */
  exampleList: ProgramExample[];

  /** The model definition to use for generation */
  modelDef: ModelDefinition;

  /** Add examples to the program builder */
  withExamples(examples: ProgramExample[]): ProgramBuilder<T>;

  /** Add examples using a simpler input-output format */
  examples(inputOutputMap: Record<string, any>): ProgramBuilder<T>;

  /** Specify the model to use for generation */
  using(model: ModelDefinition | string): ProgramBuilder<T>;

  /** Generate code with the given variables */
  generate(variables: ProgramVariables, options?: ProgramExecutionOptions): Promise<T>;

  /** 
   * Execute the generated function with the given variables
   * Returns a proxy that allows direct function calls
   */
  execute(variables?: ProgramVariables, options?: ProgramExecutionOptions): Promise<any>;

  /** Specify the return type of the program */
  returns<R>(): ProgramBuilder<R>;

  /** Save this program for later use (legacy method) */
  persist(id: string): ProgramBuilder<T>;
  
  /** 
   * Save this program with versioning
   * @param name Name to save the program under
   * @returns The program builder for chaining
   */
  save(name: string): Promise<ProgramBuilder<T>>;
}
