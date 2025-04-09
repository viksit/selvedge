/**
 * Flow system for Selvedge
 * 
 * Provides a simple yet powerful way to compose AI operations into pipelines
 */
import { store } from '../storage';
import { FlowPipeline, FlowStep, FlowContext, FlowContextStep, FlowContextPipeline, FlowStepTypes } from './types';

/**
 * Create a flow pipeline from a series of steps
 * @param steps Steps to include in the pipeline
 * @returns A flow pipeline
 */
export function flow<TInput, TOutput>(
  ...steps: Array<FlowStep<any, any>>
): FlowPipeline<TInput, TOutput> {
  // Create the execution function
  const execute = async (input: TInput): Promise<TOutput> => {
    let current: any = input;

    for (const step of steps) {
      try {
        current = await step(current);
      } catch (error) {
        // Enhance error with step information and input context
        const enhancedError = error as Error;
        const inputType = typeof current;
        const inputPreview = JSON.stringify(current).substring(0, 100) + 
                           (JSON.stringify(current).length > 100 ? '...' : '');
        
        enhancedError.message = `Error in step ${step.name || 'anonymous'}: ${enhancedError.message}\n` +
          `Input was type: ${inputType}\n` +
          `Input preview: ${inputPreview}\n` +
          `Tip: If using prompt templates in flows, inputs must be objects with named properties.`;
        
        throw enhancedError;
      }
    }

    return current as TOutput;
  };

  // Add metadata
  const metadata: Record<string, any> = {};

  // Create the pipeline object
  const pipeline = execute as FlowPipeline<TInput, TOutput>;

  // Add the steps
  Object.defineProperty(pipeline, 'steps', {
    value: steps,
    writable: false,
    enumerable: true
  });

  // Add the save method
  pipeline.save = async (name: string): Promise<string> => {
    // Serialize the steps (basic implementation)
    const serializedSteps = steps.map(step => ({
      type: step.type || FlowStepTypes.FUNCTION,
      name: step.name || 'anonymous',
      metadata: step.metadata || {},
      // For simple functions, we can store the string representation
      // This is limited but works for demonstration purposes
      code: step.toString()
    }));

    // For now, we'll store flows in the "program" type
    // In a real implementation, we would extend the Store class to support 'flow' type
    return store.save('program', `flow-${name}`, {
      steps: serializedSteps,
      metadata,
      _flowData: true // Mark this as flow data for identification
    });
  };

  // Add metadata methods
  pipeline.meta = (key: string, value: any): FlowPipeline<TInput, TOutput> => {
    metadata[key] = value;
    return pipeline;
  };

  pipeline.describe = (description: string): FlowPipeline<TInput, TOutput> => {
    metadata.description = description;
    return pipeline;
  };

  pipeline.tag = (...tags: string[]): FlowPipeline<TInput, TOutput> => {
    metadata.tags = [...(metadata.tags || []), ...tags];
    return pipeline;
  };

  return pipeline;
}

/**
 * Create a flow pipeline that maintains context between steps
 * @param steps Steps to include in the pipeline
 * @returns A flow pipeline with context
 */
export function flowWithContext<TInput, TOutput>(
  ...steps: Array<FlowContextStep<any, any>>
): FlowContextPipeline<TInput, TOutput> {
  // Create the execution function
  const execute = async (input: TInput): Promise<TOutput> => {
    // Initialize context
    const context: FlowContext = {
      input,
      startTime: Date.now(),
      metadata: {}
    };

    let current: any = input;

    for (const step of steps) {
      try {
        current = await step(current, context);
      } catch (error) {
        // Enhance error with step information
        const enhancedError = error as Error;
        enhancedError.message = `Error in step ${step.name || 'anonymous'}: ${enhancedError.message}`;
        throw enhancedError;
      }
    }

    return current as TOutput;
  };

  // Add metadata
  const metadata: Record<string, any> = {};

  // Create the pipeline object
  const pipeline = execute as FlowContextPipeline<TInput, TOutput>;

  // Add the steps
  Object.defineProperty(pipeline, 'steps', {
    value: steps,
    writable: false,
    enumerable: true
  });

  // Add the save method
  pipeline.save = async (name: string): Promise<string> => {
    // Serialize the steps (basic implementation)
    const serializedSteps = steps.map(step => ({
      type: step.type || FlowStepTypes.FUNCTION,
      name: step.name || 'anonymous',
      metadata: step.metadata || {},
      // For simple functions, we can store the string representation
      code: step.toString()
    }));

    // For now, we'll store flows in the "program" type
    return store.save('program', `flow-context-${name}`, {
      steps: serializedSteps,
      metadata,
      hasContext: true,
      _flowData: true // Mark this as flow data for identification
    });
  };

  // Add metadata methods
  pipeline.meta = (key: string, value: any): FlowContextPipeline<TInput, TOutput> => {
    metadata[key] = value;
    return pipeline;
  };

  pipeline.describe = (description: string): FlowContextPipeline<TInput, TOutput> => {
    metadata.description = description;
    return pipeline;
  };

  pipeline.tag = (...tags: string[]): FlowContextPipeline<TInput, TOutput> => {
    metadata.tags = [...(metadata.tags || []), ...tags];
    return pipeline;
  };

  return pipeline;
}

