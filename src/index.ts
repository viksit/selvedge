/**
 * Selvedge – root export
 * Combines the runtime DSL (`prompt`, `program`, etc.)
 * with schema helpers (`string`, `number`, …).
 */

import { selvedge as coreSelvedge, version } from './lib/core';
import schemaHelpers from './lib/schema';

/* --------------------------------------------- */
/* merge helpers onto the core namespace         */
/* --------------------------------------------- */

Object.assign(coreSelvedge, schemaHelpers);

/* The merged object is now the public “s”        */
// export const s = coreSelvedge;
// export default s;

/* --------------------------------------------- */
/* re-exports (unchanged except removal of old   */
/* `default as s` line)                          */
/* --------------------------------------------- */

export { version };
export * from './lib/core';
export * from './lib/types';
export * from './lib/prompts';
export * from './lib/schema';
export * as optimize from './lib/optimize';
export * as metric   from './lib/optimize/metric';
export { ModelRegistry } from './lib/models';
export { Store, store } from './lib/storage';
export { SelvedgeManager, manager } from './lib/manager';
export {
  flow,
  flowWithContext,
  validate,
  filter,
  parallel,
  transform,
  loadFlow,
} from './lib/flow';
