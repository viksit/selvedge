/**
 * Lightweight Zod wrappers exposed as `s.*`
 * Each helper returns a Zod schema and carries an optional description,
 * so we can auto‑document prompt signatures later.
 */

import { z } from 'zod';

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
