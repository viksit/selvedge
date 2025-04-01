/**
 * Test program storage functionality
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
    await testProgramSave();
    await testProgramLoad();
    await testListPrograms();
    await testListProgramVersions();
    
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

async function testProgramSave() {
  console.log('\nTesting program save...');
  
  // Create a simple program
  const program = selvedge.program`
    function reverseString(str) {
      return str.split('').reverse().join('');
    }
  `.withExamples([
    {
      input: { str: 'hello' },
      output: 'olleh'
    }
  ]).using(selvedge.openai('gpt-4'));
  
  // Save the program
  await program.save('reverse-string');
  
  // Check if the program was saved
  const programDir = path.join(testDir, 'programs', 'reverse-string');
  const exists = await fs.access(programDir).then(() => true).catch(() => false);
  
  assertEqual(exists, true, 'Program directory should exist');
  
  console.log('✓ Program save test passed');
}

async function testProgramLoad() {
  console.log('\nTesting program load...');
  
  // Load the saved program
  const program = await selvedge.loadProgram('reverse-string');
  
  // Check if the program was loaded correctly
  assertEqual(program.modelDef.provider, 'openai', 'Model provider should be OpenAI');
  assertEqual(program.modelDef.model, 'gpt-4', 'Model should be gpt-4');
  assertEqual(program.exampleList.length, 1, 'Program should have one example');
  assertEqual(program.exampleList[0].input.str, 'hello', 'Example input should be correct');
  assertEqual(program.exampleList[0].output, 'olleh', 'Example output should be correct');
  
  console.log('✓ Program load test passed');
}

async function testListPrograms() {
  console.log('\nTesting list programs...');
  
  // List all programs
  const programs = await selvedge.listPrograms();
  
  // Check if the list includes our saved program
  assertEqual(programs.includes('reverse-string'), true, 'Program list should include our saved program');
  assertEqual(programs.length, 1, 'There should be exactly one program');
  
  console.log('✓ List programs test passed');
}

async function testListProgramVersions() {
  console.log('\nTesting list program versions...');
  
  // Create a new version of the program
  const program = await selvedge.loadProgram('reverse-string');
  await program.save('reverse-string');
  
  // List all versions of the program
  const versions = await selvedge.listProgramVersions('reverse-string');
  
  // Check if there are two versions
  assertEqual(versions.length, 2, 'There should be two versions of the program');
  assertNotEqual(versions[0], versions[1], 'Version IDs should be different');
  
  console.log('✓ List program versions test passed');
}

// Run the tests
runTests();
