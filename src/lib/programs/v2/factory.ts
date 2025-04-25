// src/lib/programs/v2/factory.ts
import { ProgramBuilderState } from './state';
import {
  prompt,
  model,
  options,
  persist,
  examples,
  returns,
  raw
} from './builder';

export interface ProgramBuilder<Ret = any> {
  prompt(prompt: string): ProgramBuilder<Ret>;
  model(model: string): ProgramBuilder<Ret>;
  options(options: Record<string, any>): ProgramBuilder<Ret>;
  persist(persistence: { id: string;[key: string]: any }): ProgramBuilder<Ret>;
  examples(examples: Array<{ input: any; output: any }>): ProgramBuilder<Ret>;
  // Overloads for withReturnsType: type-only or with a value
  returns<NewRet>(): ProgramBuilder<NewRet>;
  returns<NewRet>(returnsType: NewRet): ProgramBuilder<NewRet>;
  /** Disable automatic result unwrapping; return full VM context */
  raw(): ProgramBuilder<Ret>;
  readonly state: ProgramBuilderState<Ret>;
}

export function createProgramBuilder<Ret = any>(state: ProgramBuilderState<Ret> = {} as any): ProgramBuilder<Ret> {
  return {
    prompt(promptText) {
      return createProgramBuilder(prompt(state, promptText));
    },
    model(modelName) {
      return createProgramBuilder(model(state, modelName));
    },
    options(optionsObj) {
      return createProgramBuilder(options(state, optionsObj));
    },
    persist(persistenceObj) {
      return createProgramBuilder(persist(state, persistenceObj));
    },
    examples(examplesArr) {
      return createProgramBuilder(examples(state, examplesArr));
    },
    returns<NewRet>(returnsType?: NewRet) {
      // Note: returnsType can be omitted for type-only generic invocation
      return createProgramBuilder(returns(state, returnsType as any));
    },
    raw() {
      return createProgramBuilder(raw(state));
    },
    get state() {
      return state;
    }
  };
}
