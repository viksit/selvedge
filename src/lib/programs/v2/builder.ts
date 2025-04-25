// src/lib/programs/v2/builder.ts
import { ProgramBuilderState } from './state';

export function withPrompt(state: ProgramBuilderState, prompt: string): ProgramBuilderState {
  return { ...state, prompt };
}

export function withModel(state: ProgramBuilderState, model: string): ProgramBuilderState {
  return { ...state, model };
}

export function withOptions(state: ProgramBuilderState, options: Record<string, any>): ProgramBuilderState {
  return { ...state, options: { ...state.options, ...options } };
}

export function withPersistence(state: ProgramBuilderState, persistence: { id: string; [key: string]: any }): ProgramBuilderState {
  return { ...state, persistence: { ...state.persistence, ...persistence } };
}

export function withExamples(state: ProgramBuilderState, examples: Array<{ input: any; output: any }>): ProgramBuilderState {
  return { ...state, examples };
}

export function withReturnsType(state: ProgramBuilderState, returnsType: any): ProgramBuilderState {
  return { ...state, returnsType };
}
