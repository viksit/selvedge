// src/lib/programs/v2/entry.ts
import { createProgramBuilder } from './factory';
import { createCallableBuilder, CallableProgramBuilder } from './proxy';

/**
 * Tagged template entrypoint for program builder.
 * Usage: program`my prompt here ${expr}`
 */
export function program<Ret = any>(strings: TemplateStringsArray, ...exprs: any[]): CallableProgramBuilder<Ret> {
  // Interpolate the prompt
  let prompt = '';
  for (let i = 0; i < strings.length; i++) {
    prompt += strings[i];
    if (i < exprs.length) {
      prompt += String(exprs[i]);
    }
  }
  // Create builder with prompt
  const builder = createProgramBuilder().prompt(prompt);
  return createCallableBuilder(builder);
}
