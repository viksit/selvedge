// tests/programs/v2/factory.test.ts
import { createProgramBuilder, ProgramBuilder } from '../../../src/lib/programs/v2/factory';

describe('ProgramBuilder Factory', () => {
  it('should create a builder with all methods and state', () => {
    const builder = createProgramBuilder();
    expect(typeof builder.prompt).toBe('function');
    expect(typeof builder.model).toBe('function');
    expect(typeof builder.options).toBe('function');
    expect(typeof builder.persist).toBe('function');
    expect(typeof builder.examples).toBe('function');
    expect(typeof builder.returns).toBe('function');
    expect(typeof builder.state).toBe('object');
  });

  it('should set and update state with builder methods', () => {
    const builder = createProgramBuilder()
      .prompt('my prompt')
      .model('gpt-4')
      .options({ temperature: 0.2 })
      .persist({ id: 'foo', version: 1 })
      .examples([{ input: 1, output: 2 }])
      .returns({ foo: 'bar' });
    expect(builder.state.prompt).toBe('my prompt');
    expect(builder.state.model).toBe('gpt-4');
    expect(builder.state.options).toEqual({ temperature: 0.2 });
    expect(builder.state.persistence).toEqual({ id: 'foo', version: 1 });
    expect(builder.state.examples).toEqual([{ input: 1, output: 2 }]);
    expect(builder.state.returnsType).toEqual({ foo: 'bar' });
  });

  it('should return a new builder object for each method call (immutability)', () => {
    const builder1 = createProgramBuilder();
    const builder2 = builder1.prompt('prompt');
    expect(builder2).not.toBe(builder1);
    expect(builder2.state.prompt).toBe('prompt');
    expect(builder1.state.prompt).toBeUndefined();
  });

  it('should allow method chaining and preserve all updates', () => {
    const builder = createProgramBuilder()
      .prompt('prompt')
      .model('model')
      .options({ x: 1 });
    expect(builder.state).toMatchObject({ prompt: 'prompt', model: 'model', options: { x: 1 } });
  });
});
