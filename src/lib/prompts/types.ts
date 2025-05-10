// prompts/types.ts
import { ModelDefinition } from '../types';
import * as z from 'zod';

export interface PromptExecutionOptions {
  model?: ModelDefinition | string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  system?: string;
  stream?: boolean;
  forceRegenerate?: boolean;
  [k: string]: any;
}

export type PromptVariables = Record<string, any>;
export type VariableRenderer = (v: any) => string;

export interface PromptVariable {
  name: string;
  renderer?: VariableRenderer;
  originalFn?: Function;
  defaultValue?: any;
  description?: string;
}

export type PromptSegment = string | PromptVariable;

/**
 * A prompt template is a function that takes an input and returns a string.
 * It can also take an optional execution options object.
 * 
 * The template is a composition of segments and variables.
 * Segments are either static text or variables.
 * Variables are placeholders for input values.
 * 
 * The template can be executed with an input and an optional execution options object.
 * The input is a record of variable names and values.
 * The execution options are a record of execution options for the model.
 * 
 * The template can be rendered to a string with the render method.
 * The template can be executed with an input and an optional execution options object.
 */

export interface PromptTemplate<TOutput = any, TInput = PromptVariables> {
  (v?: TInput, o?: PromptExecutionOptions): Promise<TOutput>;
  segments: PromptSegment[];
  variables: PromptVariable[];
  persistId?: string;
  needsSave?: boolean;
  render: (v: TInput) => string; 
  execute: <R = TOutput>(v: TInput, o?: PromptExecutionOptions) => Promise<R>;

  inputs<InputSchema extends z.ZodObject<any, any, any>>(schema: InputSchema): PromptTemplate<TOutput, z.infer<InputSchema>>; 
  outputs<OutputSchema extends z.ZodObject<any, any, any>>(schema: OutputSchema): PromptTemplate<z.infer<OutputSchema>, TInput>; 
  
  formatResponse: (r: string) => TOutput; 
  prefix: (t: string) => PromptTemplate<TOutput>;
  suffix: (t: string) => PromptTemplate<TOutput>;
  clone: () => PromptTemplate<TOutput, TInput>; 
  using: (m: string | ModelDefinition) => PromptTemplate<TOutput, TInput>; 
  options: (o: PromptExecutionOptions) => PromptTemplate<TOutput, TInput>; 
  persist: (id: string) => PromptTemplate<TOutput, TInput>; 
  save: (n: string) => Promise<PromptTemplate<TOutput, TInput>>; 
}

export interface PromptTemplateFactory {
  (s: TemplateStringsArray, ...v: any[]): PromptTemplate;
}