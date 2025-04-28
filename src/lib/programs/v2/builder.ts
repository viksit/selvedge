// src/lib/programs/v2/builder.ts
import { ProgramBuilderState } from './state';
import { z } from 'zod';

export function prompt<Ret>(state: ProgramBuilderState<Ret>, prompt: string): ProgramBuilderState<Ret> {
  return { ...state, prompt };
}

export function model<Ret>(state: ProgramBuilderState<Ret>, model: string): ProgramBuilderState<Ret> {
  return { ...state, model };
}

export function options<Ret>(state: ProgramBuilderState<Ret>, options: Record<string, any>): ProgramBuilderState<Ret> {
  return { ...state, options: { ...state.options, ...options } };
}

// Update persist to accept a string ID directly
export function persist<Ret>(state: ProgramBuilderState<Ret>, id: string): ProgramBuilderState<Ret> {
  // Set the persistId directly, remove needsSave flag handling
  return { ...state, persistId: id };
}

export function examples<Ret>(state: ProgramBuilderState<Ret>, examples: Array<{ input: any; output: any }>): ProgramBuilderState<Ret> {
  return { ...state, examples };
}

// Overload: allow type-only invocation or with a value
export function returns<Schema extends z.ZodTypeAny>(
  state: ProgramBuilderState<any>,
  schema: Schema
): ProgramBuilderState<z.infer<Schema>> {
  // Store the provided Zod schema
  return {
    ...state,
    returnsSchema: schema // Store the actual schema
  } as ProgramBuilderState<z.infer<Schema>>; // Cast state to the inferred type
}

/**
 * Disable automatic result unwrapping; return full context on execution
 */
export function raw<Ret>(state: ProgramBuilderState<Ret>): ProgramBuilderState<Ret> {
  return { ...state, unwrapResult: false } as ProgramBuilderState<Ret>;
}
