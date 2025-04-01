/**
 * Test prompt storage functionality
 */
import { selvedge } from '../../src/lib/core';
import { store } from '../../src/lib/storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Setup test environment
const testDir = path.join(os.tmpdir(), 'selvedge-test-' + Date.now());
let originalStore: any;

// Helper functions for assertions
function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertNotEqual(actual: any, expected: any, message: string) {
  if (actual === expected) {
    throw new Error(`${message}: ${actual} should not equal ${expected}`);
  }
}

async function runTests() {
  console.log('Setting up test environment...');
  
  // Save original store
  originalStore = store.getBasePath();
  
  // Create test directory
  await fs.mkdir(testDir, { recursive: true });
  
  // Override store path for testing
  (store as any).baseDir = testDir;
  
  try {
    await testPromptSave();
    await testPromptLoad();
    await testListPrompts();
    await testListPromptVersions();
    
    console.log('\nAll tests passed! 🎉');
  } catch (error) {
    console.error('\nTest failed:', error);
  } finally {
    // Restore original store path
    (store as any).baseDir = originalStore;
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('Failed to clean up test directory:', err);
    }
  }
}

async function testPromptSave() {
  console.log('\nTesting prompt save...');
  
  // Create a simple prompt
  const prompt = selvedge.prompt`
    Analyze the sentiment in this text: ${text => text}
    Rate from -1.0 (negative) to 1.0 (positive)
  `.returns<{ score: number }>();
  
  // Save the prompt
  await prompt.save('sentiment-analyzer');
  
  // Check if the prompt was saved
  const promptDir = path.join(testDir, 'prompts', 'sentiment-analyzer');
  const exists = await fs.access(promptDir).then(() => true).catch(() => false);
  
  assertEqual(exists, true, 'Prompt directory should exist');
  
  console.log('✓ Prompt save test passed');
}

async function testPromptLoad() {
  console.log('\nTesting prompt load...');
  
  // Load the saved prompt
  const prompt = await selvedge.loadPrompt<{ score: number }>('sentiment-analyzer');
  
  // Check if the prompt was loaded correctly
  assertEqual(prompt.variables.length, 1, 'Prompt should have one variable');
  assertEqual(prompt.variables[0].name, 'text', 'Variable name should be "text"');
  
  console.log('✓ Prompt load test passed');
}

async function testListPrompts() {
  console.log('\nTesting list prompts...');
  
  // List all prompts
  const prompts = await selvedge.listPrompts();
  
  // Check if the list includes our saved prompt
  assertEqual(prompts.includes('sentiment-analyzer'), true, 'Prompt list should include our saved prompt');
  assertEqual(prompts.length, 1, 'There should be exactly one prompt');
  
  console.log('✓ List prompts test passed');
}

async function testListPromptVersions() {
  console.log('\nTesting list prompt versions...');
  
  // Create a new version of the prompt
  const prompt = await selvedge.loadPrompt('sentiment-analyzer');
  await prompt.save('sentiment-analyzer');
  
  // List all versions of the prompt
  const versions = await selvedge.listPromptVersions('sentiment-analyzer');
  
  // Check if there are two versions
  assertEqual(versions.length, 2, 'There should be two versions of the prompt');
  assertNotEqual(versions[0], versions[1], 'Version IDs should be different');
  
  console.log('✓ List prompt versions test passed');
}

// Run the tests
runTests();
