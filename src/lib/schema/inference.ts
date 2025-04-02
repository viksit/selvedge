/**
 * Schema inference utilities for TypeScript types
 * 
 * This module provides functions to infer Zod schemas from TypeScript types.
 * Since TypeScript types are erased at runtime, this uses a best-effort approach
 * based on property names and patterns.
 */
import * as z from 'zod';
import { schemaCache } from './index';

/**
 * Infer a Zod schema from a TypeScript type
 * 
 * @param typeHint - Optional type hint to help with inference
 * @returns A Zod schema that approximates the TypeScript type
 */
export function inferSchema<T>(typeHint?: string): z.ZodType<T> {
  // If we have a cached schema for this type, return it
  const cacheKey = typeHint || 'anonymous';
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey) as z.ZodType<T>;
  }
  
  // Create a proxy object to capture property access
  const proxy = createTypeProxy();
  
  // Use the proxy as a placeholder for the type
  const schema = inferSchemaFromProxy(proxy as unknown as T, typeHint);
  
  // Cache the schema for future use
  schemaCache.set(cacheKey, schema);
  
  return schema;
}

/**
 * Create a proxy object that tracks property access
 */
function createTypeProxy(): Record<string, any> {
  const properties: Record<string, any> = {};
  
  return new Proxy({}, {
    get(_target, prop) {
      const key = String(prop);
      
      // If we haven't seen this property before, create a new proxy for it
      if (!(key in properties)) {
        properties[key] = createTypeProxy();
      }
      
      return properties[key];
    }
  });
}

/**
 * Infer a schema from a proxy object
 */
function inferSchemaFromProxy(_proxy: any, typeHint?: string): z.ZodType<any> {
  // If we have a type hint, use it to guide inference
  if (typeHint) {
    return inferSchemaFromTypeHint(typeHint);
  }
  
  // Default to any schema
  return z.any();
}

/**
 * Infer a schema from a type hint string
 */
function inferSchemaFromTypeHint(typeHint: string): z.ZodType<any> {
  // Handle array types
  if (typeHint.endsWith('[]')) {
    const itemType = typeHint.slice(0, -2);
    return z.array(inferSchemaFromTypeHint(itemType));
  }
  
  // Handle primitive types
  switch (typeHint) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'any':
      return z.any();
    case 'unknown':
      return z.unknown();
    case 'null':
      return z.null();
    case 'undefined':
      return z.undefined();
    default:
      // For complex types, try to infer from the type name
      return inferSchemaFromTypeName(typeHint);
  }
}

/**
 * Infer a schema from a type name
 */
function inferSchemaFromTypeName(typeName: string): z.ZodType<any> {
  // Handle common patterns in type names
  
  // SentimentResult -> probably an object with sentiment-related properties
  if (typeName.includes('Sentiment')) {
    return z.object({
      score: z.number(),
      label: z.enum(['positive', 'negative', 'neutral']),
      confidence: z.number()
    });
  }
  
  // EntityResult or similar -> probably an object with entity-related properties
  if (typeName.includes('Entity')) {
    return z.object({
      people: z.array(z.string()),
      organizations: z.array(z.string()),
      locations: z.array(z.string()),
      dates: z.array(z.string())
    });
  }
  
  // Default to an empty object schema
  return z.object({});
}

/**
 * Infer a schema from an object structure
 * 
 * @param obj - The object to infer a schema from
 * @returns A Zod schema that matches the object structure
 */
export function inferSchemaFromObject(obj: Record<string, any>): z.ZodType<any> {
  const shape: Record<string, z.ZodType<any>> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    shape[key] = inferSchemaFromValue(value);
  }
  
  return z.object(shape);
}

/**
 * Infer a schema from a value
 */
function inferSchemaFromValue(value: any): z.ZodType<any> {
  if (value === null) return z.null();
  if (value === undefined) return z.undefined();
  
  switch (typeof value) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'object':
      if (Array.isArray(value)) {
        // If the array is empty, default to string array
        if (value.length === 0) return z.array(z.string());
        // Otherwise, infer from the first item
        return z.array(inferSchemaFromValue(value[0]));
      }
      return inferSchemaFromObject(value);
    default:
      return z.any();
  }
}

/**
 * Create a schema from a TypeScript interface
 * 
 * This is a helper function for creating schemas from interfaces.
 * It's used when we can't infer the schema automatically.
 * 
 * @example
 * ```ts
 * interface User {
 *   name: string;
 *   age: number;
 * }
 * 
 * const UserSchema = createSchema<User>({
 *   name: z.string(),
 *   age: z.number()
 * });
 * ```
 */
export function createSchema<T>(shape: Record<string, z.ZodType<any>>): z.ZodObject<any, any, any, T> {
  return z.object(shape) as z.ZodObject<any, any, any, T>;
}
