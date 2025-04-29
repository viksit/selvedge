// prompts/types.ts
import { ModelDefinition } from '../types';

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

export interface PromptTemplate<T = any> {
  (v?: PromptVariables, o?: PromptExecutionOptions): Promise<T>;
  segments: PromptSegment[];
  variables: PromptVariable[];
  persistId?: string;
  needsSave?: boolean;
  render: (v: PromptVariables) => string;
  execute: <R = T>(v: PromptVariables, o?: PromptExecutionOptions) => Promise<R>;
  returns: <R = T>() => PromptTemplate<R>;
  formatResponse: (r: string) => T;
  prefix: (t: string) => PromptTemplate<T>;
  suffix: (t: string) => PromptTemplate<T>;
  clone: () => PromptTemplate<T>;
  train: (e: { text: any; output: T }[]) => PromptTemplate<T>;
  using: (m: string | ModelDefinition) => PromptTemplate<T>;
  options: (o: PromptExecutionOptions) => PromptTemplate<T>;
  persist: (id: string) => PromptTemplate<T>;
  save: (n: string) => Promise<PromptTemplate<T>>;
}

export interface PromptTemplateFactory {
  (s: TemplateStringsArray, ...v: any[]): PromptTemplate;
}