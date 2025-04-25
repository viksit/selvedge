// src/lib/programs/v2/state.ts

export interface ProgramBuilderState {
  prompt?: string;
  model?: string;
  options?: Record<string, any>;
  persistence?: {
    id: string;
    [key: string]: any;
  };
  examples?: Array<{ input: any; output: any }>;
  returnsType?: any;
}

/**
 * Creates a new ProgramBuilderState.
 */
export function createState(initial?: Partial<ProgramBuilderState>): ProgramBuilderState {
  return { ...initial };
}

/**
 * Returns a new ProgramBuilderState with updated fields (immutable).
 */
export function updateState(
  state: ProgramBuilderState,
  updates: Partial<ProgramBuilderState>
): ProgramBuilderState {
  return { ...state, ...updates };
}
