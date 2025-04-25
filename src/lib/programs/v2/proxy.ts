// src/lib/programs/v2/proxy.ts
import { ProgramBuilder } from './factory';

// Type for the callable builder
export type CallableProgramBuilder<Ret = any> = ProgramBuilder<Ret> & ((input: any) => Ret);

/**
 * Wraps a ProgramBuilder in a Proxy to make it callable and preserve method/property access.
 * For now, calling the builder throws 'Not implemented' (to be replaced in later phases).
 */
export function createCallableBuilder<Ret = any>(builder: ProgramBuilder<Ret>): CallableProgramBuilder<Ret> {
  // The callable function (stub for now)
  const handlerFn = function (_input: any): Ret {
    throw new Error('Program execution not implemented yet');
  };

  // Attach all properties/methods from builder to the function
  const target = Object.assign(handlerFn, builder);

  return new Proxy(target, {
    apply(_target, _thisArg, args: any[]) {
      if (args.length !== 1) {
        throw new Error('Program execution expected exactly one argument');
      }
      // Called as a function: builder(input)
      return handlerFn.call(builder, args[0]);
    },
    get(_target, prop, receiver) {
      if (typeof prop === 'string' && prop in builder) {
        const value = (builder as any)[prop];
        if (typeof value === 'function' && prop !== 'constructor') {
          return (...args: any[]) => {
            const next = value.apply(builder, args) as ProgramBuilder<any>;
            return createCallableBuilder(next);
          };
        }
        return value;
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as CallableProgramBuilder<Ret>;
}
