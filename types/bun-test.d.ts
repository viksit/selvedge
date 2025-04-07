/**
 * Type definitions for Bun's test functions
 */
/// <reference types="bun-types" />
declare global {
  /**
   * Defines a test suite
   */
  function describe(name: string, fn: () => void): void;

  /**
   * Defines a test case
   */
  function it(name: string, fn: () => void | Promise<void>): void;

  /**
   * Defines a test case (alias for it)
   */
  function test(name: string, fn: () => void | Promise<void>): void;

  /**
   * Makes assertions about values
   */
  namespace expect {
    function toBeDefined(): void;
    function toBeUndefined(): void;
    function toBe(expected: any): void;
    function toEqual(expected: any): void;
    function toBeTruthy(): void;
    function toBeFalsy(): void;
    function toContain(expected: any): void;
    function toThrow(expected?: any): void;
    function toHaveProperty(property: string, value?: any): void;
    function toBeInstanceOf(expected: any): void;
    function toBeNull(): void;
    function toBeGreaterThan(expected: number): void;
    function toBeGreaterThanOrEqual(expected: number): void;
    function toBeLessThan(expected: number): void;
    function toBeLessThanOrEqual(expected: number): void;
    function toBeCloseTo(expected: number, precision?: number): void;
    function toMatch(expected: string | RegExp): void;
    function toMatchObject(expected: object): void;
    function toHaveLength(expected: number): void;
  }

  interface Matchers<R> {
    toBeDefined(): R;
    toBeUndefined(): R;
    toBe(expected: any): R;
    toEqual(expected: any): R;
    toBeTruthy(): R;
    toBeFalsy(): R;
    toContain(expected: any): R;
    toThrow(expected?: any): R;
    toHaveProperty(property: string, value?: any): R;
    toBeInstanceOf(expected: any): R;
    toBeNull(): R;
    toBeGreaterThan(expected: number): R;
    toBeGreaterThanOrEqual(expected: number): R;
    toBeLessThan(expected: number): R;
    toBeLessThanOrEqual(expected: number): R;
    toBeCloseTo(expected: number, precision?: number): R;
    toMatch(expected: string | RegExp): R;
    toMatchObject(expected: object): R;
    toHaveLength(expected: number): R;
    not: Matchers<R>;
  }

  function expect<T>(actual: T): Matchers<void>;
  namespace expect {
    const not: Matchers<void>;
  }
}

export { };
