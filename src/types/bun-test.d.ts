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
    not: ExpectResult;
  }

  export function expect(actual: any): ExpectResult;
}
