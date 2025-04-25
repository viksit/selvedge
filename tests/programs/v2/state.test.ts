// tests/programs/v2/state.test.ts
import { createState, updateState } from '../../../src/lib/programs/v2/state';

describe('ProgramBuilderState', () => {
  it('should create an empty state', () => {
    const state = createState();
    expect(state).toEqual({});
  });

  it('should create a state with initial values', () => {
    const state = createState({ prompt: 'foo', model: 'bar' });
    expect(state.prompt).toBe('foo');
    expect(state.model).toBe('bar');
  });

  it('should update state immutably', () => {
    const state1 = createState({ prompt: 'foo', model: 'bar' });
    const state2 = updateState(state1, { model: 'baz' });
    expect(state2).not.toBe(state1);
    expect(state2.model).toBe('baz');
    expect(state1.model).toBe('bar'); // original unchanged
  });

  it('should allow updating nested persistence object', () => {
    const state1 = createState({ persistence: { id: '123', foo: 'bar' } });
    const state2 = updateState(state1, { persistence: { ...state1.persistence, foo: 'baz' } });
    expect(state2.persistence?.foo).toBe('baz');
    expect(state1.persistence?.foo).toBe('bar');
  });
});
