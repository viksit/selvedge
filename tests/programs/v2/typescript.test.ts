// tests/programs/v2/typescript.test.ts
import { describe, test, expect } from 'bun:test';
import { evaluateTypeScript, executeTypeScriptWithInput, executeTypeScriptDetailed } from '../../../src/lib/programs/v2/typescript';

// Import the detectMainFunction function directly
import { detectMainFunction } from '../../../src/lib/programs/v2/typescript';

describe('TypeScript Execution', () => {
  test('evaluateTypeScript compiles and evaluates TypeScript code', () => {
    const code = `
      function add(a: number, b: number): number {
        return a + b;
      }
    `;
    
    const func = evaluateTypeScript(code, 'add');
    expect(typeof func).toBe('function');
    expect(func(2, 3)).toBe(5);
  });
  
  test('evaluateTypeScript handles runtime errors from type mismatches', () => {
    const code = `
      function greet(name: string): string {
        return name.toLowercase(); // Runtime error: toLowercase doesn't exist
      }
    `;
    
    // With transpileModule and strict: false, this becomes a runtime error not a compilation error
    const func = evaluateTypeScript(code, 'greet');
    expect(() => func('test')).toThrow("is not a function");
  });
  
  test('evaluateTypeScript handles runtime errors', () => {
    const code = `
      function divide(a: number, b: number): number {
        return a / b;
      }
    `;
    
    const func = evaluateTypeScript(code, 'divide');
    expect(() => func(1, 0)).not.toThrow(); // Division by zero is Infinity in JS, not an error
  });
  
  test('detectMainFunction finds function declarations', () => {
    const code = `
      function countWords(text: string): Record<string, number> {
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
        const freq: Record<string, number> = {};
        for (const word of words) {
          freq[word] = (freq[word] || 0) + 1;
        }
        return freq;
      }
    `;
    
    const functionName = detectMainFunction(code);
    expect(functionName).toBe('countWords');
  });
  
  test('detectMainFunction finds arrow functions', () => {
    const code = `
      const countWords = (text: string): Record<string, number> => {
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
        const freq: Record<string, number> = {};
        for (const word of words) {
          freq[word] = (freq[word] || 0) + 1;
        }
        return freq;
      };
    `;
    
    const functionName = detectMainFunction(code);
    expect(functionName).toBe('countWords');
  });

  test('executeTypeScriptWithInput executes code with input', () => {
    const code = `
      function countWords(input: any): Record<string, number> {
        // Extract text from input object if needed
        const text = typeof input === 'object' && input !== null && 'text' in input ? 
          input.text : String(input);
        
        // Use explicit string splitting for better compatibility
        const words = text.toLowerCase().split(' ');
        const freq: Record<string, number> = {};
        for (const word of words) {
          if (word.length > 0) {
            freq[word] = (freq[word] || 0) + 1;
          }
        }
        return freq;
      }
    `;
    
    const result = executeTypeScriptWithInput(code, { text: 'hello world hello' });
    expect(result).toEqual({ hello: 2, world: 1 });
  });
  
  test('executeTypeScriptWithInput handles object input', () => {
    const code = `
      function countWords(input: any): Record<string, number> {
        const text = typeof input === 'object' && input !== null && 'text' in input ? 
          input.text : String(input);
        
        // Use explicit string splitting for better compatibility
        const words = text.toLowerCase().split(' ');
        const freq: Record<string, number> = {};
        for (const word of words) {
          if (word.length > 0) {
            freq[word] = (freq[word] || 0) + 1;
          }
        }
        return freq;
      }
    `;
    
    const result = executeTypeScriptWithInput(code, { text: 'hello world hello' });
    expect(result).toEqual({ hello: 2, world: 1 });
  });
  
  test('executeTypeScriptWithInput works without explicit function name', () => {
    // Create a simpler test case with a function that will be detected
    const code = `
      // Define a simple word counting function
      function processText(text) {
        // Use explicit string splitting for better compatibility
        const words = String(text).toLowerCase().split(' ');
        const frequency = {};
        for (const word of words) {
          if (word.length > 0) {
            frequency[word] = (frequency[word] || 0) + 1;
          }
        }
        return frequency;
      }
    `;
    
    const result = executeTypeScriptWithInput(code, 'hello world hello');
    expect(result).toEqual({ hello: 2, world: 1 });
  });

  test('executeTypeScriptDetailed returns full context and result', () => {
    const code = `
      function echo(input: any): any {
        return input;
      }
    `;
    const input = { msg: 'hello' };
    const { context, result } = executeTypeScriptDetailed(code, input);
    expect(result).toEqual(input);
    // The context.exports should contain __result equal to the result
    expect(context.exports.__result).toEqual(input);
  });
});
