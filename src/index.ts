/**
 * Selvedge - A TypeScript DSL for LLM programs
 * 
 * @packageDocumentation
 */

// Export the main selvedge instance and version
export { selvedge, version } from './lib/core';

// Export necessary types (can be adjusted based on final public API)
export type { ModelDefinition, ModelProvider, SelvedgeInstance } from './lib/types';
export type { Store } from './lib/storage';
// Potentially export V2 types if needed externally?
// export type { CallableProgramBuilder } from './lib/programs/v2/proxy'; 
// export type { ProgramBuilderState } from './lib/programs/v2/state';
// export type { ExecuteOptions } from './lib/programs/v2/execute';
