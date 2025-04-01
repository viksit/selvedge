/**
 * Type definitions for the prompt template system
 */
import { ModelDefinition } from '../types';

/**
 * Configuration options for prompt execution
 */
export interface PromptExecutionOptions {
  /** Model to use for this prompt execution */
  model?: ModelDefinition | string;
  
  /** Temperature setting (0.0-1.0) for controlling randomness */
  temperature?: number;
  
  /** Maximum number of tokens to generate */
  maxTokens?: number;
  
  /** Top-p sampling parameter */
  topP?: number;
  
  /** Frequency penalty */
  frequencyPenalty?: number;
  
  /** Presence penalty */
  presencePenalty?: number;
  
  /** Stop sequences */
  stop?: string[];
  
  /** System message to use with chat models */
  system?: string;
  
  /** Whether to stream the response */
  stream?: boolean;
  
  /** Additional model-specific parameters */
  [key: string]: any;
}

/**
 * Variables passed to prompt templates
 */
export type PromptVariables = Record<string, any>;

/**
 * Function type for rendering a variable in a template
 */
export type VariableRenderer = (value: any) => string;

/**
 * A variable definition in a prompt template
 */
export interface PromptVariable {
  /** Name of the variable */
  name: string;
  
  /** Custom renderer function for this variable */
  renderer?: VariableRenderer;
  
  /** Original function from template */
  originalFn?: Function;
  
  /** Default value to use if not provided */
  defaultValue?: any;
  
  /** Description of the variable */
  description?: string;
}

/**
 * A segment of a prompt template
 */
export type PromptSegment = string | PromptVariable;

/**
 * A compiled prompt template
 */
export interface PromptTemplate<T = any> {
  /** Array of text and variable segments */
  segments: PromptSegment[];
  
  /** List of variables used in this template */
  variables: PromptVariable[];
  
  /** Fill template with variables and return the rendered string */
  render: (variables: PromptVariables) => string;
  
  /** Execute this prompt with the given variables and return the response */
  execute: <R = T>(variables: PromptVariables, options?: PromptExecutionOptions) => Promise<R>;
  
  /** Get the expected return type of this prompt */
  returns: <R = T>() => PromptTemplate<R>;
  
  /** Format a response according to the expected return type */
  formatResponse: (response: string) => T;
  
  /** Add prefix text to the template */
  prefix: (text: string) => PromptTemplate<T>;
  
  /** Add suffix text to the template */
  suffix: (text: string) => PromptTemplate<T>;
  
  /** Clone this template */
  clone: () => PromptTemplate<T>;
  
  /** Add training examples to improve the prompt */
  train: (examples: Array<{ text: any, output: T }>) => PromptTemplate<T>;
  
  /** Specify the model to use for this prompt */
  using: (model: string | import('../types').ModelDefinition) => PromptTemplate<T>;
  
  /** 
   * Save this prompt template with versioning
   * @param name Name to save the prompt under
   * @returns The prompt template for chaining
   */
  save: (name: string) => Promise<PromptTemplate<T>>;
}

/**
 * Function to create type-safe prompt templates
 */
export interface PromptTemplateFactory {
  (strings: TemplateStringsArray, ...values: any[]): PromptTemplate;
}
