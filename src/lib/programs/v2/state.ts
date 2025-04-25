// src/lib/programs/v2/state.ts

export interface ProgramBuilderState<Ret = any> {
  prompt?: string;
  model?: string;
  options?: Record<string, any>;
  persistId?: string;
  examples?: Array<{ input: any; output: any }>;
  returnsType?: Ret;
  /** Generated code extracted from LLM response */
  generatedCode?: string;
  /** Flag to control unwrapping of execution result; default true (return only result) */
  unwrapResult?: boolean;
}

/**
 * Creates a new ProgramBuilderState.
 */
export function createState<Ret = any>(
  initial?: Partial<ProgramBuilderState<Ret>>
): ProgramBuilderState<Ret> {
  return { ...(initial as object) } as ProgramBuilderState<Ret>;
}

/**
 * Returns a new ProgramBuilderState with updated fields (immutable).
 */
export function updateState<Ret = any>(
  state: ProgramBuilderState<Ret>,
  updates: Partial<ProgramBuilderState<Ret>>
): ProgramBuilderState<Ret> {
  return { ...state, ...(updates as object) } as ProgramBuilderState<Ret>;
}
