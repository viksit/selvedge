/**
 * Tests for the program generation functionality
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { selvedge } from '../../src';
import { ModelRegistry } from '../../src/lib/models';
import { store } from '../../src/lib/storage';
import { ModelProvider } from '../../src/lib/types';

describe('Program Generation', () => {
  beforeEach(() => {
    // Register a mock model for testing
    selvedge.models({
      test: selvedge.mock('test-model')
    });
    
    // Set up the mock responses
    const mockAdapter = ModelRegistry.getAdapter(selvedge.mock('test-model'));
    if (mockAdapter && typeof mockAdapter.setResponses === 'function') {
      mockAdapter.setResponses({
        chat: (messages) => {
          const userMessage = messages.find(m => m.role === 'user')?.content || '';
          
          if (userMessage.includes('sort array')) {
            return '```javascript\nfunction sortArray(arr) {\n  return [...arr].sort((a, b) => a - b);\n}\n```';
          } else if (userMessage.includes('capitalize')) {
            return '```javascript\nfunction capitalize(str) {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}\n```';
          } else if (userMessage.includes('add numbers')) {
            return '```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```';
          } else if (userMessage.includes('invalid code')) {
            return '```javascript\nfunction broken( {\n  syntax error here\n}\n```';
          } else if (userMessage.includes('math utility')) {
            return '```javascript\nfunction add(a, b) {\n  return a + b;\n}\n\nfunction multiply(a, b) {\n  return a * b;\n}\n```';
          } else if (userMessage.includes('frequency') || userMessage.includes('extract some frequency')) {
            // Handle both the original request and regeneration requests
            return '```javascript\nfunction countWords(text) {\n  const words = text.toLowerCase().split(/\\W+/).filter(w => w.length > 0);\n  const frequency = {};\n  for (const word of words) {\n    frequency[word] = (frequency[word] || 0) + 1;\n  }\n  return frequency;\n}\n```';
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
    expect(program.exampleList).toBeInstanceOf(Array);
    expect(program.exampleList.length).toBe(0);
  });
  
  it('should add examples to a program', () => {
    const program = selvedge.program`Generate a function that ${task => task}`
      .withExamples([
        {
          input: { task: 'sorts an array' },
          output: 'function sortArray(arr) {\n  return [...arr].sort();\n}'
        }
      ]);
    
    expect(program.exampleList.length).toBe(1);
    expect(program.exampleList[0].input.task).toBe('sorts an array');
  });
  
  it('should add examples using the examples method', () => {
    const program = selvedge.program`Generate a function that sorts an array`
      .examples({
        "sort numbers": "function sortNumbers(arr) {\n  return [...arr].sort((a, b) => a - b);\n}"
      });
    
    expect(program.exampleList.length).toBe(1);
    expect(program.exampleList[0].input.input).toBe('sort numbers');
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

  // New tests for execute functionality
  it('should execute generated code and return a function proxy', async () => {
    const program = selvedge.program`Generate a function that ${task => task}`
      .using('test');
    
    const result = await program.execute({ task: 'add numbers' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('function');
    expect(typeof result.add).toBe('function');
    expect(result.add(2, 3)).toBe(5);
    // The proxy should also be callable directly if it's the main function
    expect(result(2, 3)).toBe(5);
  });

  it('should access the first function when multiple functions are generated', async () => {
    const program = selvedge.program`Generate ${task => task}`
      .using('test');
    
    const result = await program.execute({ task: 'math utility functions' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('function');
    expect(typeof result.add).toBe('function');
    // The proxy will only expose the first function found in the code
    expect(result(2, 3)).toBe(5);
    // Other functions won't be directly accessible through the proxy
  });

  it('should handle persistence of programs with persist()', async () => {
    // Mock the console.log to capture the output
    const originalConsoleLog = console.log;
    let logOutput = '';
    console.log = (message) => { logOutput = message; };

    // Create a unique program name for this test
    const programName = 'persist-test-program-' + Date.now();
    
    // Create and persist the program
    const program = selvedge.program`Generate a function that ${task => task}`
      .using('test')
      .persist(programName);
    
    // Verify the console output
    expect(logOutput).toBe(`Program "${programName}" has been persisted for later use`);
    
    // Restore console.log
    console.log = originalConsoleLog;
    
    // Wait a bit for the background save to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Try to load the program to verify it was actually saved
    const loadedProgram = await selvedge.loadProgram(programName);
    
    // Verify the loaded program works
    expect(loadedProgram).toBeDefined();
    expect(loadedProgram.execute).toBeDefined();
    
    // Execute the loaded program
    const result = await loadedProgram.execute({ task: 'add numbers' });
    
    // Verify the result
    expect(result).toBeDefined();
    expect(typeof result).toBe('function');
    expect(result(2, 3)).toBe(5);
  });

  it('should save and load programs with save()', async () => {
    // Create a unique program name for this test
    const programName = 'save-test-program-' + Date.now();
    
    // Create and save the program
    const program = selvedge.program`Generate a function that ${task => task}`
      .using('test');
    
    // Save the program using the proper storage mechanism
    await program.save(programName);
    
    // Now load the program from storage
    const loadedProgram = await selvedge.loadProgram(programName);
    
    // Verify the loaded program is defined and has the expected properties
    expect(loadedProgram).toBeDefined();
    expect(loadedProgram.execute).toBeDefined();
    expect(typeof loadedProgram.execute).toBe('function');
    
    // Execute the loaded program
    const result = await loadedProgram.execute({ task: 'add numbers' });
    
    // Verify the result works as expected
    expect(result).toBeDefined();
    expect(typeof result).toBe('function');
    expect(typeof result.add).toBe('function');
    expect(result.add(2, 3)).toBe(5);
  });

  it('should handle errors during code generation', async () => {
    const program = selvedge.program`Generate a function that ${task => task}`
      .using('test');
    
    try {
      await program.generate({ task: 'invalid code' });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle errors during code execution', async () => {
    const mockAdapter = ModelRegistry.getAdapter(selvedge.mock('test-model'));
    if (mockAdapter && typeof mockAdapter.setResponses === 'function') {
      mockAdapter.setResponses({
        chat: () => '```javascript\nfunction broken() {\n  return nonExistentVariable;\n}\n```'
      });
    }

    const program = selvedge.program`Generate a function with an error`
      .using('test');
    
    try {
      await program.execute();
      // Should not reach here if properly handling errors
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should validate return types at runtime', async () => {
    interface Person {
      name: string;
      age: number;
    }

    // Set up mock to return a function that returns a Person object
    const mockAdapter = ModelRegistry.getAdapter(selvedge.mock('test-model'));
    if (mockAdapter && typeof mockAdapter.setResponses === 'function') {
      mockAdapter.setResponses({
        chat: () => '```javascript\nfunction createPerson(name, age) {\n  return { name, age };\n}\n```'
      });
    }

    const program = selvedge.program`Generate a function that creates a person object`
      .using('test')
      .returns<Person>();
    
    const result = await program.execute();
    const person = result.createPerson('John', 30);
    
    expect(person).toHaveProperty('name');
    expect(person).toHaveProperty('age');
    expect(person.name).toBe('John');
    expect(person.age).toBe(30);
  });

  it('should return clean objects without Object prototype methods when printed', async () => {
    const program = selvedge.program`Generate a function that ${task => task}`
      .using('test');
    
    const result = await program.execute({ task: 'word frequency counter' });
    
    // Test the function by calling it with a sample text
    const frequencies = result.countWords('This is a test. This is only a test.');
    
    // Check that the result is an object with the word frequencies
    expect(frequencies).toBeDefined();
    expect(typeof frequencies).toBe('object');
    
    // Check that it contains the expected word frequencies
    expect(frequencies.this).toBe(2);
    expect(frequencies.is).toBe(2);
    expect(frequencies.a).toBe(2);
    expect(frequencies.test).toBe(2);
    expect(frequencies.only).toBe(1);
    
    // When the object is printed or JSON.stringified, it should only contain the word frequencies
    const serialized = JSON.stringify(frequencies);
    const parsed = JSON.parse(serialized);
    
    // The serialized object should only contain the word frequencies
    expect(Object.keys(parsed).length).toBe(5); // this, is, a, test, only
    expect(parsed.this).toBe(2);
    expect(parsed.is).toBe(2);
    expect(parsed.a).toBe(2);
    expect(parsed.test).toBe(2);
    expect(parsed.only).toBe(1);
    
    // The serialized object should not contain any functions
    expect(Object.values(parsed).every(value => typeof value === 'number')).toBe(true);
  });

  it('should save and load a program with generated code', async () => {
    // Create a unique program name for this test
    const programName = 'code-persistence-test-' + Date.now();
    
    // Create a program
    const p = selvedge.program`
      /**
       * Add two numbers together
       * @param a - First number
       * @param b - Second number
       * @returns The sum of a and b
       */
    `.using('test');
    
    // Generate the code first
    await p.generate({ task: 'add numbers' });
    
    // Save the program
    await p.save(programName);
    
    // Load the program
    const loadedProgram = await selvedge.loadProgram(programName);
    
    // Verify the loaded program has the generated code
    expect(loadedProgram.generatedCode).toBeDefined();
    
    // Execute the program without regenerating
    const result = await loadedProgram.execute();
    
    // Verify the result works as expected
    expect(result).toBeDefined();
    expect(typeof result).toBe('function');
    expect(result(2, 3)).toBe(5);
  });
  
  it('should force regeneration of code when forceRegenerate option is true', async () => {
    // Create a unique program name for this test
    const programName = 'force-regen-test-' + Date.now();
    
    // Create a program
    const p = selvedge.program`
      /**
       * Add two numbers together
       * @param a - First number
       * @param b - Second number
       * @returns The sum of a and b
       */
    `.using('test');
    
    // Generate the code first
    await p.generate({ task: 'add numbers' });
    
    // Save the program
    await p.save(programName);
    
    // Load the program
    const loadedProgram = await selvedge.loadProgram(programName);
    
    // Store the original code
    const originalCode = loadedProgram.generatedCode;
    
    // Execute with forceRegenerate option
    await loadedProgram.execute({}, { forceRegenerate: true });
    
    // The code should have been regenerated
    expect(loadedProgram.generatedCode).toBeDefined();
    
    // We can't guarantee the code will be different since it's a mock,
    // but we can verify the execute method works
    const result = await loadedProgram.execute();
    expect(result).toBeDefined();
    expect(typeof result).toBe('function');
    expect(result(2, 3)).toBe(5);
  });
});
