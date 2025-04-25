// tests/programs/v2/entry.test.ts
import { program } from '../../../src/lib/programs/v2/entry';

describe('Tagged template entrypoint', () => {
  it('should create a callable builder from a tagged template', () => {
    const p = program`my prompt`;
    expect(typeof p).toBe('function');
    expect(p.state.prompt).toBe('my prompt');
  });

  it('should interpolate expressions in the prompt', () => {
    const name = 'world';
    const p = program`Hello, ${name}!`;
    expect(p.state.prompt).toBe('Hello, world!');
  });

  it('should allow chaining builder methods and preserve callability', () => {
    const p = program`foo`.model('bar').options({ x: 1 });
    expect(typeof p).toBe('function');
    expect(p.state.prompt).toBe('foo');
    expect(p.state.model).toBe('bar');
    expect(p.state.options).toEqual({ x: 1 });
  });

  it('should throw when called as a function without a model', () => {
    const p = program`test`;
    expect(() => p({ input: 1 })).toThrow('No model specified for program execution');
  });
});
