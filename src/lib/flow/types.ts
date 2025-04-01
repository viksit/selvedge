/**
 * Type definitions for the Selvedge flow system
 */

/**
 * Valid flow step types
 */
export const FlowStepTypes = {
  FUNCTION: 'function',
  PARALLEL: 'parallel',
  FILTER: 'filter',
  VALIDATE: 'validate',
  TRANSFORM: 'transform',
  REFERENCE: 'reference',
} as const;

export type FlowStepType = typeof FlowStepTypes[keyof typeof FlowStepTypes];

/**
 * A flow pipeline that can be executed with an input to produce an output
 */
export interface FlowPipeline<TInput, TOutput> {
  /**
   * Execute the flow pipeline with the given input
   */
  (input: TInput): Promise<TOutput>;
  
  /**
   * Save the flow pipeline with a name
   * @param name Name to save the flow as
   * @returns Promise resolving to the version ID
   */
  save(name: string): Promise<string>;
  
  /**
   * Get the steps in this pipeline
   */
  readonly steps: Array<FlowStep<any, any>>;
  
  /**
   * Add metadata to this flow
   * @param key Metadata key
   * @param value Metadata value
   */
  meta(key: string, value: any): FlowPipeline<TInput, TOutput>;
  
  /**
   * Add a description to this flow
   * @param description Description text
   */
  describe(description: string): FlowPipeline<TInput, TOutput>;
  
  /**
   * Add tags to this flow
   * @param tags Tags to add
   */
  tag(...tags: string[]): FlowPipeline<TInput, TOutput>;
}

/**
 * A step in a flow pipeline
 */
export interface FlowStep<TInput, TOutput> {
  /**
   * Execute this step with the given input
   */
  (input: TInput): Promise<TOutput> | TOutput;
  
  /**
   * Type of the step (for serialization)
   */
  readonly type?: FlowStepType;
  
  /**
   * Name of the step (for debugging and serialization)
   */
  readonly name?: string;
  
  /**
   * Metadata for this step
   */
  readonly metadata?: Record<string, any>;
}

/**
 * Options for creating a flow
 */
export interface FlowOptions {
  /**
   * Name of the flow
   */
  name?: string;
  
  /**
   * Description of the flow
   */
  description?: string;
  
  /**
   * Tags for the flow
   */
  tags?: string[];
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Context for a flow with context
 */
export interface FlowContext extends Record<string, any> {
  /**
   * Original input to the flow
   */
  input?: any;
  
  /**
   * Start time of the flow execution
   */
  startTime?: number;
  
  /**
   * Metadata for the flow execution
   */
  metadata?: Record<string, any>;
}

/**
 * A step in a flow with context
 */
export interface FlowContextStep<TInput, TOutput> {
  /**
   * Execute this step with the given input and context
   */
  (input: TInput, context: FlowContext): Promise<TOutput> | TOutput;
  
  /**
   * Type of the step (for serialization)
   */
  readonly type?: FlowStepType;
  
  /**
   * Name of the step (for debugging and serialization)
   */
  readonly name?: string;
  
  /**
   * Metadata for this step
   */
  readonly metadata?: Record<string, any>;
}

/**
 * A flow pipeline that maintains context between steps
 */
export interface FlowContextPipeline<TInput, TOutput> {
  /**
   * Execute the flow pipeline with the given input
   */
  (input: TInput): Promise<TOutput>;
  
  /**
   * Save the flow pipeline with a name
   * @param name Name to save the flow as
   * @returns Promise resolving to the version ID
   */
  save(name: string): Promise<string>;
  
  /**
   * Get the steps in this pipeline
   */
  readonly steps: Array<FlowContextStep<any, any>>;
  
  /**
   * Add metadata to this flow
   * @param key Metadata key
   * @param value Metadata value
   */
  meta(key: string, value: any): FlowContextPipeline<TInput, TOutput>;
  
  /**
   * Add a description to this flow
   * @param description Description text
   */
  describe(description: string): FlowContextPipeline<TInput, TOutput>;
  
  /**
   * Add tags to this flow
   * @param tags Tags to add
   */
  tag(...tags: string[]): FlowContextPipeline<TInput, TOutput>;
}
