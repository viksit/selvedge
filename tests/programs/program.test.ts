/**
 * Tests for the Program Builder functionality
 */
// @ts-ignore - Bun test types
import { expect, describe, it, beforeEach } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { ModelProvider } from '../../src/lib/types';
import { ModelRegistry } from '../../src/lib/models';
import { MockModelAdapter } from '../../src/lib/providers/mock/mock';
import * as z from 'zod';
import { ZodError } from 'zod';

describe('Program Builder', () => {
  // Set up test environment before each test
  beforeEach(() => {
    // Clear the registry to ensure clean state
    ModelRegistry.clear();
    
    // Register a mock model for testing
    selvedge.models({
      testModel: selvedge.mock('test-model')
    });
  });
  
  // 1. Basic Program Creation and Execution
  it('creates and executes a basic program', async () => {
    // Configure the mock adapter to return a simple TypeScript function
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    mockAdapter.setResponses({
      chat: '```typescript\nfunction double(n) {\n  return n * 2;\n}\n```'
    });
    
    // Create a simple program
    const doubleProgram = selvedge.program`double the input number`.using('testModel');
    
    // Execute the program
    const result = await doubleProgram(5);
    
    // Verify the result
    expect(result).toBe(10);
    
    // Verify the generated code was stored
    expect(doubleProgram.generatedCode).toContain('function double');
  });
  
  // 2. Input Schema Validation
  it('validates input against schema', async () => {
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    mockAdapter.setResponses({
      chat: '```typescript\nfunction process(input) {\n  return input.num * 2;\n}\n```'
    });
    
    // Create a program with input schema
    const program = selvedge.program`process the input number`
      .inputs(z.object({ 
        num: z.number(),
        optional: z.string().optional()
      }))
      .using('testModel');
    
    // Valid input should work
    const result = await program({ num: 5 });
    expect(result).toBe(10);
    
    // Valid input with optional field should work
    const result2 = await program({ num: 5, optional: "test" });
    expect(result2).toBe(10);
    
    // Invalid input type should fail with Zod error
    try {
      // @ts-ignore - intentionally passing invalid input
      await program({ num: "not a number" });
      // If we reach here, the test should fail
      expect(true).toBe(false);
    } catch (e) {
      // Should throw Zod validation error
      const zodError = e as ZodError;
      expect(zodError.name).toBe('ZodError');
      expect(zodError.issues[0].code).toBe('invalid_type');
    }
    
    // Invalid input structure should fail
    try {
      // @ts-ignore - intentionally passing wrong structure
      await program(5);
      // If we reach here, the test should fail
      expect(true).toBe(false);
    } catch (e) {
      // Should throw Zod validation error
      const zodError = e as ZodError;
      expect(zodError.name).toBe('ZodError');
    }
  });
  
  // 3. Output Schema Validation
  it('validates output against schema', async () => {
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // 1. Test with output matching schema
    mockAdapter.setResponses({
      chat: '```typescript\nfunction process(input) {\n  return { result: input.num * 2 };\n}\n```'
    });
    
    // Create program with nested output schema
    const program = selvedge.program`process the input number`
      .inputs(z.object({ num: z.number() }))
      .outputs(z.object({ 
        result: z.number(),
        metadata: z.object({
          processed: z.boolean()
        }).optional()
      }))
      .using('testModel');
    
    // Valid output should work
    const result = await program({ num: 5 });
    expect(result).toEqual({ result: 10 });
    
    // 2. Test with wrong output type
    mockAdapter.setResponses({
      chat: '```typescript\nfunction process(input) {\n  return { result: String(input.num * 2) };\n}\n```'
    });
    
    program.generatedCode = null;
    
    try {
      await program({ num: 5 });
      expect(true).toBe(false);
    } catch (e) {
      // Just check that an error is thrown
      expect(e).toBeDefined();
      expect(e instanceof Error).toBe(true);
      // Check if the error message mentions validation or type issues
      const error = e as Error;
      if (error.message) {
        expect(error.message.includes('invalid_type') || 
               error.message.includes('validation') || 
               error.message.includes('Expected')).toBe(true);
      }
    }
    
    // 3. Test with wrong output structure
    mockAdapter.setResponses({
      chat: '```typescript\nfunction process(input) {\n  return input.num * 2;\n}\n```'
    });
    
    program.generatedCode = null;
    
    try {
      await program({ num: 5 });
      expect(true).toBe(false);
    } catch (e) {
      // Just check that an error is thrown
      expect(e).toBeDefined();
      expect(e instanceof Error).toBe(true);
    }
    
    // 4. Test with extra unexpected fields - should pass since Zod ignores extra properties by default
    mockAdapter.setResponses({
      chat: '```typescript\nfunction process(input) {\n  return { result: input.num * 2, extra: "field" };\n}\n```'
    });
    
    program.generatedCode = null;
    
    const result2 = await program({ num: 5 });
    expect(result2.result).toBe(10);
  });
  
  // 4. Schema Hints in LLM Prompt
  it('includes schema hints in LLM prompt', async () => {
    // We'll use this to capture the prompt content
    let capturedMessages: any[] = [];
    
    // Set up a mock that captures the messages
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Override the chat method to capture messages before responding
    mockAdapter.chat = async (messages, _options) => {
      capturedMessages = messages;
      return '```typescript\nfunction test(input) { return input; }\n```';
    };
    
    // Create a program with both input and output schemas
    const program = selvedge.program`test the input`
      .inputs(z.object({ num: z.number() }))
      .outputs(z.object({ result: z.number() }))
      .using('testModel');
    
    // Call the program to trigger the LLM
    try {
      await program({ num: 5 });
    } catch (e) {
      // Ignore any errors - we just want to check the prompt
    }
    
    // Verify the system message mentions TypeScript
    expect(capturedMessages[0].content).toContain('TypeScript code generation');
    
    // Verify input schema hints are included
    expect(capturedMessages[1].content).toContain('IMPORTANT: Your function **must** accept an input');
    expect(capturedMessages[1].content).toContain('num');
    
    // Verify output schema hints are included
    expect(capturedMessages[1].content).toContain('IMPORTANT: You must respond with a valid JSON object');
    expect(capturedMessages[1].content).toContain('result');
  });
  
  // 5. forceRegenerate Option
  it('respects forceRegenerate option', async () => {
    let callCount = 0;
    
    // Set up a mock that tracks calls
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // First call will return multiply by 2
    mockAdapter.chat = async () => {
      callCount++;
      if (callCount === 1) {
        return '```typescript\nfunction multiply(n) { return n * 2; }\n```';
      } else {
        // Second call will return multiply by 3
        return '```typescript\nfunction multiply(n) { return n * 3; }\n```';
      }
    };
    
    // Create the program
    const program = selvedge.program`multiply the input number`
      .using('testModel');
    
    // First call - should use first response (multiply by 2)
    const result1 = await program(5);
    expect(result1).toBe(10);
    
    // Second call - should use cached code, not call LLM again
    const result2 = await program(5);
    expect(result2).toBe(10);
    expect(callCount).toBe(1); // Still only one call
    
    // Third call with forceRegenerate - should call LLM again
    const result3 = await program.options({ forceRegenerate: true })(5);
    expect(result3).toBe(15); // Using second response (multiply by 3)
    expect(callCount).toBe(2); // Now two calls
  });
  
  // 7. Error Handling - Malformed Code
  it('handles malformed code from LLM', async () => {
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Set invalid code as response
    mockAdapter.setResponses({
      chat: '```typescript\nThis is not valid TypeScript!\n```'
    });
    
    // Create a simple program
    const program = selvedge.program`this will fail`.using('testModel');
    
    // Should throw error with invalid code
    try {
      await program(5);
      // If we reach here, the test should fail
      expect(true).toBe(false);
    } catch (e) {
      // Should throw error related to code generation
      expect(e).toBeDefined();
    }
    
    // Now test syntax error
    mockAdapter.setResponses({
      chat: '```typescript\nfunction incomplete() {\n  return x +\n}\n```'
    });
    program.generatedCode = null;
    
    try {
      await program(5);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeDefined();
    }
    
    // Test code that doesn't export a function
    mockAdapter.setResponses({
      chat: '```typescript\nconst someVariable = 42;\n```'
    });
    program.generatedCode = null;
    
    try {
      await program(5);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
  
  // 8. Model Selection
  it('uses the specified model', async () => {
    // Register a second mock model
    selvedge.models({
      anotherModel: selvedge.mock('another-model')
    });
    
    // Configure the first mock
    const mockAdapter1 = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    mockAdapter1.setResponses({
      chat: '```typescript\nfunction test() { return "first model"; }\n```'
    });
    
    // Configure the second mock
    const mockAdapter2 = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'another-model'
    }) as MockModelAdapter;
    
    mockAdapter2.setResponses({
      chat: '```typescript\nfunction test() { return "second model"; }\n```'
    });
    
    // Create a program using the second model
    const program = selvedge.program`use another model`.using('anotherModel');
    
    // Execute the program
    const result = await program();
    
    // Verify the correct model was used by checking the result
    expect(result).toBe('second model');
  });
  
  // 6. Program Persistence Tests
  it('correctly persists and loads programs without regenerating', async () => {
    // Track LLM call count
    let llmCallCount = 0;
    let currentResponse = '';
    
    // Set up a mock adapter that changes its response on each call
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Override chat method to track calls and return different responses
    mockAdapter.chat = async (messages, _options) => {
      llmCallCount++;
      
      // First call returns one function, second call returns different function
      if (llmCallCount === 1) {
        currentResponse = '```typescript\nfunction version1(input) { return { result: "v1-" + input.value, count: 10 }; }\n```';
      } else {
        currentResponse = '```typescript\nfunction version2(input) { return { result: "v2-" + input.value, count: 20 }; }\n```';
      }
      
      return currentResponse;
    };
    
    // Create a program with persistence enabled
    const uniquePersistId = `testPersistenceProgram_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const program = selvedge.program`
      Create a function that takes an input with a value property
      and returns an object with result and count properties.
    `
    .inputs(z.object({ value: z.string() }))
    .outputs(z.object({ result: z.string(), count: z.number() }))
    .using('testModel')
    .persist(uniquePersistId);
    
    // First run - should generate and save
    const result1 = await program({ value: 'test' });
    
    // Verify first run results
    expect(llmCallCount).toBe(1);
    expect(result1.result).toBe('v1-test');
    expect(result1.count).toBe(10);
    
    // Second run - should load from persistence without regenerating
    const result2 = await program({ value: 'another' });
    
    // Verify it didn't call LLM again
    expect(llmCallCount).toBe(1); // Still 1 - loaded from storage
    expect(result2.result).toBe('v1-another'); // Same code version
    expect(result2.count).toBe(10);
    
    // Third run with force regenerate - should call LLM again
    const result3 = await program.options({ forceRegenerate: true })({ value: 'forced' });
    
    // Verify it called LLM again and got the new version
    expect(llmCallCount).toBe(2); // Now 2 - regenerated
    expect(result3.result).toBe('v2-forced'); // New code version
    expect(result3.count).toBe(20);
  });
});
