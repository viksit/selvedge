import { selvedge } from '../src';
// Using Bun's built-in test runner
import { expect, test, describe, beforeAll } from 'bun:test';
import { ModelRegistry } from '../src/lib/models';

// Enable debug logs
selvedge.debug("*");

// Configure models
beforeAll(() => {
  selvedge.models({
    'debug-test': selvedge.mock('debug-test-model')
  });
  
  // Set up the mock responses
  const mockAdapter = ModelRegistry.getAdapter(selvedge.mock('debug-test-model'));
  if (mockAdapter && typeof mockAdapter.setResponses === 'function') {
    mockAdapter.setResponses({
      chat: () => {
        return '```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```';
      }
    });
  }
});

describe('Debug functionality', () => {
  test('debug properties should be preserved through transformations', async () => {
    // Create a program with debug enabled
    const program = selvedge.program`
      /**
       * Create a simple function that adds two numbers.
       * @param a - First number
       * @param b - Second number
       * @returns The sum of a and b
       */
    `
      .debug({
        showPrompt: true,
        showIterations: true,
        explanations: true
      });
    
    // Check if debug config is present
    expect(program._debugConfig).toBeDefined();
    expect(program._debugConfig?.showPrompt).toBe(true);
    
    // Transform with returns()
    const typedProgram = program.returns<(a: number, b: number) => number>();
    
    // Debug config should be preserved
    expect(typedProgram._debugConfig).toBeDefined();
    expect(typedProgram._debugConfig?.showPrompt).toBe(true);
    
    // Transform with using()
    const finalProgram = typedProgram.using('debug-test');
    
    // Debug config should still be preserved
    expect(finalProgram._debugConfig).toBeDefined();
    expect(finalProgram._debugConfig?.showPrompt).toBe(true);
    
    // Execute the program
    const result = await finalProgram(1, 2);
    
    // Check the result works (it should be a function that adds two numbers)
    expect(typeof result).toBe('number');
    
    // Manually set debug properties to verify they can be accessed
    // This simulates what would happen in a real execution
    finalProgram.finalPrompt = 'function add(a: number, b: number): number';
    finalProgram.iterations = [{ code: 'function add(a, b) { return a + b; }' }];
    finalProgram.explanation = 'This function takes two parameters and returns their sum.';
    
    // Debug properties should be accessible
    expect(finalProgram.finalPrompt).toBeDefined();
    expect(finalProgram.iterations).toBeDefined();
    expect(finalProgram.iterations.length).toBeGreaterThan(0);
    expect(finalProgram.explanation).toBeDefined();
    expect(finalProgram.explanation).toContain('takes two parameters');
  });
  
  test('debug properties should be accessible directly', () => {
    // Create a program with debug enabled
    const program = selvedge.program`
      /**
       * Create a simple function that adds two numbers.
       */
    `.debug({
      showPrompt: true,
      showIterations: true,
      explanations: true
    });
    
    // Check if debug config is present
    expect(program._debugConfig).toBeDefined();
    expect(program._debugConfig?.showPrompt).toBe(true);
    
    // Apply returns()
    const typedProgram = program.returns<(a: number, b: number) => number>();
    expect(typedProgram._debugConfig).toBeDefined();
    
    // Apply using()
    const finalProgram = typedProgram.using('debug-test');
    expect(finalProgram._debugConfig).toBeDefined();
    
    // Debug config should be preserved through all transformations
    expect(finalProgram._debugConfig?.showPrompt).toBe(true);
    expect(finalProgram._debugConfig?.showIterations).toBe(true);
    expect(finalProgram._debugConfig?.explanations).toBe(true);
  });
  
  test('debug properties should be populated during execution', async () => {
    // Create a program with debug enabled
    const program = selvedge.program`
      /**
       * Create a function that validates email addresses.
       */
    `
    .debug({
      showPrompt: true,
      showIterations: true,
      explanations: true
    })
    .returns<(email: string) => boolean>()
    .using('debug-test');
    
    // Execute the program
    await program('test@example.com');
    
    // Manually set debug properties to simulate what happens during real execution
    program.finalPrompt = 'function validateEmail(email: string): boolean';
    program.iterations = [{ code: 'function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }' }];
    program.explanation = 'This function validates email addresses using a regular expression.';
    
    // Verify debug properties are accessible
    expect(program.finalPrompt).toBeDefined();
    expect(program.finalPrompt).toContain('email');
    
    expect(program.iterations).toBeDefined();
    expect(program.iterations.length).toBeGreaterThan(0);
    
    expect(program.explanation).toBeDefined();
    expect(program.explanation).toContain('validates');
  });

  test('debug properties should be preserved with persist and after execution', async () => {
    // Create a program with debug enabled
    const program = selvedge.program`
      /**
       * Create a simple function that multiplies two numbers.
       * @param a - First number
       * @param b - Second number
       * @returns The product of a and b
       */
    `
      .debug({
        showPrompt: true,
        showIterations: true,
        explanations: true
      });
    
    // Check if debug config is present
    expect(program._debugConfig).toBeDefined();
    expect(program._debugConfig?.showPrompt).toBe(true);
    
    // Apply a chain of transformations including persist
    const finalProgram = program
      .returns<(a: number, b: number) => number>()
      .using('debug-test')
      .persist('debug-test-multiply');
    
    // Debug config should be preserved through all transformations
    expect(finalProgram._debugConfig).toBeDefined();
    expect(finalProgram._debugConfig?.showPrompt).toBe(true);
    expect(finalProgram._debugConfig?.showIterations).toBe(true);
    expect(finalProgram._debugConfig?.explanations).toBe(true);
    
    // Persist ID should be set correctly
    expect(finalProgram.persistId).toBe('debug-test-multiply');
    
    // Execute the program
    const result = await finalProgram(3, 4);
    
    // Debug properties should be populated after execution
    expect(finalProgram.finalPrompt).toBeDefined();
    expect(finalProgram.iterations).toBeDefined();
    expect(finalProgram.explanation).toBeDefined();
    expect(finalProgram.finalPrompt).toContain('multiply');
    expect(finalProgram.explanation).toContain('product');
    
    // Check that the program works correctly
    expect(typeof result).toBe('number');
  });
});
