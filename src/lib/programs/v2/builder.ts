// src/lib/programs/v2/builder.ts
import { ProgramBuilderState } from './state';

export function prompt<Ret>(state: ProgramBuilderState<Ret>, prompt: string): ProgramBuilderState<Ret> {
  return { ...state, prompt };
}

export function model<Ret>(state: ProgramBuilderState<Ret>, model: string): ProgramBuilderState<Ret> {
  return { ...state, model };
}

export function options<Ret>(state: ProgramBuilderState<Ret>, options: Record<string, any>): ProgramBuilderState<Ret> {
  return { ...state, options: { ...state.options, ...options } };
}

export function persist<Ret>(state: ProgramBuilderState<Ret>, persistence: { id: string;[key: string]: any }): ProgramBuilderState<Ret> {
  return { ...state, persistence: { ...state.persistence, ...persistence } };
}

export function examples<Ret>(state: ProgramBuilderState<Ret>, examples: Array<{ input: any; output: any }>): ProgramBuilderState<Ret> {
  return { ...state, examples };
}

// Overload: allow type-only invocation or with a value
export function returns<NewRet>(state: ProgramBuilderState<any>, returnsType: NewRet): ProgramBuilderState<NewRet>;
export function returns<NewRet>(state: ProgramBuilderState<any>, returnsType?: NewRet): ProgramBuilderState<NewRet> {
  return { ...state, returnsType: returnsType as NewRet } as ProgramBuilderState<NewRet>;
}
