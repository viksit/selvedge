/**
 * Tests for prompt persistence functionality
 */
import { expect, describe, it, beforeAll, afterAll } from 'bun:test';
import { store } from '../../src/lib/storage';
import { selvedge } from '../../src/lib/core';
import { ModelRegistry } from '../../src/lib/models';
import { ModelProvider } from '../../src/lib/types';
import { MockModelAdapter } from '../../src/lib/providers/mock/mock';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Create a temporary test directory
const TEST_DIR = path.join(os.tmpdir(), 'selvedge-prompt-test-' + Date.now().toString());

describe('Prompt Persistence', () => {
  // Store the original mock adapter for restoration
  let originalMockAdapter: MockModelAdapter | null = null;
  
  beforeAll(async () => {
    // Setup
    await fs.mkdir(TEST_DIR, { recursive: true });
    
    // Override store path for testing
    (store as any).basePath = TEST_DIR;
    
    // Set up the mock model
    ModelRegistry.clear();
    selvedge.models({
      test: selvedge.mock('test-model')
    });
    
    // Configure the mock adapter with test responses
    const mockAdapter = ModelRegistry.getAdapter({
      provider: ModelProvider.MOCK,
      model: 'test-model'
    }) as MockModelAdapter;
    
    // Store the original adapter for later restoration
    originalMockAdapter = mockAdapter;
    
    // Set up mock responses
    if (mockAdapter) {
      mockAdapter.setResponses({
        chat: 'mock response',
        completion: 'mock response'
      });
    }
  });
  
  afterAll(async () => {
    // Cleanup
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to clean up test directory:', e);
    }
    
    // Reset the mock adapter to its default behavior
    // This is important to not interfere with other tests
    if (originalMockAdapter) {
      originalMockAdapter.setResponses({
        chat: undefined,
        completion: undefined
      });
    }
    
    // Re-register models to ensure clean state for other tests
    ModelRegistry.clear();
  });
  
  it('should set persistence properties correctly', () => {
    // Create a simple prompt template
    const prompt = selvedge.prompt`Hello, my name is ${(name: string) => name}. I am ${(age: string) => age} years old.`;
    
    // Check initial state
    expect(prompt.persistId).toBeUndefined();
    expect(prompt.needsSave).toBe(false);
    
    // Persist the prompt
    const persistedPrompt = prompt.persist('test-persist-id');
    
    // Check that persist sets the correct properties
    expect(persistedPrompt.persistId).toBe('test-persist-id');
    expect(persistedPrompt.needsSave).toBe(true);
    
    // Ensure persist returns an object with the same properties
    expect(persistedPrompt.persistId).toBe('test-persist-id');
    expect(persistedPrompt.needsSave).toBe(true);
  });
  
  it('should save prompts to storage', async () => {
    // Create a simple prompt template with a unique ID to avoid conflicts
    const uniqueId = `test-save-prompt-${Date.now()}`;
    const prompt = selvedge.prompt`This is a test prompt with variable ${(v: string) => v}.`;
    
    // Save the prompt and ensure it completes
    const savedPrompt = await prompt.save(uniqueId);
    
    // Add a small delay to ensure file system operations complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check that the prompt was saved
    const items = await store.list('prompt');
    expect(items).toContain(uniqueId);
    
    try {
      // Load the saved prompt
      const loadedData = await store.load('prompt', uniqueId);
      
      // Check that the loaded data has the correct structure
      const filteredOriginal = prompt.segments.filter((s: any) => typeof s === 'string');
      const filteredLoaded = loadedData.segments.filter((s: any) => typeof s === 'string');
      expect(JSON.stringify(filteredLoaded)).toBe(JSON.stringify(filteredOriginal));
      
      // Ensure save returns an object with the same structure
      expect(savedPrompt.segments).toEqual(prompt.segments);
      expect(savedPrompt.variables).toEqual(prompt.variables);
    } catch (error) {
      console.error(`Failed to load prompt ${uniqueId}:`, error);
      console.log('Available prompts:', items);
      throw error;
    }
  });
  
  it('should load prompts from storage during execute', async () => {
    // Create a unique ID for this test
    const uniqueId = `load-test-prompt-${Date.now()}`;
    
    // Create and save a prompt
    const originalPrompt = selvedge.prompt`Loading test with ${(v1: string) => v1} and ${(v2: string) => v2}.`;
    await originalPrompt.save(uniqueId);
    
    // Add a small delay to ensure file system operations complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify the prompt was saved
    const items = await store.list('prompt');
    expect(items).toContain(uniqueId);
    
    // Create a new prompt with the same ID but different content
    const newPrompt = selvedge.prompt`Different content with ${(diff: string) => diff}.`;
    newPrompt.persist(uniqueId);
    
    try {
      // Execute the prompt to trigger loading
      await newPrompt.execute({ different: 'value' }, { model: 'test' });
      
      // Add a small delay to ensure loading completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that the prompt was loaded from storage
      const filteredOriginal = originalPrompt.segments.filter((s: any) => typeof s === 'string');
      const filteredNew = newPrompt.segments.filter((s: any) => typeof s === 'string');
      expect(JSON.stringify(filteredNew)).toBe(JSON.stringify(filteredOriginal));
    } catch (error) {
      console.error(`Failed during prompt execution for ${uniqueId}:`, error);
      console.log('Available prompts:', items);
      throw error;
    }
  });
  
  it('should save prompts during execute when persisted', async () => {
    // Create a unique ID for this test
    const uniqueId = `execute-test-prompt-${Date.now()}`;
    
    // Create a prompt and persist it
    const prompt = selvedge.prompt`Execute test with ${(param: string) => param}.`;
    prompt.persist(uniqueId);
    
    // Execute the prompt to trigger saving
    await prompt.execute({ param: 'test value' }, { model: 'test' });
    
    // Add a longer delay to ensure the async save operation completes
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Check that the prompt was saved
      const items = await store.list('prompt');
      expect(items).toContain(uniqueId);
      
      const versions = await store.listVersions('prompt', uniqueId);
      expect(versions.length).toBeGreaterThan(0);
      
      // Load the saved prompt
      const loadedData = await store.load('prompt', uniqueId);
      
      // Check that the loaded data has the correct structure
      const filteredOriginal = prompt.segments.filter((s: any) => typeof s === 'string');
      const filteredLoaded = loadedData.segments.filter((s: any) => typeof s === 'string');
      expect(JSON.stringify(filteredLoaded)).toBe(JSON.stringify(filteredOriginal));
    } catch (error) {
      console.error(`Failed during prompt persistence check for ${uniqueId}:`, error);
      console.log('Available prompts:', await store.list('prompt'));
      throw error;
    }
  });
});
