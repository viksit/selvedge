// @ts-ignore
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

    // Update to V2 examples format (array of objects)
    const withExamples = template.examples([
      { input: { testInput: 'test' }, output: 'result' }
    ]);

    selvedge.models({
      "model-name": selvedge.mock('test-model')
    });

    const withModel = withExamples.model("model-name");
    const finalBuilder = withModel.persist("test-id");
    expect(finalBuilder).toBeDefined();
    expect(typeof finalBuilder).toBe('function'); // V2 builder is callable
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
