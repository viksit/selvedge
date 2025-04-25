// src/lib/programs/v2/builder.ts
import { ProgramBuilderState } from './state';

export function withPrompt<Ret>(state: ProgramBuilderState<Ret>, prompt: string): ProgramBuilderState<Ret> {
  return { ...state, prompt };
}

export function withModel<Ret>(state: ProgramBuilderState<Ret>, model: string): ProgramBuilderState<Ret> {
  return { ...state, model };
}

export function withOptions<Ret>(state: ProgramBuilderState<Ret>, options: Record<string, any>): ProgramBuilderState<Ret> {
  return { ...state, options: { ...state.options, ...options } };
}

export function withPersistence<Ret>(state: ProgramBuilderState<Ret>, persistence: { id: string; [key: string]: any }): ProgramBuilderState<Ret> {
  return { ...state, persistence: { ...state.persistence, ...persistence } };
}

export function withExamples<Ret>(state: ProgramBuilderState<Ret>, examples: Array<{ input: any; output: any }>): ProgramBuilderState<Ret> {
  return { ...state, examples };
}

// Overload: allow type-only invocation or with a value
export function withReturnsType<NewRet>(state: ProgramBuilderState<any>): ProgramBuilderState<NewRet>;
export function withReturnsType<NewRet>(state: ProgramBuilderState<any>, returnsType: NewRet): ProgramBuilderState<NewRet>;
export function withReturnsType<NewRet>(state: ProgramBuilderState<any>, returnsType?: NewRet): ProgramBuilderState<NewRet> {
  return { ...state, returnsType: returnsType as NewRet } as ProgramBuilderState<NewRet>;
}
