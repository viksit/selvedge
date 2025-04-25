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

export interface ProgramBuilder {
  withPrompt(prompt: string): ProgramBuilder;
  withModel(model: string): ProgramBuilder;
  withOptions(options: Record<string, any>): ProgramBuilder;
  withPersistence(persistence: { id: string; [key: string]: any }): ProgramBuilder;
  withExamples(examples: Array<{ input: any; output: any }>): ProgramBuilder;
  withReturnsType(returnsType: any): ProgramBuilder;
  readonly state: ProgramBuilderState;
}

export function createProgramBuilder(state: ProgramBuilderState = {}): ProgramBuilder {
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
    withReturnsType(returnsType) {
      return createProgramBuilder(withReturnsType(state, returnsType));
    },
    get state() {
      return state;
    }
  };
}
