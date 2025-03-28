import { describe, expect, test } from 'bun:test';
import { process, version } from '../src/lib/core';

describe('Selvedge core', () => {
  test('process function works correctly', () => {
    const result = process('test');
    expect(result).toBe('Selvedge processed: test');
  });

  test('version is correctly formatted', () => {
    expect(version.toString()).toBe('0.1.0');
    expect(version.major).toBe(0);
    expect(version.minor).toBe(1);
    expect(version.patch).toBe(0);
  });
});
