/**
 * BuilderBase - Shared foundation for prompt and program builders
 * 
 * This class provides common functionality for both prompt templates and program builders,
 * extracting shared patterns to reduce duplication and ensure consistent behavior.
 */

import { ModelDefinition } from '../types';
import { debug } from '../utils/debug';

/**
 * Common execution options interface shared by both prompt and program systems
 */
export interface BaseExecutionOptions {
  model?: ModelDefinition | string;
  temperature?: number;
  maxTokens?: number;
  forceRegenerate?: boolean;
  [key: string]: any;
}

/**
 * Base builder class that provides common functionality for both
 * prompt templates and program builders
 */
export class BuilderBase<T> {
  /**
   * ID used for persistence, if this item has been persisted
   */
  persistId?: string;

  /**
   * Flag to track if the item needs to be saved
   */
  needsSave: boolean = false;

  /**
   * Storage for execution options
   */
  _executionOptions: BaseExecutionOptions = {};

  /**
   * Set execution options for this builder
   * @param opts The options to set
   */
  options(opts: BaseExecutionOptions): any {
    // Update the execution options on this instance
    this._executionOptions = { ...(this._executionOptions || {}), ...opts };
    
    // Return this instance for chaining
    return this;
  }

  /**
   * Mark this item for persistence with the given ID.
   * The item will be saved to storage during execution if it has been modified.
   * This method only sets persistence flags and does not perform actual storage operations.
   * 
   * @param id The persistence ID for this item
   * @returns This instance for method chaining
   */
  persist(id: string): any {
    debug('persistence', `Setting persistence properties for item "${id}"`);
    
    // Set properties directly on this object
    this.persistId = id;
    this.needsSave = true;
    
    debug('persistence', `New state after persist: persistId=${this.persistId}, needsSave=${this.needsSave}`);
    debug('persistence', `Note: persist() only sets flags, actual saving happens during execute() or save()`);
    
    // Return this instance for chaining
    return this;
  }
}