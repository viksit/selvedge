/**
 * Tests for the flow system
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { flow, flowWithContext, validate, filter, parallel, transform, loadFlow } from '../../src/lib/flow';
import { FlowStepTypes } from '../../src/lib/flow/types';
import { store } from '../../src/lib/storage';

// Mock the storage module
const originalStoreSave = store.save;
const originalStoreLoad = store.load;

describe('Flow System', () => {
  beforeEach(() => {
    // Mock store.save to return a test version ID
    store.save = async () => 'test-version-id';
    
    // Mock store.load to return test data
    store.load = async () => ({
      steps: [
        { type: 'function', name: 'testStep', code: 'function(x) { return x; }' }
      ],
      metadata: { description: 'Test flow' },
      _flowData: true
    });
  });
  
  afterEach(() => {
    // Restore original methods
    store.save = originalStoreSave;
    store.load = originalStoreLoad;
  });

  describe('Basic Flow', () => {
    it('should execute a sequence of steps', async () => {
      // Create a simple flow
      const testFlow = flow<number, string>(
        (num) => num * 2,
        (num) => num + 5,
        (num) => `Result: ${num}`
      );

      // Execute the flow
      const result = await testFlow(10);

      // Check the result
      expect(result).toBe('Result: 25');
    });

    it('should handle async steps', async () => {
      // Create a flow with async steps
      const testFlow = flow<number, string>(
        async (num) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return num * 2;
        },
        async (num) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return num + 5;
        },
        (num) => `Result: ${num}`
      );

      // Execute the flow
      const result = await testFlow(10);

      // Check the result
      expect(result).toBe('Result: 25');
    });

    it('should handle errors in steps', async () => {
      // Create a flow with an error
      const testFlow = flow<number, string>(
        (num) => num * 2,
        () => { throw new Error('Test error'); },
        (num) => `Result: ${num}`
      );

      // Execute the flow and expect an error
      try {
        await testFlow(10);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect((error as Error).message).toContain('Error in step anonymous: Test error');
      }
    });

    it('should save flow metadata', async () => {
      // Create a flow with metadata
      const testFlow = flow<number, string>(
        (num) => num * 2,
        (num) => `Result: ${num}`
      )
        .describe('Test flow description')
        .tag('test', 'example')
        .meta('version', '1.0.0');

      // Save the flow
      const versionId = await testFlow.save('test-flow');

      // Check the returned version ID
      expect(versionId).toBe('test-version-id');
    });
  });

  describe('Flow with Context', () => {
    it('should maintain context between steps', async () => {
      // Create a flow with context
      const testFlow = flowWithContext<number, { result: string, metadata: any }>(
        (num, ctx) => {
          ctx.startTime = 1000; // Override startTime for testing
          if (!ctx.metadata) ctx.metadata = {};
          ctx.metadata.source = 'test';
          return num * 2;
        },
        (num, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          ctx.metadata.processed = true;
          return num + 5;
        },
        (num, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          if (ctx.startTime === undefined) ctx.startTime = 0;
          
          return {
            result: `Result: ${num}`,
            metadata: {
              ...ctx.metadata,
              executionTime: Date.now() - ctx.startTime
            }
          };
        }
      );

      // Execute the flow
      const result = await testFlow(10);

      // Check the result
      expect(result.result).toBe('Result: 25');
      expect(result.metadata.source).toBe('test');
      expect(result.metadata.processed).toBe(true);
      expect(typeof result.metadata.executionTime).toBe('number');
    });

    it('should handle errors in context steps', async () => {
      // Create a flow with an error
      const testFlow = flowWithContext<number, string>(
        (num, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          ctx.metadata.step1 = true;
          return num * 2;
        },
        (_num, _ctx) => {
          throw new Error('Context test error');
        },
        (num, _ctx) => `Result: ${num}`
      );

      // Execute the flow and expect an error
      try {
        await testFlow(10);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect((error as Error).message).toContain('Error in step anonymous: Context test error');
      }
    });

    it('should save flow with context', async () => {
      // Create a flow with context
      const testFlow = flowWithContext<number, string>(
        (num, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          ctx.metadata.step1 = true;
          return num * 2;
        },
        (num, _ctx) => `Result: ${num}`
      )
        .describe('Test context flow')
        .tag('context', 'test');

      // Save the flow
      const versionId = await testFlow.save('test-context-flow');

      // Check the returned version ID
      expect(versionId).toBe('test-version-id');
    });
  });

  describe('Flow Utility Functions', () => {
    describe('validate', () => {
      it('should validate input and pass it through if valid', async () => {
        // Create a validation step
        const validateStep = validate<number>((num) => {
          if (num > 0) return num;
          throw new Error('Number must be positive');
        });

        // Check the step type and name
        expect(validateStep.type).toBe(FlowStepTypes.VALIDATE);
        expect(validateStep.name).toBe('validate');

        // Test with valid input
        expect(await validateStep(10)).toBe(10);

        // Test with invalid input
        try {
          await validateStep(-5);
          expect(false).toBe(true); // Should not reach here
        } catch (error) {
          expect((error as Error).message).toBe('Number must be positive');
        }
      });
    });

    describe('filter', () => {
      it('should filter input based on a predicate', async () => {
        // Create a filter step
        const filterStep = filter<number>((num) => num > 10);

        // Check the step type and name
        expect(filterStep.type).toBe(FlowStepTypes.FILTER);
        expect(filterStep.name).toBe('filter');

        // Test with passing input
        expect(await filterStep(20)).toBe(20);

        // Test with filtered input
        try {
          await filterStep(5);
          expect(false).toBe(true); // Should not reach here
        } catch (error) {
          expect((error as Error).message).toBe('Input filtered out');
        }
      });
    });

    describe('parallel', () => {
      it('should execute operations in parallel', async () => {
        // Create a parallel step
        const parallelStep = parallel<number, { doubled: number, squared: number }>({
          doubled: (num) => num * 2,
          squared: (num) => num * num
        });

        // Check the step type and name
        expect(parallelStep.type).toBe(FlowStepTypes.PARALLEL);
        expect(parallelStep.name).toBe('parallel');

        // Test execution
        const result = await parallelStep(5);
        expect(result).toEqual({ doubled: 10, squared: 25 });
      });

      it('should handle async operations', async () => {
        // Create a parallel step with async operations
        const parallelStep = parallel<number, { doubled: number, squared: number }>({
          doubled: async (num) => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return num * 2;
          },
          squared: async (num) => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return num * num;
          }
        });

        // Test execution
        const result = await parallelStep(5);
        expect(result).toEqual({ doubled: 10, squared: 25 });
      });

      it('should handle errors in parallel operations', async () => {
        // Create a parallel step with an error
        const parallelStep = parallel<number, { doubled: number, error: never }>({
          doubled: (num) => num * 2,
          error: () => { throw new Error('Parallel error'); }
        });

        // Test execution
        try {
          await parallelStep(5);
          expect(false).toBe(true); // Should not reach here
        } catch (error) {
          expect((error as Error).message).toContain('Parallel error');
        }
      });
    });

    describe('transform', () => {
      it('should transform input to a different type', async () => {
        // Create a transform step
        const transformStep = transform<number, string>((num) => `Number: ${num}`);

        // Check the step type and name
        expect(transformStep.type).toBe(FlowStepTypes.TRANSFORM);
        expect(transformStep.name).toBe('transform');

        // Test execution
        const result = await transformStep(42);
        expect(result).toBe('Number: 42');
      });

      it('should handle async transformations', async () => {
        // Create an async transform step
        const transformStep = transform<number, string>(async (num) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return `Number: ${num}`;
        });

        // Test execution
        const result = await transformStep(42);
        expect(result).toBe('Number: 42');
      });
    });
  });

  describe('Loading Flows', () => {
    it('should load a flow from storage', async () => {
      // Set up a spy to track calls to store.load
      let loadCalled = false;
      let loadArgs: any[] = [];
      
      store.load = async (...args: any[]) => {
        loadCalled = true;
        loadArgs = args;
        return {
          steps: [{ type: 'function', name: 'testStep', code: 'function(x) { return x; }' }],
          metadata: { description: 'Test flow' },
          _flowData: true
        };
      };
      
      // Load a flow
      const loadedFlow = await loadFlow<number, number>('test-flow');

      // Check that store.load was called with the right arguments
      expect(loadCalled).toBe(true);
      expect(loadArgs[0]).toBe('program');
      expect(loadArgs[1]).toBe('flow-test-flow');
      expect(loadArgs[2]).toBeUndefined();

      // Execute the loaded flow (which is a placeholder in our implementation)
      const result = await loadedFlow(10);
      
      // Since our implementation just returns the input, we expect 10
      expect(result).toBe(10);
    });

    it('should handle loading errors gracefully', async () => {
      // Set up store.load to throw an error
      store.load = async () => {
        throw new Error('Load error');
      };

      // Load a flow
      const loadedFlow = await loadFlow<number, number>('test-flow');

      // Execute the loaded flow (which is a placeholder in our implementation)
      const result = await loadedFlow(10);
      
      // Since our implementation just returns the input, we expect 10
      expect(result).toBe(10);
    });

    it('should load a specific version of a flow', async () => {
      // Set up a spy to track calls to store.load
      let loadCalled = false;
      let loadArgs: any[] = [];
      
      store.load = async (...args: any[]) => {
        loadCalled = true;
        loadArgs = args;
        return {
          steps: [{ type: 'function', name: 'testStep', code: 'function(x) { return x; }' }],
          metadata: { description: 'Test flow' },
          _flowData: true
        };
      };
      
      // Load a specific version
      await loadFlow<number, number>('test-flow', 'v1');

      // Check that store.load was called with the right arguments
      expect(loadCalled).toBe(true);
      expect(loadArgs[0]).toBe('program');
      expect(loadArgs[1]).toBe('flow-test-flow');
      expect(loadArgs[2]).toBe('v1');
    });
  });

  describe('Complex Flow Scenarios', () => {
    it('should handle a complex data processing flow', async () => {
      // Create a more complex flow for data processing
      interface InputData {
        values: number[];
        threshold: number;
      }

      interface ProcessedData {
        original: number[];
        filtered: number[];
        sum: number;
        average: number;
        metadata: {
          processedAt: number;
          itemCount: number;
          passedFilters: number;
        };
      }

      // Create the flow
      const processingFlow = flow<InputData, ProcessedData>(
        // Validate input
        validate((data) => {
          if (!Array.isArray(data.values)) throw new Error('Values must be an array');
          if (typeof data.threshold !== 'number') throw new Error('Threshold must be a number');
          return data;
        }),

        // Filter values
        (data) => {
          const filtered = data.values.filter((val: number) => val > data.threshold);
          return { ...data, filtered };
        },

        // Calculate statistics
        (data) => {
          const sum = data.filtered.reduce((acc: number, val: number) => acc + val, 0);
          const average = data.filtered.length > 0 ? sum / data.filtered.length : 0;
          
          return {
            original: data.values,
            filtered: data.filtered,
            sum,
            average,
            metadata: {
              processedAt: Date.now(),
              itemCount: data.values.length,
              passedFilters: data.filtered.length
            }
          };
        }
      );

      // Test the flow
      const result = await processingFlow({
        values: [1, 5, 10, 15, 20],
        threshold: 10
      });

      // Check the result
      expect(result.original).toEqual([1, 5, 10, 15, 20]);
      expect(result.filtered).toEqual([15, 20]);
      expect(result.sum).toBe(35);
      expect(result.average).toBe(17.5);
      expect(result.metadata.itemCount).toBe(5);
      expect(result.metadata.passedFilters).toBe(2);
      expect(typeof result.metadata.processedAt).toBe('number');
    });

    it('should handle a complex flow with context', async () => {
      // Create a complex flow that simulates a multi-step data processing pipeline with context
      interface InputData {
        text: string;
      }

      interface ProcessedData {
        original: string;
        tokens: string[];
        filtered: string[];
        joined: string;
        metadata: {
          processedAt: number;
          tokenCount: number;
          filteredCount: number;
          processingSteps: string[];
        };
      }

      // Create the flow with context
      const textProcessingFlow = flowWithContext<InputData, ProcessedData>(
        // Initialize context and tokenize
        (data, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          ctx.metadata.processingSteps = ['tokenize'];
          const tokens = data.text.split(/\s+/);
          return { original: data.text, tokens };
        },

        // Filter tokens
        (data, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          if (!ctx.metadata.processingSteps) ctx.metadata.processingSteps = [];
          ctx.metadata.processingSteps.push('filter');
          const filtered = data.tokens.filter((token: string) => token.length > 3);
          return { ...data, filtered };
        },

        // Join filtered tokens
        (data, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          if (!ctx.metadata.processingSteps) ctx.metadata.processingSteps = [];
          ctx.metadata.processingSteps.push('join');
          const joined = data.filtered.join(' ');
          return { ...data, joined };
        },

        // Finalize with metadata
        (data, ctx) => {
          if (!ctx.metadata) ctx.metadata = {};
          if (!ctx.metadata.processingSteps) ctx.metadata.processingSteps = [];
          if (ctx.startTime === undefined) ctx.startTime = 0;
          
          ctx.metadata.processingSteps.push('finalize');
          return {
            ...data,
            metadata: {
              processedAt: ctx.startTime,
              tokenCount: data.tokens.length,
              filteredCount: data.filtered.length,
              processingSteps: ctx.metadata.processingSteps
            }
          };
        }
      );

      // Test the flow
      const result = await textProcessingFlow({
        text: 'This is a test of the flow system with context'
      });

      // Check the result
      expect(result.original).toBe('This is a test of the flow system with context');
      expect(result.tokens).toEqual(['This', 'is', 'a', 'test', 'of', 'the', 'flow', 'system', 'with', 'context']);
      expect(result.filtered).toEqual(['This', 'test', 'flow', 'system', 'with', 'context']);
      expect(result.joined).toBe('This test flow system with context');
      expect(result.metadata.tokenCount).toBe(10);
      expect(result.metadata.filteredCount).toBe(6);
      expect(result.metadata.processingSteps).toEqual(['tokenize', 'filter', 'join', 'finalize']);
    });
  });
});
