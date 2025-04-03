/**
 * Tests for the formatter utility
 */
import { describe, test, expect } from 'bun:test';
import { formatValue, formatForPrompt } from '../src/lib/utils/formatter';

// Format Value Tests
describe('formatValue', () => {
  test('should format primitive values correctly', () => {
    expect(formatValue('hello')).toBe('hello');
    expect(formatValue(42)).toBe('42');
    expect(formatValue(true)).toBe('true');
    expect(formatValue(null)).toBe('null');
    expect(formatValue(undefined)).toBe('undefined');
  });

  test('should format arrays correctly', () => {
    const result = formatValue([1, 2, 3]);
    expect(result).toContain('1');
    expect(result).toContain('2');
    expect(result).toContain('3');
  });

  test('should format objects correctly', () => {
    const result = formatValue({ name: 'John', age: 30 });
    expect(result).toContain('name: John');
    expect(result).toContain('age: 30');
  });

  test('should handle nested objects', () => {
    const obj = {
      person: {
        name: 'John',
        address: {
          city: 'New York'
        }
      }
    };
    const result = formatValue(obj);
    expect(result).toContain('person:');
    expect(result).toContain('name: John');
    expect(result).toContain('city: New York');
  });

  test('should respect maxDepth option', () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            level4: 'deep'
          }
        }
      }
    };
    
    const result = formatValue(obj, { maxDepth: 2 });
    expect(result).toContain('level1:');
    expect(result).toContain('level2:');
    expect(result).toContain('[Object]');
    expect(result).not.toContain('level4: deep');
  });

  test('should respect maxArrayItems option', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = formatValue(arr, { maxArrayItems: 3 });
    expect(result).toContain('1');
    expect(result).toContain('2');
    expect(result).toContain('3');
    expect(result).toContain('7 more items');
    expect(result).not.toContain('4');
  });

  test('should truncate long strings', () => {
    const longString = 'a'.repeat(200);
    const result = formatValue(longString, { maxStringLength: 50 });
    expect(result.length).toBeLessThan(longString.length);
    expect(result).toContain('...');
  });

  test('should handle Date objects', () => {
    const date = new Date('2023-01-01T00:00:00Z');
    const result = formatValue(date);
    expect(result).toBe('2023-01-01T00:00:00.000Z');
  });
});

// Format For Prompt Tests
describe('formatForPrompt', () => {
  test('should format primitive values directly', () => {
    expect(formatForPrompt('hello')).toBe('hello');
    expect(formatForPrompt(42)).toBe('42');
    expect(formatForPrompt(true)).toBe('true');
  });

  test('should add type hints for arrays', () => {
    const result = formatForPrompt([1, 2, 3]);
    expect(result).toContain('Array with 3 items:');
  });

  test('should add type hints for objects', () => {
    const result = formatForPrompt({ name: 'John', age: 30 });
    expect(result).toContain('Object with properties:');
  });

  test('should handle complex nested structures', () => {
    const complex = {
      user: {
        name: 'John',
        contacts: [
          { type: 'email', value: 'john@example.com' },
          { type: 'phone', value: '555-1234' }
        ]
      }
    };
    
    const result = formatForPrompt(complex);
    expect(result).toContain('Object with properties:');
    expect(result).toContain('user:');
    expect(result).toContain('name: John');
    expect(result).toContain('contacts:');
    expect(result).toContain('type: email');
    expect(result).toContain('value: john@example.com');
  });
});
