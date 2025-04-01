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

// Export storage and manager
export { Store, store } from './lib/storage';
export { SelvedgeManager, manager } from './lib/manager';

// Export flow system
export { 
  flow, 
  flowWithContext, 
  validate, 
  filter, 
  parallel, 
  transform, 
  loadFlow 
} from './lib/flow';
