// tests/programs/v2/factory.test.ts
import { createProgramBuilder, ProgramBuilder } from '../../../src/lib/programs/v2/factory';

describe('ProgramBuilder Factory', () => {
  it('should create a builder with all methods and state', () => {
    const builder = createProgramBuilder();
    expect(typeof builder.withPrompt).toBe('function');
    expect(typeof builder.withModel).toBe('function');
    expect(typeof builder.withOptions).toBe('function');
    expect(typeof builder.withPersistence).toBe('function');
    expect(typeof builder.withExamples).toBe('function');
    expect(typeof builder.withReturnsType).toBe('function');
    expect(typeof builder.state).toBe('object');
  });

  it('should set and update state with builder methods', () => {
    const builder = createProgramBuilder()
      .withPrompt('my prompt')
      .withModel('gpt-4')
      .withOptions({ temperature: 0.2 })
      .withPersistence({ id: 'foo', version: 1 })
      .withExamples([{ input: 1, output: 2 }])
      .withReturnsType({ foo: 'bar' });
    expect(builder.state.prompt).toBe('my prompt');
    expect(builder.state.model).toBe('gpt-4');
    expect(builder.state.options).toEqual({ temperature: 0.2 });
    expect(builder.state.persistence).toEqual({ id: 'foo', version: 1 });
    expect(builder.state.examples).toEqual([{ input: 1, output: 2 }]);
    expect(builder.state.returnsType).toEqual({ foo: 'bar' });
  });

  it('should return a new builder object for each method call (immutability)', () => {
    const builder1 = createProgramBuilder();
    const builder2 = builder1.withPrompt('prompt');
    expect(builder2).not.toBe(builder1);
    expect(builder2.state.prompt).toBe('prompt');
    expect(builder1.state.prompt).toBeUndefined();
  });

  it('should allow method chaining and preserve all updates', () => {
    const builder = createProgramBuilder()
      .withPrompt('prompt')
      .withModel('model')
      .withOptions({ x: 1 });
    expect(builder.state).toMatchObject({ prompt: 'prompt', model: 'model', options: { x: 1 } });
  });
});
