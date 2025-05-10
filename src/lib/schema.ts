/**
 * Lightweight Zod wrappers exposed as `s.*`
 * Each helper returns a Zod schema and carries an optional description,
 * so we can auto‑document prompt signatures later.
 */

import { z } from 'zod';
import { debug } from './utils/debug';

/* ------------------------------------------------------------------ */
/* primitive helpers                                                  */
/* ------------------------------------------------------------------ */

export const string = (desc?: string) =>
  desc ? z.string().describe(desc) : z.string();

export const number = (desc?: string) =>
  desc ? z.number().describe(desc) : z.number();

export const boolean = (desc?: string) =>
  desc ? z.boolean().describe(desc) : z.boolean();

/* ------------------------------------------------------------------ */
/* composites                                                         */
/* ------------------------------------------------------------------ */

export const array = <T>(item: z.ZodType<T>, desc?: string) =>
  desc ? z.array(item).describe(desc) : z.array(item);

export const shape = <T extends z.ZodRawShape>(obj: T) => z.object(obj);

/* ------------------------------------------------------------------ */
/* re‑exports & namespace                                             */
/* ------------------------------------------------------------------ */

export { z };                    // so users can reach full Zod if needed

/* default export lets you `import { s } from "selvedge"` */
const s = { string, number, boolean, array, shape, z };
export default s;

/* Type helpers for internal use */
export type Schema<T> = z.ZodType<T>;
export type Infer<T extends Schema<any>> = z.infer<T>;

/* Exported schema helpers */
// In: src/lib/prompts/template.ts

// Ensure you have the necessary Zod types imported, or use z.<TypeName>
// For example:
// import { z, ZodString, ZodNumber, ZodBoolean, ZodArray, ZodObject, ZodOptional, ZodNullable, ZodEnum, ZodLiteral, ZodUnion, ZodIntersection, ZodTuple, ZodDate, ZodNativeEnum, ZodEffects } from 'zod';
// Or if you only have `import * as z from 'zod';` then use `z.ZodString`, `z.ZodEnum` etc.


/**
 * Generates a simple JSON example for a given schema shape, supporting a richer typeset.
 */
