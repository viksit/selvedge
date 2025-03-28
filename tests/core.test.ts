import { describe, expect, test } from 'bun:test';
import { selvedge, version } from '../src/lib/core';
import { ModelProvider } from '../src/lib/types';

describe('Selvedge core', () => {
  test('selvedge object is properly initialized', () => {
    expect(selvedge).toBeDefined();
    expect(typeof selvedge.models).toBe('function');
    expect(typeof selvedge.openai).toBe('function');
    expect(typeof selvedge.anthropic).toBe('function');
    expect(typeof selvedge.mock).toBe('function');
    expect(typeof selvedge.program).toBe('function');
    expect(typeof selvedge.prompt).toBe('function');
  });
  
  test('model factory methods work correctly', () => {
    const openaiModel = selvedge.openai('test-model');
    expect(openaiModel.provider).toBe(ModelProvider.OPENAI);
    expect(openaiModel.model).toBe('test-model');
    
    const mockModel = selvedge.mock('mock-model');
    expect(mockModel.provider).toBe(ModelProvider.MOCK);
    expect(mockModel.model).toBe('mock-model');
  });

  test('version is correctly formatted', () => {
    expect(version.toString()).toBe('0.1.0');
    expect(version.major).toBe(0);
    expect(version.minor).toBe(1);
    expect(version.patch).toBe(0);
  });
});
