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
/**
 * Type declarations for Bun test runner
 */

declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;

  export interface ExpectResult {
    toBe(expected: any): void;
    toEqual(expected: any): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toContain(expected: any): void;
    toHaveLength(expected: number): void;
    toThrow(expected?: any): void;
    toBeInstanceOf(expected: any): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toMatch(expected: string | RegExp): void;
    toHaveProperty(property: string, value?: any): void;
    rejects: ExpectResult; // For async rejection testing
    resolves: ExpectResult; // For async resolution testing
    not: ExpectResult;
  }

  export function expect(actual: any): ExpectResult;
}


export { };
