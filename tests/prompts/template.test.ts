/**
 * Tests for the prompt template system
 */
import { expect, describe, it, beforeEach } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { ModelProvider } from '../../src/lib/types';
import { ModelRegistry } from '../../src/lib/models';
import { MockModelAdapter } from '../../src/lib/providers/mock/mock';

describe('Prompt Template System', () => {
  beforeEach(() => {
    // Clear any existing model registrations
    ModelRegistry.clear();
    
    // Register test models
    selvedge.models({
      test: selvedge.mock('test-model')
    });
    
    // Configure the mock adapter with test responses
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Reset the responses
    if (mockAdapter) {
      mockAdapter.setResponses({
        chat: 'This is a test response',
        completion: 'This is a test completion'
      });
    }
  });
  
  it('should create basic prompt templates', () => {
    const template = selvedge.prompt`Hello, world!`;
    expect(template.render({})).toBe('Hello, world!');
  });
  
  it('should handle simple variable substitution', () => {
    const template = selvedge.prompt`Hello, ${name => name}!`;
    expect(template.render({ name: 'Alice' })).toBe('Hello, Alice!');
  });
  
  it('should handle multiple variables', () => {
    const template = selvedge.prompt`${greeting => greeting}, ${name => name}! How are you ${time => time}?`;
    expect(template.render({ 
      greeting: 'Hello',
      name: 'Bob',
      time: 'today'
    })).toBe('Hello, Bob! How are you today?');
  });
  
  it('should support complex objects as variables', () => {
    const user = {
      name: 'Charlie',
      age: 30,
      roles: ['admin', 'user']
    };
    
    const template = selvedge.prompt`User info: ${u => u}`;
    const rendered = template.render({ u: user });
    
    expect(rendered).toContain('User info:');
    expect(rendered).toContain('"name": "Charlie"');
    expect(rendered).toContain('"age": 30');
    expect(rendered).toContain('"roles": [');
  });
  
  it('should support chaining with prefix and suffix', () => {
    const base = selvedge.prompt`Tell me about ${topic => topic}`;
    const withPrefix = base.prefix('I want you to be very detailed.\n\n');
    const withSuffix = withPrefix.suffix('\n\nPlease be accurate.');
    
    expect(withSuffix.render({ topic: 'TypeScript' }))
      .toBe('I want you to be very detailed.\n\nTell me about TypeScript\n\nPlease be accurate.');
  });
  
  it('should clone templates correctly', () => {
    const original = selvedge.prompt`Hello, ${name => name}!`;
    const clone = original.clone();
    
    // Both should render the same initially
    expect(original.render({ name: 'Alice' })).toBe('Hello, Alice!');
    expect(clone.render({ name: 'Alice' })).toBe('Hello, Alice!');
    
    // Modify the clone
    const modified = clone.suffix(' How are you?');
    
    // Original should remain unchanged
    expect(original.render({ name: 'Alice' })).toBe('Hello, Alice!');
    // Modified clone should include the suffix
    expect(modified.render({ name: 'Alice' })).toBe('Hello, Alice! How are you?');
  });
  
  it('should execute prompts with the mock provider', async () => {
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Set specific test responses
    mockAdapter.setResponses({
      chat: 'This is a test response',
      completion: 'This is a test completion'
    });
    
    const template = selvedge.prompt`Hello, ${name => name}!`;
    const result = await template.execute({ name: 'Alice' }, { model: 'test' });
    
    expect(result).toContain('This is a test response');
  });
  
  it('should parse JSON responses correctly', async () => {
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Set a JSON response
    mockAdapter.setResponses({
      chat: '{"score": 0.9, "sentiment": "positive"}'
    });
    
    const template = selvedge.prompt`Analyze the sentiment of: ${text => text}`;
    
    // Use type assertion instead of generic parameter
    const typedTemplate = template.returns() as any;
    
    const result = await typedTemplate.execute({ text: 'I love this product!' }, { model: 'test' });
    
    // Check that the result is an object with the expected properties
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(result.score).toBe(0.9);
    expect(result.sentiment).toBe('positive');
  });
  
  it('should handle non-JSON responses when expecting JSON', async () => {
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Set a non-JSON response
    mockAdapter.setResponses({
      chat: 'This is not JSON'
    });
    
    const template = selvedge.prompt`Analyze this: ${text => text}`;
    const typedTemplate = template.returns() as any;
    
    const result = await typedTemplate.execute({ text: 'Test' }, { model: 'test' });
    
    expect(result).toContain('This is not JSON');
  });
});
