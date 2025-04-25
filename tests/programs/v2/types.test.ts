// tests/programs/v2/types.test.ts
// Type-level tests for builder typing and inference
import { program } from '../../../src/lib/programs/v2/entry';

// Helper type for compile-time assertions
// Usage: type _ = Assert<SomeType, ExpectedType>;
type Assert<T, Expected> = T extends Expected
  ? (Expected extends T ? true : never)
  : never;

describe('TypeScript typing and inference', () => {
  it('should infer prompt and state types through chaining', () => {
    const p = program`foo`
      .model('gpt-4')
      .options({ temp: 0.2 })
      .returns<{ result: number }>();
    // expect(p.returnsType).toBeUndefined();
    type State = typeof p.state;
    // Should have correct fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _assertPrompt: Assert<State['prompt'], string | undefined> = true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _assertModel: Assert<State['model'], string | undefined> = true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _assertOptions: Assert<State['options'], { temp: number } | undefined> = true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _assertReturnsType: Assert<State['returnsType'], { result: number } | undefined> = true;
  });

  it('should be callable as a function', () => {
    const p = program`foo`;
    expect(() => p({ input: 1 })).toThrow('No model specified for program execution');
  });

  it('should preserve type through chaining', () => {
    const p = program`foo`.returns<{ foo: number }>();
    type Ret = typeof p.state['returnsType'];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _assert: Assert<Ret, { foo: number }> = true;
  });

  it('should error if called with wrong number of arguments', () => {
    const p = program`foo`;
    expect(() => p()).toThrow('Program execution expected exactly one argument');
    expect(() => p('a', 'b')).toThrow('Program execution expected exactly one argument');
  });
});
