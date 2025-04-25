// src/lib/programs/v2/proxy.ts
import { createProgramBuilder, ProgramBuilder } from './factory';

// Type for the callable builder
export type CallableProgramBuilder = ProgramBuilder & ((input: any) => any);

/**
 * Wraps a ProgramBuilder in a Proxy to make it callable and preserve method/property access.
 * For now, calling the builder throws 'Not implemented' (to be replaced in later phases).
 */
export function createCallableBuilder(builder: ProgramBuilder): CallableProgramBuilder {
  // The callable function (stub for now)
  const handlerFn = function (input: any) {
    throw new Error('Program execution not implemented yet');
  };

  // Attach all properties/methods from builder to the function
  const target = Object.assign(handlerFn, builder);

  return new Proxy(target, {
    apply(_target, _thisArg, args) {
      if (args.length !== 1) {
        throw new Error('Program execution expected exactly one argument');
      }
      // Called as a function: builder(input)
      return handlerFn.apply(builder, args[0]);
    },
    get(_target, prop, receiver) {
      if (typeof prop === 'string' && prop in builder) {
        const value = (builder as any)[prop];
        // If method, return a Proxy-wrapped builder for chaining
        if (typeof value === 'function' && prop !== 'constructor') {
          return (...args: any[]) => {
            const nextBuilder = value.apply(builder, args);
            return createCallableBuilder(nextBuilder);
          };
        }
        return value;
      }
      // Otherwise, fallback to target
      return Reflect.get(target, prop, receiver);
    }
  }) as CallableProgramBuilder;
}
