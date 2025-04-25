/**
 * Test prompt storage functionality
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { store } from '../../src/lib/storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Prompt Storage', () => {
  // Setup test environment
  const testDir = path.join(os.tmpdir(), 'selvedge-test-' + Date.now());
  let originalStore: string;
  
  beforeAll(async () => {
    console.log('Setting up test environment...');

    // Save original store path
    originalStore = store.getBasePath();
    
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Create programs and prompts subdirectories
    await fs.mkdir(path.join(testDir, 'programs'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'prompts'), { recursive: true });
    
    // Add a small delay to ensure filesystem sync
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Override store path for testing
    store.setBasePath(testDir);
    
    // Verify directories exist
    const programsExist = await fs.access(path.join(testDir, 'programs')).then(() => true).catch(() => false);
    const promptsExist = await fs.access(path.join(testDir, 'prompts')).then(() => true).catch(() => false);
    
    console.log(`Test directories created: programs=${programsExist}, prompts=${promptsExist}`);
  });
  
  afterAll(async () => {
    // Restore original store path
    store.setBasePath(originalStore);
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('Failed to clean up test directory:', err);
    }
  });

  it('should save a prompt', async () => {
    console.log('\nTesting prompt save...');
    
    // Create a simple prompt
    const prompt = selvedge.prompt`
      Analyze the sentiment in this text: ${text => text}
      Rate from -1.0 (negative) to 1.0 (positive)
    `.returns<{ score: number }>();
    
    // Save the prompt
    await prompt.save('sentiment-analyzer');
    
    // Add a small delay to ensure filesystem sync
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if the prompt was saved
    const promptDir = path.join(testDir, 'prompts', 'sentiment-analyzer');
    const exists = await fs.access(promptDir).then(() => true).catch(() => false);
    
    expect(exists).toBe(true);
    
    console.log('✓ Prompt save test passed');
  });

  it('should load a saved prompt', async () => {
    console.log('\nTesting prompt load...');
    
    // Load the saved prompt
    const prompt = await selvedge.loadPrompt<{ score: number }>('sentiment-analyzer');
    
    // Check if the prompt was loaded correctly
    expect(prompt.variables.length).toBe(1);
    expect(prompt.variables[0].name).toBe('text');
    
    console.log('✓ Prompt load test passed');
  });

  it('should list all prompts', async () => {
    console.log('\nTesting list prompts...');
    
    // List all prompts
    const prompts = await selvedge.listPrompts();
    
    // Check if the list includes our saved prompt
    expect(prompts.includes('sentiment-analyzer')).toBe(true);
    expect(prompts.length).toBe(1);
    
    console.log('✓ List prompts test passed');
  });

  it('should list prompt versions', async () => {
    console.log('\nTesting list prompt versions...');
    
    // Create a new version of the prompt
    const prompt = await selvedge.loadPrompt('sentiment-analyzer');
    await prompt.save('sentiment-analyzer');
    
    // Add a small delay to ensure filesystem sync
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // List all versions of the prompt
    const versions = await selvedge.listPromptVersions('sentiment-analyzer');
    
    // Check if there are two versions
    expect(versions.length).toBe(2);
    expect(versions[0]).not.toBe(versions[1]);
    
    console.log('✓ List prompt versions test passed');
  });
});
