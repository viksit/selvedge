import { describe, expect, test, beforeEach } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { ModelProvider } from '../../src/lib/types';
import { ModelRegistry } from '../../src/lib/models';

describe('Model Registry', () => {
  beforeEach(() => {
    // Reset the registered models between tests
    // This is a bit of a hack since we're accessing internal state,
    // but it's necessary for testing the registry
    (ModelRegistry as any).registeredModels = new Map();
    (ModelRegistry as any).modelAdapters = new Map();
  });

  test('model definition factories create correct provider types', () => {
    // Test OpenAI
    const openAiModel = selvedge.openai('gpt-4');
    expect(openAiModel.provider).toBe(ModelProvider.OPENAI);
    expect(openAiModel.model).toBe('gpt-4');
    
    // Test Anthropic
    const anthropicModel = selvedge.anthropic('claude-3-opus');
    expect(anthropicModel.provider).toBe(ModelProvider.ANTHROPIC);
    expect(anthropicModel.model).toBe('claude-3-opus');
    
    // Test Mock
    const mockModel = selvedge.mock('test-model');
    expect(mockModel.provider).toBe(ModelProvider.MOCK);
    expect(mockModel.model).toBe('test-model');
  });
  
  test('models method registers models by alias', () => {
    // Define model map - only use mock to avoid API key errors
    const modelMap = {
      test1: selvedge.mock('test-model-1'),
      test2: selvedge.mock('test-model-2'),
      test3: selvedge.mock('test-model-3')
    };
    
    // Register models
    selvedge.models(modelMap);
    
    // Get models by alias
    const test1Model = ModelRegistry.getModel('test1');
    const test2Model = ModelRegistry.getModel('test2');
    const test3Model = ModelRegistry.getModel('test3');
    
    // Check if models are registered correctly
    expect(test1Model).toBeDefined();
    expect(test1Model?.provider).toBe(ModelProvider.MOCK);
    expect(test1Model?.model).toBe('test-model-1');
    
    expect(test2Model).toBeDefined();
    expect(test2Model?.provider).toBe(ModelProvider.MOCK);
    expect(test2Model?.model).toBe('test-model-2');
    
    expect(test3Model).toBeDefined();
    expect(test3Model?.provider).toBe(ModelProvider.MOCK);
    expect(test3Model?.model).toBe('test-model-3');
  });
  
  test('models method is chainable', () => {
    // The models method should return the selvedge instance for chaining
    const result = selvedge.models({
      test: selvedge.mock('test-model')
    });
    
    expect(result).toBe(selvedge);
  });
  
  test('getAdapter returns the correct adapter type', () => {
    // Register only mock models to avoid API key errors
    selvedge.models({
      mock1: selvedge.mock('test-model-1'),
      mock2: selvedge.mock('test-model-2')
    });
    
    // Get models
    const mock1Model = ModelRegistry.getModel('mock1');
    const mock2Model = ModelRegistry.getModel('mock2');
    
    expect(mock1Model).toBeDefined();
    expect(mock2Model).toBeDefined();
    
    if (mock1Model && mock2Model) {
      // Get adapters
      const mock1Adapter = ModelRegistry.getAdapter(mock1Model);
      const mock2Adapter = ModelRegistry.getAdapter(mock2Model);
      
      // Check adapter types
      expect(mock1Adapter).toBeDefined();
      expect(mock2Adapter).toBeDefined();
      if (mock1Adapter && mock2Adapter) {
        expect(mock1Adapter.constructor.name).toBe('MockModelAdapter');
        expect(mock2Adapter.constructor.name).toBe('MockModelAdapter');
      }
    }
  });
});
