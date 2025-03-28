/**
 * Selvedge - Weaving prompts and code into structured, resilient patterns
 * 
 * @packageDocumentation
 */

export * from './lib/core';
export * from './lib/models';
export * from './lib/types';

// Re-export the selvedge instance as default
import { selvedge } from './lib/core';
export default selvedge;
