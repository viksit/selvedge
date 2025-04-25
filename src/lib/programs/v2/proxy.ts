// src/lib/programs/v2/proxy.ts
import { ProgramBuilder } from './factory';
import { executeProgram } from './execute';
import { debug } from '../../utils/debug';

// For tracking proxy method calls
const proxyDebugEnabled = true;

// Type for the callable builder
export type CallableProgramBuilder<Ret = any> = ProgramBuilder<Ret> & ((input: any) => Promise<Ret>);

/**
 * Wraps a ProgramBuilder in a Proxy to make it callable and preserve method/property access.
 * When called as a function, executes the program with the given input.
 */
export function createCallableBuilder<Ret = any>(builder: ProgramBuilder<Ret>): CallableProgramBuilder<Ret> {
  debug('program', `Creating callable proxy for program builder`);
  
  // The callable function that executes the program
  const handlerFn = async function (input: any): Promise<Ret> {
    debug('program', `Callable proxy invoked with input type: ${typeof input}`);
    debug('program', `Program state at execution: model=${builder.state.model}, has prompt=${!!builder.state.prompt}`);
    return await executeProgram<Ret>(builder.state, input);
  };

  // Attach all properties/methods from builder to the function
  const target = Object.assign(handlerFn, builder);
  
  debug('program', `Builder properties attached to proxy function`);

  return new Proxy(target, {
    apply(_target, _thisArg, args: any[]) {
      debug('program', `Proxy apply trap: executing program as function`);
      
      if (args.length !== 1) {
        debug('program', `Error: Program execution expected exactly one argument, got ${args.length}`);
        throw new Error('Program execution expected exactly one argument');
      }
      
      // Called as a function: builder(input)
      // Return the promise from handlerFn
      return handlerFn.call(builder, args[0]);
    },
    get(_target, prop, receiver) {
      // Don't log Symbol properties to avoid noise
      if (typeof prop === 'string' && proxyDebugEnabled) {
        debug('program', `Proxy get trap: accessing property '${prop}'`);
      }
      
      if (typeof prop === 'string' && prop in builder) {
        const value = (builder as any)[prop];
        if (typeof value === 'function' && prop !== 'constructor') {
          return (...args: any[]) => {
            debug('program', `Calling builder method: ${prop}(${args.map(a => typeof a).join(', ')})`);
            const next = value.apply(builder, args) as ProgramBuilder<any>;
            debug('program', `Method ${prop} returned new builder state, creating new proxy`);
            return createCallableBuilder(next);
          };
        }
        return value;
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as CallableProgramBuilder<Ret>;
}
