/**
 * Tests for the program generation functionality
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { selvedge } from '../../src';
import { ModelRegistry } from '../../src/lib/models';

describe('Program Generation', () => {
  beforeEach(() => {
    // Register a mock model for testing
    selvedge.models({
      test: selvedge.mock('test-model')
    });
    
    // Set up the mock responses
    const mockAdapter = ModelRegistry.getAdapter(selvedge.mock('test-model'));
    if (mockAdapter && 'setResponses' in mockAdapter) {
      mockAdapter.setResponses({
        chat: (messages) => {
          const userMessage = messages.find(m => m.role === 'user')?.content || '';
          
          if (userMessage.includes('sort array')) {
            return '```javascript\nfunction sortArray(arr) {\n  return [...arr].sort((a, b) => a - b);\n}\n```';
          } else if (userMessage.includes('capitalize')) {
            return '```javascript\nfunction capitalize(str) {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}\n```';
          } else {
            return '```javascript\nfunction defaultFunction() {\n  return "Hello, world!";\n}\n```';
          }
        }
      });
    }
  });
  
  it('should create a program template', () => {
    const program = selvedge.program`Generate a function that ${task => task}`;
    expect(program).toBeDefined();
    expect(program.template).toBeDefined();
    expect(program.examples).toBeInstanceOf(Array);
    expect(program.examples.length).toBe(0);
  });
  
  it('should add examples to a program', () => {
    const program = selvedge.program`Generate a function that ${task => task}`
      .withExamples([
        {
          input: { task: 'sorts an array' },
          output: 'function sortArray(arr) {\n  return [...arr].sort();\n}'
        }
      ]);
    
    expect(program.examples.length).toBe(1);
    expect(program.examples[0].input.task).toBe('sorts an array');
  });
  
  it('should generate code using the mock adapter', async () => {
    const program = selvedge.program`Generate a function that ${task => task}`
      .using('test');
    
    const code = await program.generate({ task: 'sort array of numbers' });
    expect(code).toContain('function sortArray');
    expect(code).toContain('sort((a, b)');
  });
  
  it('should extract code from a response with markdown', async () => {
    const program = selvedge.program`Generate a function that ${task => task}`
      .using('test');
    
    const code = await program.generate({ task: 'capitalizes a string' });
    expect(code).toContain('function capitalize');
    expect(code).not.toContain('```');
  });
  
  it('should specify return type for a program', () => {
    interface FunctionResult {
      code: string;
      name: string;
    }
    
    const program = selvedge.program`Generate a function that ${task => task}`
      .returns<FunctionResult>();
    
    // This is just a type check, no runtime assertion needed
    expect(program).toBeDefined();
  });
});
