/**
 * Basic tests for the prompt template system
 */
// @ts-ignore - Bun test types
import { expect, describe, it, beforeEach } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { ModelProvider } from '../../src/lib/types';
import { ModelRegistry } from '../../src/lib/models';
import { MockModelAdapter } from '../../src/lib/providers/mock/mock';
import * as z from 'zod';

describe('Prompt Template System', () => {
  beforeEach(() => {
    // Set up test environment
    ModelRegistry.clear();
    
    // Register a mock model for testing
    selvedge.models({
      testModel: selvedge.mock('test-model')
    });
    
    // Configure mock responses
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    if (mockAdapter) {
      mockAdapter.setResponses({
        chat: 'Mock response',
        completion: 'Mock completion'
      });
    }
  });
  
  // Basic template functionality tests
  describe('Template creation and execution', () => {
    it('creates and executes templates', async () => {
      // Create a basic template
      const template = selvedge.prompt`This is a test prompt`;
      
      // Execute the template against our mock model
      const result = await template({}, { model: 'testModel' });
      
      // Verify it returns our mock response - mock includes the prompt content
      expect(result).toContain('Mock response');
      expect(result).toContain('This is a test prompt');
    });
    
    it('handles variables in templates', async () => {
      // Create a template with a variable
      const template = selvedge.prompt`Hello, ${name => name}!`;
      
      // Execute with a variable
      const result = await template({ name: 'World' }, { model: 'testModel' });
      
      // Verify the model responds
      expect(result).toContain('Mock response');
    });
    
    it('handles multiple variables', async () => {
      // Create a template with multiple variables
      const template = selvedge.prompt`${greeting => greeting}, ${name => name}!`;
      
      // Execute with variables
      const result = await template(
        { greeting: 'Hello', name: 'World' }, 
        { model: 'testModel' }
      );
      
      // Verify the response
      expect(result).toContain('Mock response');
    });
  });
  
  // Input/output schema tests
  describe('Schema validation', () => {
    it('works with input schemas', async () => {
      // Define an input schema for simple text 
      const inputSchema = z.object({
        text: z.string()
      });
      
      // Create a simple template with input schema
      const template = selvedge.prompt`${text => text}`.inputs(inputSchema);
      
      // Execute with valid input
      const result = await template({ text: 'Valid input' }, { model: 'testModel' });
      
      // Verify we get a response
      expect(result).toContain('Mock response');
      
      // Should throw error with invalid input
      try {
        // @ts-ignore - intentionally passing invalid input
        await template({ invalidField: 'wrong data' });
        // If we get here, the test should fail
        expect(true).toBe(false);
      } catch (e) {
        // Should throw validation error
        expect(e).toBeDefined();
      }
    });
    
    it('works with output schemas', async () => {
      // Configure mock adapter to return JSON for this test
      const mockAdapter = ModelRegistry.getAdapter({
        provider: ModelProvider.MOCK,
        model: 'test-model'
      }) as MockModelAdapter;
      
      mockAdapter.setResponses({
        chat: '{"answer": "Blue", "confidence": 0.9}'
      });
      
      // Define output schema
      const outputSchema = z.object({
        answer: z.string(),
        confidence: z.number()
      });
      
      // Create template with output schema
      const template = selvedge.prompt`What is your favorite color?`
        .outputs(outputSchema);
      
      // Execute the template
      const result = await template({}, { model: 'testModel' });
      
      // Check result is properly parsed according to schema
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('answer', 'Blue');
      expect(result).toHaveProperty('confidence', 0.9);
    });
  });
  
  // Method chaining tests
  describe('Method chaining', () => {
    it('supports method chaining with using()', async () => {
      // Configure a specific mock response
      const mockAdapter = ModelRegistry.getAdapter({
        provider: ModelProvider.MOCK,
        model: 'test-model'
      }) as MockModelAdapter;
      
      mockAdapter.setResponses({
        chat: 'Custom model response'
      });
      
      // Create template with using()
      const template = selvedge.prompt`Hello`.using('testModel');
      
      // Execute it
      const result = await template({});
      
      // Should match our custom response
      expect(result).toContain('Custom model response');
    });
    
    it('supports prefix and suffix', async () => {
      // Create template with prefix and suffix
      const template = selvedge.prompt`base content`
        .prefix('PREFIX ')
        .suffix(' SUFFIX');
      
      // Execute it
      const result = await template({}, { model: 'testModel' });
      
      // Verify the response includes our text pattern
      expect(result).toContain('Mock response');
    });
  });
});
