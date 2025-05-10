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
export interface ProgramBuilder<TOut = any, TIn = ProgramVariables> {
  /** Call signature - makes the program directly callable */
  (...args: any[]): Promise<TOut>;

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

  /** Add examples to the program builder */
  withExamples(examples: ProgramExample[]): ProgramBuilder<TOut, TIn>;

  /** Add examples using a simpler input-output format */
  examples(inputOutputMap: Record<string, any>): ProgramBuilder<TOut, TIn>;

  /** Specify the model to use for generation */
  using(model: ModelDefinition | string): ProgramBuilder<TOut, TIn>;

  /** Generate code with the given variables */
  generate(variables: ProgramVariables, options?: ProgramExecutionOptions): Promise<TOut>;

  /** Build and get executable function */
  build(variables?: ProgramVariables, options?: ProgramExecutionOptions): Promise<any>;

  /** Attach a Zod schema to validate program inputs */
  inputs<I extends import('zod').ZodTypeAny>(schema: I): ProgramBuilder<TOut, import('zod').infer<I>>;

  /** Attach a Zod schema to validate program outputs */
  outputs<O extends import('zod').ZodTypeAny>(schema: O): ProgramBuilder<import('zod').infer<O>, TIn>;

  /** Set execution options for this program */
  options(opts: ProgramExecutionOptions): ProgramBuilder<TOut, TIn>;

  /** Save this program for later use */
  persist(id: string): ProgramBuilder<TOut, TIn>;

  /** 
   * Save this program with versioning
   * @param name Name to save the program under
   * @returns The program builder for chaining
   */
  save(name: string): Promise<ProgramBuilder<TOut, TIn>>;

  /** DEPRECATED: use .outputs() instead */
  returns<R>(): ProgramBuilder<R, TIn>;
}