export function appendSchemaTypeHints(shape: z.ZodRawShape): string {
  const example: Record<string, any> = {};
  debug('prompt', 'Building schema type hints for: %o', Object.keys(shape));
  
  Object.entries(shape).forEach(([key, schemaValue]) => {
    if (schemaValue === null || schemaValue === undefined) {
      example[key] = null;
      debug('prompt', 'Field %s has null or undefined schema definition', key);
      return;
    }

    // --- START OF EXPANDED TYPE HANDLING ---
    if (schemaValue instanceof z.ZodString) {
      example[key] = schemaValue.isUUID ? "uuid_string" : 
                     schemaValue.isEmail ? "email_string" :
                     schemaValue.isURL ? "url_string" :
                     schemaValue.isDatetime ? "datetime_string" :
                     "string";
      if (schemaValue.minLength !== null) example[key] += ` (min: ${schemaValue.minLength})`;
      if (schemaValue.maxLength !== null) example[key] += ` (max: ${schemaValue.maxLength})`;
      debug('prompt', 'Field %s is ZodString', key);
    } else if (schemaValue instanceof z.ZodNumber) {
      example[key] = schemaValue.isInt ? 0 : 0.0;
      if (schemaValue.minValue !== null) example[key] += ` (min: ${schemaValue.minValue})`;
      if (schemaValue.maxValue !== null) example[key] += ` (max: ${schemaValue.maxValue})`;
      debug('prompt', 'Field %s is ZodNumber', key);
    } else if (schemaValue instanceof z.ZodBoolean) {
      example[key] = false;
      debug('prompt', 'Field %s is ZodBoolean', key);
    } else if (schemaValue instanceof z.ZodArray) {
      // For arrays, try to get a hint for the element type
      const elementType = schemaValue.element;
      // Create a dummy shape for the element type to recursively get its hint
      const elementHintShape: z.ZodRawShape = { item: elementType };
      const elementHint = JSON.parse(appendSchemaTypeHints(elementHintShape)); // Parse to get the value
      example[key] = [elementHint.item];
      debug('prompt', 'Field %s is ZodArray with element type hint: %o', key, elementHint.item);
    } else if (schemaValue instanceof z.ZodObject) {
      // Recursively call for nested objects to get a full structure
      example[key] = JSON.parse(appendSchemaTypeHints(schemaValue.shape)); // Parse to embed as object
      debug('prompt', 'Field %s is ZodObject', key);
    } else if (schemaValue instanceof z.ZodOptional || schemaValue instanceof z.ZodNullable) {
      // Unwrap the optional/nullable type and get hint for the inner type
      const innerType = schemaValue._def.innerType;
      const innerHintShape: z.ZodRawShape = { inner: innerType };
      const innerHint = JSON.parse(appendSchemaTypeHints(innerHintShape));
      example[key] = innerHint.inner; // Could also be `null` or `undefined` based on preference
      debug('prompt', 'Field %s is %s, inner type hint: %o', key, schemaValue instanceof z.ZodOptional ? 'ZodOptional' : 'ZodNullable', innerHint.inner);
    } else if (schemaValue instanceof z.ZodEnum) {
      // For enums, provide the first value as an example
      example[key] = schemaValue.options[0] || "enum_value";
      debug('prompt', 'Field %s is ZodEnum with options: %o', key, schemaValue.options);
    } else if (schemaValue instanceof z.ZodNativeEnum) {
        // For native enums, provide the first value as an example
        // Accessing values of a native enum is a bit trickier, often it's an object
        const enumValues = Object.values(schemaValue.unwrap()._def.values);
        example[key] = enumValues[0] !== undefined ? enumValues[0] : "native_enum_value";
        debug('prompt', 'Field %s is ZodNativeEnum with values: %o', key, enumValues);
    } else if (schemaValue instanceof z.ZodLiteral) {
      example[key] = schemaValue.value;
      debug('prompt', 'Field %s is ZodLiteral with value: %o', key, schemaValue.value);
    } else if (schemaValue instanceof z.ZodUnion) {
      // For unions, provide a hint for the first option, or a descriptive string
      const firstOptionHintShape: z.ZodRawShape = { option1: schemaValue.options[0] };
      const firstOptionHint = JSON.parse(appendSchemaTypeHints(firstOptionHintShape));
      example[key] = firstOptionHint.option1; // Or a string like "string | number"
      debug('prompt', 'Field %s is ZodUnion, showing hint for first option', key);
    } else if (schemaValue instanceof z.ZodIntersection) {
      // Intersections are complex to represent simply. Could merge hints or just describe.
      example[key] = { "intersection_type": "refer_to_schema_definition" };
      debug('prompt', 'Field %s is ZodIntersection', key);
    } else if (schemaValue instanceof z.ZodTuple) {
      // For tuples, provide hints for each item
      const itemHints = schemaValue.items.map((itemSchema: z.ZodTypeAny, index: number) => {
        const itemHintShape: z.ZodRawShape = { [`item${index}`]: itemSchema };
        return JSON.parse(appendSchemaTypeHints(itemHintShape))[`item${index}`];
      });
      example[key] = itemHints;
      debug('prompt', 'Field %s is ZodTuple with item hints: %o', key, itemHints);
    } else if (schemaValue instanceof z.ZodDate) {
      example[key] = new Date().toISOString().split('T')[0]; // e.g., "YYYY-MM-DD"
      debug('prompt', 'Field %s is ZodDate', key);
    } else if (schemaValue instanceof z.ZodEffects) {
        // For ZodEffects (transform, refine), try to get the hint from the original schema
        const originalSchema = schemaValue.innerType();
        const originalHintShape: z.ZodRawShape = { inner: originalSchema };
        const originalHint = JSON.parse(appendSchemaTypeHints(originalHintShape));
        example[key] = originalHint.inner;
        debug('prompt', 'Field %s is ZodEffects, showing hint for inner schema', key);
    }
    // Add more Zod types as needed: ZodRecord, ZodMap, ZodSet, ZodFunction, ZodPromise, ZodBranded, ZodPipeline etc.
    else {
      let typeName = "unknown_type";
      if (schemaValue && schemaValue._def && schemaValue._def.typeName) {
        typeName = schemaValue._def.typeName.replace('Zod', '').toLowerCase();
      } else if (schemaValue && schemaValue.constructor) {
        typeName = schemaValue.constructor.name.replace('Zod', '').toLowerCase();
      }
      example[key] = `${typeName}_value`;
      debug('prompt', 'Field %s has an unrecognized Zod type or structure: %s', key, typeName);
    }
    // --- END OF EXPANDED TYPE HANDLING ---
  });
  
  return JSON.stringify(example, null, 2);
}

// ... rest of template.ts ...