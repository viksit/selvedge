// src/lib/programs/v2/proxy.ts
import type { ProgramBuilder } from './factory';
import { executeProgram, ExecuteOptions } from './execute';
import { debug } from '../../utils/debug';

// For tracking proxy method calls
const proxyDebugEnabled = true;

/**
 * Callable builder: methods + call signature for program execution.
 */
export interface CallableProgramBuilder<Ret = any> {
  /** Execute the program with input */
  (input: any, options?: ExecuteOptions): Promise<Ret>;
  /** Set prompt and return new callable builder */
  prompt(prompt: string): CallableProgramBuilder<Ret>;
  /** Set model and return new callable builder */
  model(model: string): CallableProgramBuilder<Ret>;
  /** Set options and return new callable builder */
  options(options: Record<string, any>): CallableProgramBuilder<Ret>;
  /** Set persistence ID and return new callable builder */
  persist(id: string): CallableProgramBuilder<Ret>;
  /** Set examples and return new callable builder */
  examples(examples: Array<{ input: any; output: any }>): CallableProgramBuilder<Ret>;
  /** Specify return type (type-only) and return new callable builder */
  returns<NewRet>(): CallableProgramBuilder<NewRet>;
  /** Specify return type with value and return new callable builder */
  returns<NewRet>(returnsType: NewRet): CallableProgramBuilder<NewRet>;
  /** Disable automatic result unwrapping; return full context */
  raw(): CallableProgramBuilder<Ret>;
  /** Current builder state */
  readonly state: import('./state').ProgramBuilderState<Ret>;
}

/**
 * Wraps a ProgramBuilder in a Proxy to make it callable and preserve method/property access.
 * When called as a function, executes the program with the given input.
 */
export function createCallableBuilder<Ret = any>(builder: ProgramBuilder<Ret>): CallableProgramBuilder<Ret> {
  debug('program', `Creating callable proxy for program builder`);
  
  // The callable function that executes the program
  const handlerFn = async function (input: any, options?: ExecuteOptions): Promise<Ret> {
    debug('program', `Callable proxy invoked with input type: ${typeof input}, options: ${JSON.stringify(options)}`);
    debug('program', `Program state at execution: model=${builder.state.model}, has prompt=${!!builder.state.prompt}`);
    // Pass options (or default empty object) to executeProgram
    return await executeProgram<Ret>(builder.state, input, options ?? {});
  };

  // Attach all properties/methods from builder to the function
  const target = Object.assign(handlerFn, builder);
  
  debug('program', `Builder properties attached to proxy function`);

  return new Proxy(target, {
    apply(_target, _thisArg, args: any[]) {
      debug('program', `Proxy apply trap: executing program as function`);
      
      // Allow 1 (input) or 2 (input, options) arguments
      if (args.length < 1 || args.length > 2) {
        debug('program', `Error: Program execution expected 1 or 2 arguments (input, [options]), got ${args.length}`);
        throw new Error('Program execution expected 1 or 2 arguments (input, [options])');
      }
      if (!builder.state.model) {
        debug('program', 'Error: No model specified for program execution');
        throw new Error('No model specified for program execution');
      }
      
      // Called as a function: builder(input, options?)
      // Pass both input (args[0]) and options (args[1]) to handlerFn
      return handlerFn.call(builder, args[0], args[1]);
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
