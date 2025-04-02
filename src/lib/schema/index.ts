/**
 * Schema utilities for Selvedge
 * 
 * This module provides utilities for working with Zod schemas in the Selvedge library.
 */
import * as z from 'zod';
import { generateExampleFromSchema, generateJsonExampleFromSchema } from './examples';
import { inferSchema, inferSchemaFromObject, createSchema } from './inference';

// Export all the functions
export {
  z,
  generateExampleFromSchema,
  generateJsonExampleFromSchema,
  inferSchema,
  inferSchemaFromObject,
  createSchema
};

// Type helpers
export type InferZodSchema<T> = T extends z.ZodType<any> ? T : z.ZodType<T>;

/**
 * Validate a value against a schema
 * 
 * @param schema - The schema to validate against
 * @param value - The value to validate
 * @param options - Validation options
 * @returns The validated value or null if validation fails
 */
export function validateWithSchema<T>(
  schema: z.ZodType<T>, 
  value: unknown, 
  options: { silent?: boolean } = {}
): T | null {
  try {
    return schema.parse(value);
  } catch (error) {
    if (!options.silent) {
      // In production code, we want to see the warning
      console.warn('Schema validation failed:', error instanceof Error ? error.message : error);
    }
    return null;
  }
}

/**
 * Create a schema cache to avoid recreating schemas
 */
export const schemaCache = new Map<string, z.ZodType<any>>();
