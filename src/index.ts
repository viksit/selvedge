/**
 * Selvedge - A TypeScript DSL for LLM programs
 * 
 * @packageDocumentation
 */

export { selvedge, version } from './lib/core';
export * from './lib/types';
export * from './lib/prompts';

// Re-export model-related types
export { ModelRegistry } from './lib/models';