/**
 * Create a validation step
 * @param validator Function to validate the input
 * @returns A flow step that validates input
 */
export function validate<T>(validator: (input: T) => T | Promise<T>): FlowStep<T, T> {
  const step = async (input: T): Promise<T> => {
    return await validator(input);
  };

  // Use Object.defineProperty to set readonly properties
  Object.defineProperty(step, 'type', {
    value: FlowStepTypes.VALIDATE,
    writable: false,
    enumerable: true
  });

  Object.defineProperty(step, 'name', {
    value: 'validate',
    writable: false,
    enumerable: true
  });

  return step;
}

/**
 * Create a filter step
 * @param predicate Function to determine if input should be filtered
 * @returns A flow step that filters input
 */
export function filter<T>(predicate: (input: T) => boolean | Promise<boolean>): FlowStep<T, T> {
  const step = async (input: T): Promise<T> => {
    if (!await predicate(input)) {
      throw new Error('Input filtered out');
    }
    return input;
  };

  // Use Object.defineProperty to set readonly properties
  Object.defineProperty(step, 'type', {
    value: FlowStepTypes.FILTER,
    writable: false,
    enumerable: true
  });

  Object.defineProperty(step, 'name', {
    value: 'filter',
    writable: false,
    enumerable: true
  });

  return step;
}

/**
 * Create a parallel execution step
 * @param operations Map of operations to execute in parallel
 * @returns A flow step that executes operations in parallel
 */
export function parallel<TInput, TOutput extends Record<string, any>>(
  operations: Record<string, (input: TInput) => any>
): FlowStep<TInput, TOutput> {
  const step = async (input: TInput): Promise<TOutput> => {
    const results: Record<string, any> = {};
    const promises = Object.entries(operations).map(async ([key, operation]) => {
      results[key] = await operation(input);
    });

    await Promise.all(promises);
    return results as TOutput;
  };

  // Use Object.defineProperty to set readonly properties
  Object.defineProperty(step, 'type', {
    value: FlowStepTypes.PARALLEL,
    writable: false,
    enumerable: true
  });

  Object.defineProperty(step, 'name', {
    value: 'parallel',
    writable: false,
    enumerable: true
  });

  return step;
}

/**
 * Create a transformation step
 * @param transformer Function to transform the input
 * @returns A flow step that transforms input
 */
export function transform<TInput, TOutput>(
  transformer: (input: TInput) => TOutput | Promise<TOutput>
): FlowStep<TInput, TOutput> {
  const step = async (input: TInput): Promise<TOutput> => {
    return await transformer(input);
  };

  // Use Object.defineProperty to set readonly properties
  Object.defineProperty(step, 'type', {
    value: FlowStepTypes.TRANSFORM,
    writable: false,
    enumerable: true
  });

  Object.defineProperty(step, 'name', {
    value: 'transform',
    writable: false,
    enumerable: true
  });

  return step;
}

/**
 * Load a flow from storage
 * @param name Name of the flow to load
 * @param version Optional version to load
 * @returns The loaded flow pipeline
 */
export async function loadFlow<TInput, TOutput>(
  name: string,
  version?: string
): Promise<FlowPipeline<TInput, TOutput>> {
  // Load the flow data - for now we're using the program type with a prefix
  // We're not using the loaded data yet in this simplified implementation
  try {
    await store.load('program', `flow-${name}`, version);
  } catch (error) {
    console.log(`Note: Could not load flow "${name}". Using placeholder implementation.`);
  }

  // This is a simplified implementation
  // In a real implementation, we would need to handle different step types
  // and properly reconstruct the functions

  // For demonstration purposes, we'll create a simple pass-through flow
  return flow<TInput, TOutput>(
    input => {
      console.log(`Executing loaded flow: ${name}`);
      console.log(`This is a placeholder - actual flow reconstruction would be more complex`);
      return input as any;
    }
  );
}
