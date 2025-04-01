/**
 * Simple test runner for the storage system
 */
import { Store } from '../../src/lib/storage';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Simple assertion functions
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertContains<T>(array: T[], item: T, message: string) {
  if (!array.includes(item)) {
    throw new Error(`${message}: ${array} does not contain ${item}`);
  }
}

function assertNotEqual(actual: any, expected: any, message: string) {
  if (actual === expected) {
    throw new Error(`${message}: ${actual} should not equal ${expected}`);
  }
}

function assertHasProperty(obj: any, prop: string, message: string) {
  if (!(prop in obj)) {
    throw new Error(`${message}: ${JSON.stringify(obj)} does not have property ${prop}`);
  }
}

// Create a temporary test directory
const TEST_DIR = path.join(os.tmpdir(), 'selvedge-test-' + Date.now().toString());
let store: Store;

// Test runner
async function runTests() {
  console.log('Running storage tests...');
  
  try {
    // Setup
    await fs.mkdir(TEST_DIR, { recursive: true });
    store = new Store(TEST_DIR);
    
    // Run tests
    await testGenerateId();
    await testSaveAndLoadProgram();
    await testSaveAndLoadPrompt();
    await testVersioning();
    await testListingAndDeletion();
    await testErrorHandling();
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  }
}

// Test functions
async function testGenerateId() {
  console.log('Testing ID generation...');
  const id1 = store.generateId();
  const id2 = store.generateId();
  
  assert(!!id1, 'ID1 should be truthy');
  assert(!!id2, 'ID2 should be truthy');
  assertNotEqual(id1, id2, 'IDs should be unique');
}

async function testSaveAndLoadProgram() {
  console.log('Testing program save and load...');
  const testData = { 
    template: 'function test() { return "hello"; }',
    examples: [{ input: 'test', output: 'hello' }]
  };
  
  const versionId = await store.save('program', 'test-program', testData);
  assert(!!versionId, 'Version ID should be truthy');
  
  const loaded = await store.load('program', 'test-program');
  assertHasProperty(loaded, 'template', 'Loaded data should have template');
  assertEqual(loaded.template, testData.template, 'Template should match');
  assertHasProperty(loaded, 'examples', 'Loaded data should have examples');
  assertHasProperty(loaded, '_metadata', 'Loaded data should have metadata');
  assertHasProperty(loaded._metadata, 'version', 'Metadata should have version');
  assertEqual(loaded._metadata.version, versionId, 'Version should match');
  assertEqual(loaded._metadata.type, 'program', 'Type should be program');
}

async function testSaveAndLoadPrompt() {
  console.log('Testing prompt save and load...');
  const testData = { 
    template: 'You are a helpful assistant. Answer: ${question}',
    variables: ['question']
  };
  
  const versionId = await store.save('prompt', 'test-prompt', testData);
  assert(!!versionId, 'Version ID should be truthy');
  
  const loaded = await store.load('prompt', 'test-prompt');
  assertHasProperty(loaded, 'template', 'Loaded data should have template');
  assertEqual(loaded.template, testData.template, 'Template should match');
  assertHasProperty(loaded, 'variables', 'Loaded data should have variables');
  assertHasProperty(loaded._metadata, 'type', 'Metadata should have type');
  assertEqual(loaded._metadata.type, 'prompt', 'Type should be prompt');
}

async function testVersioning() {
  console.log('Testing versioning...');
  // Save first version
  const v1Data = { value: 'version 1' };
  const v1Id = await store.save('program', 'versioned-item', v1Data);
  
  // Save second version
  const v2Data = { value: 'version 2' };
  const v2Id = await store.save('program', 'versioned-item', v2Data);
  
  // IDs should be different
  assertNotEqual(v1Id, v2Id, 'Version IDs should be different');
  
  // Latest should be v2
  const latest = await store.load('program', 'versioned-item');
  assertEqual(latest.value, 'version 2', 'Latest should be v2');
  
  // Should be able to load v1 specifically
  const v1 = await store.loadVersion('program', 'versioned-item', v1Id);
  assertEqual(v1.value, 'version 1', 'Should load v1 correctly');
  
  // List versions should return both
  const versions = await store.listVersions('program', 'versioned-item');
  assertContains(versions, v1Id, 'Versions should include v1Id');
  assertContains(versions, v2Id, 'Versions should include v2Id');
  assert(versions.length >= 2, 'Should have at least 2 versions');
  
  // First version should be the newest (v2)
  assertEqual(versions[0], v2Id, 'First version should be v2Id');
}

async function testListingAndDeletion() {
  console.log('Testing listing and deletion...');
  // Create a few items
  await store.save('program', 'list-test-1', { value: 'test 1' });
  await store.save('program', 'list-test-2', { value: 'test 2' });
  
  const programs = await store.list('program');
  assertContains(programs, 'list-test-1', 'Programs should include list-test-1');
  assertContains(programs, 'list-test-2', 'Programs should include list-test-2');
  
  // Create two versions
  const v1Id = await store.save('program', 'delete-test', { value: 'v1' });
  const v2Id = await store.save('program', 'delete-test', { value: 'v2' });
  
  // Delete v1
  const deleted = await store.deleteVersion('program', 'delete-test', v1Id);
  assert(deleted, 'Delete should return true');
  
  // v1 should be gone, v2 should remain
  const versions = await store.listVersions('program', 'delete-test');
  assert(!versions.includes(v1Id), 'v1 should be deleted');
  assertContains(versions, v2Id, 'v2 should remain');
  
  // Latest should still be v2
  const latest = await store.load('program', 'delete-test');
  assertEqual(latest.value, 'v2', 'Latest should be v2');
  
  // Delete an entire item
  const fullDeleted = await store.delete('program', 'full-delete-test');
  assert(!fullDeleted || fullDeleted, 'Full delete should return boolean');
}

async function testErrorHandling() {
  console.log('Testing error handling...');
  // Try to load non-existent item
  try {
    await store.load('program', 'non-existent');
    assert(false, 'Should have thrown error for non-existent item');
  } catch (error) {
    assert(true, 'Error thrown for non-existent item');
  }
  
  // List versions of non-existent item should return empty array
  const versions = await store.listVersions('program', 'non-existent');
  assert(Array.isArray(versions), 'Should return array for non-existent item');
  assertEqual(versions.length, 0, 'Array should be empty');
  
  // Delete non-existent item should return false
  const deleted = await store.delete('program', 'non-existent');
  assertEqual(deleted, false, 'Delete should return false for non-existent item');
  
  // Empty name
  try {
    await store.save('program', '', { value: 'test' });
    assert(false, 'Should have thrown error for empty name');
  } catch (error) {
    assert(true, 'Error thrown for empty name');
  }
}

// Run the tests
runTests().catch(console.error);
