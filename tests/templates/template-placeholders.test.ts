import { describe, expect, test } from 'bun:test';
import { selvedge } from '../../src/lib/core';

describe('Template Placeholders', () => {
  test('program template placeholder captures template text', () => {
    const template = selvedge.program`
      function testFunction(input) {
        // This will be implemented by an LLM
        ${(x: string) => x.toUpperCase()}
      }
    `;
    
    // Test the initial method chaining
    const withExamples = template.examples({
      "test": "result"
    });
    
    expect(typeof withExamples.using).toBe('function');
    
    const withModel = withExamples.using("model-name");
    expect(typeof withModel.persist).toBe('function');
    
    const result = withModel.persist("test-id");
    
    // Check that the placeholder implementation captures the template string
    expect(result._template).toContain('function testFunction');
    expect(result._template).toContain('(x) => x.toUpperCase()');
  });
  
  test('prompt template works with the new implementation', () => {
    const template = selvedge.prompt`
      Analyze this: ${(text: string) => text}
      Return a rating from 1-10
    `;
    
    // Check that the template has the expected structure
    expect(template.segments.length).toBeGreaterThan(0);
    expect(template.variables.length).toBe(1);
    
    // Check that the variable has the correct name
    expect(template.variables[0].name).toBe('text');
    
    // Check that rendering works
    const rendered = template.render({ text: 'sample text' });
    expect(rendered).toContain('Analyze this: sample text');
    expect(rendered).toContain('Return a rating from 1-10');
  });
});
