/**
 * Example generation utilities for Zod schemas
 * 
 * This module provides functions to generate example values from Zod schemas.
 */
import * as z from 'zod';

/**
 * Generate an example value from a Zod schema
 * 
 * @param schema - The schema to generate an example for
 * @returns An example value that matches the schema
 */
export function generateExampleFromSchema(schema: z.ZodType<any>): any {
  // Handle different schema types
  if (schema instanceof z.ZodObject) {
    return generateObjectExample(schema);
  } else if (schema instanceof z.ZodArray) {
    return generateArrayExample(schema);
  } else if (schema instanceof z.ZodString) {
    return generateStringExample(schema);
  } else if (schema instanceof z.ZodNumber) {
    return generateNumberExample(schema);
  } else if (schema instanceof z.ZodBoolean) {
    return generateBooleanExample(schema);
  } else if (schema instanceof z.ZodEnum) {
    return generateEnumExample(schema);
  } else if (schema instanceof z.ZodUnion) {
    return generateUnionExample(schema);
  } else if (schema instanceof z.ZodLiteral) {
    return schema._def.value;
  } else if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    return generateExampleFromSchema(schema._def.innerType);
  } else {
    // Default fallback
    return "example";
  }
}

/**
 * Generate an example object from a Zod object schema
 */
function generateObjectExample(schema: z.ZodObject<any>): Record<string, any> {
  const shape = schema._def.shape();
  const result: Record<string, any> = {};
  
  for (const [key, fieldSchema] of Object.entries(shape)) {
    result[key] = generateExampleFromSchema(fieldSchema as z.ZodType<any>);
  }
  
  return result;
}

/**
 * Generate an example array from a Zod array schema
 */
function generateArrayExample(schema: z.ZodArray<any>): any[] {
  // Generate a single example item
  const exampleItem = generateExampleFromSchema(schema.element);
  return [exampleItem];
}

/**
 * Generate an example string from a Zod string schema
 */
function generateStringExample(schema: z.ZodString): string {
  // Check for specific string formats
  if (schema._def.checks) {
    for (const check of schema._def.checks) {
      if (check.kind === 'email') return 'user@example.com';
      if (check.kind === 'url') return 'https://example.com';
      if (check.kind === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (check.kind === 'regex') {
        // For regex patterns, return a simple example
        return 'example';
      }
    }
  }
  
  // Default string example
  return 'example';
}

/**
 * Generate an example number from a Zod number schema
 */
function generateNumberExample(schema: z.ZodNumber): number {
  // Check for specific number constraints
  if (schema._def.checks) {
    for (const check of schema._def.checks) {
      if (check.kind === 'int') return 42;
      if (check.kind === 'min' && check.value > 0) return check.value;
      if (check.kind === 'max' && check.value < 0) return check.value;
    }
  }
  
  // Default number example
  return 0.5;
}

/**
 * Generate an example boolean from a Zod boolean schema
 */
function generateBooleanExample(_schema: z.ZodBoolean): boolean {
  return true;
}

/**
 * Generate an example enum value from a Zod enum schema
 */
function generateEnumExample(schema: z.ZodEnum<any>): string {
  // Return the first enum value
  return schema._def.values[0];
}

/**
 * Generate an example for a union type
 */
function generateUnionExample(schema: z.ZodUnion<any>): any {
  // Use the first option in the union
  return generateExampleFromSchema(schema._def.options[0]);
}

/**
 * Generate a formatted JSON example string from a schema
 * 
 * @param schema - The schema to generate an example for
 * @returns A formatted JSON string representing an example value
 */
export function generateJsonExampleFromSchema(schema: z.ZodType<any>): string {
  const example = generateExampleFromSchema(schema);
  return JSON.stringify(example, null, 2);
}
