/**
 * Tests for the schema utilities
 */
import * as z from 'zod';
import { inferSchema, generateJsonExampleFromSchema, validateWithSchema } from '@schema/index';
import { describe, expect, test } from 'bun:test';

describe('Schema utilities', () => {
  describe('inferSchema', () => {
    it('should infer a schema from a type hint', () => {
      const schema = inferSchema<{ name: string; age: number }>('User');
      expect(schema).toBeDefined();
    });

    it('should infer a schema for entity extraction', () => {
      const schema = inferSchema<{
        people: string[];
        organizations: string[];
        locations: string[];
        dates: string[];
      }>('Entity');
      
      expect(schema).toBeDefined();
      
      // Generate an example to verify the structure
      const example = JSON.parse(generateJsonExampleFromSchema(schema));
      expect(example.people).toBeDefined();
      expect(Array.isArray(example.people)).toBe(true);
      expect(example.organizations).toBeDefined();
      expect(example.locations).toBeDefined();
      expect(example.dates).toBeDefined();
    });
  });

  describe('generateJsonExampleFromSchema', () => {
    it('should generate a JSON example from a schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        isActive: z.boolean(),
        tags: z.array(z.string())
      });
      
      const example = JSON.parse(generateJsonExampleFromSchema(schema));
      expect(typeof example.name).toBe('string');
      expect(typeof example.age).toBe('number');
      expect(typeof example.isActive).toBe('boolean');
      expect(Array.isArray(example.tags)).toBe(true);
    });
  });

  describe('validateWithSchema', () => {
    it('should validate a value against a schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });
      
      const valid = validateWithSchema(schema, { name: 'John', age: 30 });
      expect(valid).toEqual({ name: 'John', age: 30 });
      
      // Use the silent option to avoid showing the error message
      const invalid = validateWithSchema(schema, { name: 'John', age: 'thirty' }, { silent: true });
      expect(invalid).toBeNull();
    });
  });
});
