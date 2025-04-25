/**
 * Test program storage functionality
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { selvedge } from '../../src/lib/core';
import { store } from '../../src/lib/storage';
import { ModelProvider } from '../../src/lib/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Program Storage', () => {
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
    
    // Add a longer delay to ensure filesystem sync
    await new Promise(resolve => setTimeout(resolve, 500));

    // Override store path for testing
    store.setBasePath(testDir);
    console.log(`Store base path set to: ${store.getBasePath()}`);
    
    // Verify directories exist
    const programsExist = await fs.access(path.join(testDir, 'programs')).then(() => true).catch(() => false);
    const promptsExist = await fs.access(path.join(testDir, 'prompts')).then(() => true).catch(() => false);
    
    console.log(`Test directories created: programs=${programsExist}, prompts=${promptsExist}`);
  });
  
  afterAll(async () => {
    // Restore original store path
    store.setBasePath(originalStore);
    console.log(`Restored store base path to: ${store.getBasePath()}`);
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      console.log(`Cleaned up test directory: ${testDir}`);
    } catch (err) {
      console.warn('Failed to clean up test directory:', (err as Error).message);
    }
  });

  it('should save a program', async () => {
    console.log('\nTesting program save...');

    // Create a simple program
    const program = selvedge.program`
      function reverseString(str) {
        return str.split('').reverse().join('');
      }
    `.examples([
      {
        input: { str: 'hello' },
        output: 'olleh'
      }
    ]).using(selvedge.openai('gpt-4'));

    // Log the store path before saving
    console.log(`Current store path before save: ${store.getBasePath()}`);
    
    // Save the program
    await program.save('reverse-string');
    
    // Add a longer delay to ensure filesystem sync
    console.log('Waiting for filesystem sync...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if the program was saved
    const programDir = path.join(store.getBasePath(), 'programs', 'reverse-string');
    console.log(`Checking if program directory exists: ${programDir}`);
    
    const exists = await fs.access(programDir).then(() => true).catch(() => false);
    console.log(`Program directory exists: ${exists}`);

    // List files in the directory if it exists
    if (exists) {
      const files = await fs.readdir(programDir);
      console.log(`Files in program directory: ${files.join(', ')}`);
    }

    expect(exists).toBe(true);

    console.log('✓ Program save test passed');
  });

  it('should load a saved program', async () => {
    console.log('\nTesting program load...');
    
    // Add a delay to ensure filesystem sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if the program directory exists before loading
    const programDir = path.join(store.getBasePath(), 'programs', 'reverse-string');
    const exists = await fs.access(programDir).then(() => true).catch(() => false);
    console.log(`Program directory exists before load: ${exists}`);

    if (exists) {
      const files = await fs.readdir(programDir);
      console.log(`Files in program directory before load: ${files.join(', ')}`);
    }

    // Load the saved program
    const program = await selvedge.loadProgram('reverse-string');

    // Check if the program was loaded correctly
    expect(program.modelDef.provider).toBe(ModelProvider.OPENAI);
    expect(program.modelDef.model).toBe('gpt-4');
    expect(program.exampleList.length).toBe(1);
    expect(program.exampleList[0].input.str).toBe('hello');
    expect(program.exampleList[0].output).toBe('olleh');

    console.log('✓ Program load test passed');
  });

  it('should list all programs', async () => {
    console.log('\nTesting list programs...');

    // Add a delay to ensure filesystem sync
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify the program directory exists before listing
    const programDir = path.join(store.getBasePath(), 'programs', 'reverse-string');
    const exists = await fs.access(programDir).then(() => true).catch(() => false);
    console.log(`Program directory exists before listing: ${exists}`);

    if (exists) {
      const files = await fs.readdir(programDir);
      console.log(`Files in program directory before listing: ${files.join(', ')}`);
    }

    // List all programs
    const programs = await selvedge.listPrograms();
    console.log(`Listed programs: ${programs.join(', ')}`);

    // Check if the list includes our saved program
    expect(programs.includes('reverse-string')).toBe(true);
    expect(programs.length).toBe(1);

    console.log('✓ List programs test passed');
  });

  it('should list program versions', async () => {
    console.log('\nTesting list program versions...');

    // Create a new version of the program
    const newProgram = selvedge.program`
      function reverseString(str) {
        return str.split('').reverse().join('');
      }
    `.examples([
      {
        input: { str: 'hello' },
        output: 'olleh'
      }
    ]).using(selvedge.openai('gpt-4'));

    // Save the program again to create a new version
    await newProgram.save('reverse-string');
    console.log('Created new program version');
    
    // Add a longer delay to ensure filesystem sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the program directory exists
    const programDir = path.join(store.getBasePath(), 'programs', 'reverse-string');
    const exists = await fs.access(programDir).then(() => true).catch(() => false);
    console.log(`Program directory exists after saving new version: ${exists}`);

    if (exists) {
      const files = await fs.readdir(programDir);
      console.log(`Files in program directory: ${files.join(', ')}`);
    }

    // List all versions of the program
    const versions = await selvedge.listProgramVersions('reverse-string');
    console.log(`Listed versions: ${versions.join(', ')}`);

    // Check if there are at least one version
    expect(versions.length).toBeGreaterThan(0);
    
    // If there are multiple versions, check they're different
    if (versions.length > 1) {
      expect(versions[0]).not.toBe(versions[1]);
    }

    console.log('✓ List program versions test passed');
  });
});
