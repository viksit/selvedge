// src/lib/programs/v2/factory.ts
import { ProgramBuilderState } from './state';
import {
  withPrompt,
  withModel,
  withOptions,
  withPersistence,
  withExamples,
  withReturnsType
} from './builder';

export interface ProgramBuilder<Ret = any> {
  withPrompt(prompt: string): ProgramBuilder<Ret>;
  withModel(model: string): ProgramBuilder<Ret>;
  withOptions(options: Record<string, any>): ProgramBuilder<Ret>;
  withPersistence(persistence: { id: string; [key: string]: any }): ProgramBuilder<Ret>;
  withExamples(examples: Array<{ input: any; output: any }>): ProgramBuilder<Ret>;
  // Overloads for withReturnsType: type-only or with a value
  withReturnsType<NewRet>(): ProgramBuilder<NewRet>;
  withReturnsType<NewRet>(returnsType: NewRet): ProgramBuilder<NewRet>;
  readonly state: ProgramBuilderState<Ret>;
}

export function createProgramBuilder<Ret = any>(state: ProgramBuilderState<Ret> = {} as any): ProgramBuilder<Ret> {
  return {
    withPrompt(prompt) {
      return createProgramBuilder(withPrompt(state, prompt));
    },
    withModel(model) {
      return createProgramBuilder(withModel(state, model));
    },
    withOptions(options) {
      return createProgramBuilder(withOptions(state, options));
    },
    withPersistence(persistence) {
      return createProgramBuilder(withPersistence(state, persistence));
    },
    withExamples(examples) {
      return createProgramBuilder(withExamples(state, examples));
    },
    withReturnsType<NewRet>(returnsType?: NewRet) {
      // Note: returnsType can be omitted for type-only generic invocation
      return createProgramBuilder(withReturnsType(state, returnsType as any));
    },
    get state() {
      return state;
    }
  };
}
