import { selvedge } from '../src';
// Using Bun's built-in test runner
import { expect, test, describe, beforeAll } from 'bun:test';

// Enable debug logs
selvedge.debug("*");

// Configure models
beforeAll(() => {
  selvedge.models({
    gpt4: selvedge.openai('gpt-4')
  });
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
    const finalProgram = typedProgram.using('gpt4');
    
    // Debug config should still be preserved
    expect(finalProgram._debugConfig).toBeDefined();
    expect(finalProgram._debugConfig?.showPrompt).toBe(true);
    
    // Execute the program
    const result = await finalProgram(1, 2);
    
    // Check the result works (it should be a function that adds two numbers)
    expect(typeof result).toBe('number');
    
    // Debug properties should be populated
    expect(finalProgram.finalPrompt).toBeDefined();
    expect(finalProgram.iterations).toBeDefined();
    // Check explanation if enabled
    if (finalProgram._debugConfig?.explanations) {
      expect(finalProgram.explanation).toBeDefined();
    }
    
    // Log the debug info
    console.log('Final prompt:', finalProgram.finalPrompt?.substring(0, 100) + '...');
    console.log('Iterations:', finalProgram.iterations?.length);
    console.log('Explanation:', finalProgram.explanation);
  });
});
