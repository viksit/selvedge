// tests/programs/v2/proxy.test.ts
import { createProgramBuilder } from '../../../src/lib/programs/v2/factory';
import { createCallableBuilder, CallableProgramBuilder } from '../../../src/lib/programs/v2/proxy';

describe('Proxy shell for callability', () => {
  it('should make the builder callable as a function (throws for now)', () => {
    const builder = createProgramBuilder().withPrompt('test');
    const callable = createCallableBuilder(builder);
    expect(typeof callable).toBe('function');
    expect(() => callable({ input: 1 })).toThrow('Program execution not implemented yet');
  });

  it('should forward property access to builder methods and state', () => {
    const builder = createProgramBuilder().withPrompt('hello').withModel('gpt-4');
    const callable = createCallableBuilder(builder);
    expect(callable.state.prompt).toBe('hello');
    expect(callable.state.model).toBe('gpt-4');
    expect(typeof callable.withPrompt).toBe('function');
    expect(typeof callable.withModel).toBe('function');
  });

  it('should allow chaining methods and preserve callability', () => {
    const builder = createProgramBuilder().withPrompt('foo');
    const callable = createCallableBuilder(builder);
    const chained = callable.withModel('bar').withOptions({ x: 1 });
    expect(typeof chained).toBe('function');
    expect(chained.state.prompt).toBe('foo');
    expect(chained.state.model).toBe('bar');
    expect(chained.state.options).toEqual({ x: 1 });
  });

  it('each method call returns a new callable builder (immutability)', () => {
    const builder = createProgramBuilder().withPrompt('one');
    const callable1 = createCallableBuilder(builder);
    const callable2 = callable1.withPrompt('two');
    expect(callable2).not.toBe(callable1);
    expect(callable2.state.prompt).toBe('two');
    expect(callable1.state.prompt).toBe('one');
  });
});
