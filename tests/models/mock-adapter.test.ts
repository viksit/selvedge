import { describe, expect, test, beforeEach } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { ModelRegistry } from '../../src/lib/models';
import { MockConfig } from '../../src/lib/providers/mock/mock';
import { ModelProvider } from '../../src/lib/types';

describe('Mock Adapter', () => {
  const MOCK_MODEL = 'test-model';
  
  // Setup the model before each test
  beforeEach(() => {
    // Reset models
    (ModelRegistry as any).registeredModels = new Map();
    (ModelRegistry as any).modelAdapters = new Map();
    
    // Register a mock model
    selvedge.models({
      test: selvedge.mock(MOCK_MODEL)
    });
  });
  
  test('basic completion works', async () => {
    const model = ModelRegistry.getModel('test');
    expect(model).toBeDefined();
    
    if (model) {
      const adapter = ModelRegistry.getAdapter(model);
      expect(adapter).toBeDefined();
      
      // Test basic completion
      const result = await adapter!.complete('Hello, world!');
      expect(result).toContain('Hello, world');
    }
  });
  
  test('completion respects maxTokens', async () => {
    const model = ModelRegistry.getModel('test');
    expect(model).toBeDefined();
    
    if (model) {
      const adapter = ModelRegistry.getAdapter(model);
      
      // Test with max tokens limit
      const result = await adapter!.complete('This is a long prompt that should be truncated', {
        maxTokens: 10
      });
      
      // The response should be limited
      expect(result.length).toBeLessThanOrEqual(10);
    }
  });
  
  test('chat completion works', async () => {
    const model = ModelRegistry.getModel('test');
    expect(model).toBeDefined();
    
    if (model) {
      const adapter = ModelRegistry.getAdapter(model);
      
      // Test chat completion
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ];
      
      const result = await adapter!.chat(messages);
      expect(result).toContain('Mock chat response');
      expect(result).toContain('responding to: "Hello!"');
    }
  });
  
  test('preset responses work', async () => {
    // Create a model with preset responses
    const mockConfig: MockConfig = {
      responses: {
        promptMap: {
          'specific question': 'specific answer'
        }
      }
    };
    
    selvedge.models({
      configured: {
        provider: ModelProvider.MOCK,
        model: 'configured-model',
        config: mockConfig
      }
    });
    
    const model = ModelRegistry.getModel('configured');
    expect(model).toBeDefined();
    
    if (model) {
      const adapter = ModelRegistry.getAdapter(model);
      
      // Test with the specific question that has a preset answer
      const result = await adapter!.complete('specific question');
      expect(result).toBe('specific answer');
    }
  });
  
  test('error handling works', async () => {
    // Create a model configured to fail
    const failingConfig: MockConfig = {
      shouldFail: true
    };
    
    selvedge.models({
      failing: {
        provider: ModelProvider.MOCK,
        model: 'failing-model',
        config: failingConfig
      }
    });
    
    const model = ModelRegistry.getModel('failing');
    expect(model).toBeDefined();
    
    if (model) {
      const adapter = ModelRegistry.getAdapter(model);
      
      // Test that it throws the expected error
      await expect(adapter!.complete('test')).rejects.toThrow('Mock completion failed');
    }
  });
});
