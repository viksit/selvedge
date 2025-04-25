// src/lib/programs/v2/execute.ts
import { ProgramBuilderState } from './state';
import { debug } from '../../utils/debug';
import { store as defaultStore, Store } from '../../storage'; // Import Store type
import { ModelRegistry } from '../../models';
import { ModelDefinition } from '../../types'; // Correct path from v2/ to lib/
import { executeTypeScriptWithInput, executeTypeScriptDetailed } from './typescript';

/**
 * Base error for execution pipeline.
 */
class ProgramError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'ProgramError';
  }
}

/**
 * Error during code generation via LLM.
 */
class GenerationError extends ProgramError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'GenerationError';
  }
}

/**
 * Error during code execution in sandbox.
 */
class ExecutionError extends ProgramError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ExecutionError';
  }
}

/**
 * Adapt input for code that uses string operations.
 */
function adaptInputForCode(code: string, input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const patterns = ['replace(', 'toLowerCase(', 'split(', 'trim('];
  if (patterns.some(p => code.includes(p)) && typeof (input as any).text === 'string') {
    debug('program', 'Extracting text property for string-based code');
    return (input as any).text;
  }
  return input;
}

/**
 * Extract the first markdown code block, or return the raw response.
 */
function extractCodeFromResponse(response: string): string {
  const regex = /```(?:\w+)?\s*([\s\S]*?)```/g;
  const matches = [...response.matchAll(regex)];
  if (matches.length > 0) return matches[0][1].trim();
  return response.trim();
}

/**
 * Build prompt by appending examples and current input.
 */
function buildPrompt(
  template: string,
  input: unknown,
  examples: Array<{ input: any; output: any }> = []
): string {
  let prompt = template;
  for (const ex of examples) {
    prompt += `\n\nInput: ${JSON.stringify(ex.input)}\nOutput: ${JSON.stringify(ex.output)}`;
  }
  prompt += `\n\nInput: ${JSON.stringify(input)}\nOutput:`;
  return prompt;
}

/**
 * Invoke model via chat or complete endpoint.
 */
async function invokeAdapter(
  adapter: any,
  prompt: string,
  timeoutMs?: number
): Promise<string> {
  const opts = timeoutMs != null ? { timeout: timeoutMs } : {};
  debug('llm', 'Calling model endpoint');
  if (typeof adapter.chat === 'function') {
    const res = await adapter.chat(
      [
        {
          role: 'system',
          content: 'You are a code generation assistant. Respond ONLY with the raw code block for the requested function, starting directly with ``` and ending directly with ```. Do NOT include *any* introductory text, explanations, examples, comments, or markdown formatting *outside* the code block. Do not issue any console.log statements, test cases, or usage examples either.'
        },
        { role: 'user', content: prompt }
      ],
      opts
    );
    return typeof res === 'string' ? res : res.content;
  }
  return await adapter.complete(prompt, opts);
}

/**
 * Options for executeProgram.
 */
export interface ExecuteOptions {
  /** Force regeneration even if cache exists. */
  forceRegenerate?: boolean;
  /** Timeout for LLM calls (ms). */
  timeout?: number;
  /** If false, return full VM context instead of only result */
  unwrapResult?: boolean;
}

// ==================================
// Refactored Helper Functions
// ==================================

type CacheResult<Ret = any> =
  | { type: 'cache_hit'; result: Ret }
  | { type: 'cache_miss' }
  | { type: 'cache_error'; error: Error };

/**
 * Attempts to load and execute code from the cache.
 */
async function attemptCacheExecution<Ret = any>(
  persistId: string,
  store: Store,
  input: unknown,
  options: ExecuteOptions
): Promise<CacheResult<Ret>> {
  debug('persistence', `Attempting cache load for program '${persistId}'`);
  let cachedData: { code: string } | null = null;
  try {
    // Store.load now returns null on cache miss (file not found)
    cachedData = await store.load('program', persistId);
  } catch (loadError) {
    // Handle unexpected errors during the load process itself
    debug('persistence', `Unexpected error loading cache for '${persistId}':`, loadError);
    return { type: 'cache_error', error: loadError as Error };
  }

  if (cachedData === null) {
    debug('persistence', `Cache miss for program '${persistId}'`);
    return { type: 'cache_miss' };
  }

  debug('persistence', `Cache hit for program '${persistId}'`);
  try {
    // Apply extractor to cached code
    const code = extractCodeFromResponse(cachedData.code);
    if (!code) {
      debug('persistence', `Cached code for '${persistId}' was empty after extraction.`);
      // Treat empty extracted code as a form of cache corruption
      return { type: 'cache_error', error: new Error(`Cached code for '${persistId}' is empty or invalid.`) };
    }

    debug('persistence', `Using cleaned cached code id=${persistId}`);
    const adapted = adaptInputForCode(code, input);

    // Determine unwrapping behavior for execution
    const unwrap = options.unwrapResult !== false; // Default true

    let result: Ret;
    if (!unwrap) {
      const { context } = executeTypeScriptDetailed(code, adapted);
      result = context.exports as Ret;
    } else {
      result = (await executeTypeScriptWithInput(code, adapted)) as Ret;
    }
    return { type: 'cache_hit', result };

  } catch (executeError) {
    // Errors during extraction or execution of cached code indicate corruption
    debug('execution', `Execution error on cached code '${persistId}':`, executeError);
    // Throw specific error to prevent proceeding with bad cache
    throw new ExecutionError(`Execution failed on cached code for '${persistId}'. Cache may be corrupt.`, executeError as Error);
  }
}

/**
 * Generates, extracts, and executes new code.
 * Throws GenerationError or ExecutionError on failure.
 */
async function generateAndExecuteNewCode<Ret = any>(
  state: ProgramBuilderState<Ret>,
  adapter: any,
  input: unknown,
  options: ExecuteOptions
): Promise<{ result: Ret; executedCode: string }> {
  debug('llm', 'Invoking LLM for code generation');
  let rawCode: string;
  let llmResponse: string;
  try {
    const fullPrompt = buildPrompt(state.prompt!, input, state.examples || []);
    llmResponse = await invokeAdapter(adapter, fullPrompt, options.timeout);
    rawCode = extractCodeFromResponse(llmResponse);
    if (!rawCode) {
      throw new GenerationError('Code generation failed: LLM returned empty code after extraction');
    }
  } catch (e) {
    if (e instanceof GenerationError) throw e;
    throw new GenerationError('Code generation failed during LLM call or extraction', e as Error);
  }

  const executedCode = rawCode; // Use the extracted code for execution

  // Populate generated code for inspection *before* execution attempt
  state.generatedCode = executedCode;
  const adapted = adaptInputForCode(executedCode, input);

  try {
    // Determine unwrapping behavior
    const unwrap = options.unwrapResult !== false; // Default true

    let result: Ret;
    if (!unwrap) {
      const { context } = executeTypeScriptDetailed(executedCode, adapted);
      result = context.exports as Ret;
    } else {
      result = (await executeTypeScriptWithInput(executedCode, adapted)) as Ret;
    }
    debug('program', 'New code executed successfully.');
    return { result, executedCode };

  } catch (e) {
    debug('execution', 'Execution error on newly generated code', e as Error);
    throw new ExecutionError('Execution failed on newly generated code', e as Error);
  }
}

/**
 * Persists successfully executed code to the store.
 */
async function persistGeneratedCode(
  persistId: string,
  store: Store,
  codeToPersist: string,
  state: ProgramBuilderState<any>,
  modelDef: ModelDefinition
): Promise<void> {
  try {
    await store.save('program', persistId, {
      code: codeToPersist, // Save the successfully executed code
      prompt: state.prompt!, // Save the original prompt
      timestamp: Date.now(),
      model: modelDef.model
    });
    debug('persistence', `Saved successfully executed code id=${persistId}`);
  } catch (saveError) {
    // Log persistence errors but don't necessarily block returning the result
    debug('persistence', `Failed to save code id=${persistId}:`, saveError);
    // Optionally, re-throw if persistence failure is critical
    // throw new ProgramError('Failed to persist generated code', saveError as Error);
  }
}

// ==================================
// Refactored executeProgram (Orchestrator)
// ==================================
export async function executeProgram<Ret = any>(
  state: ProgramBuilderState<Ret>,
  input: unknown,
  options: ExecuteOptions = {}
): Promise<Ret> {
  // --- 1. Validation ---
  if (!state.model) throw new ProgramError('No model specified for program execution');
  if (!state.prompt) throw new ProgramError('Missing prompt in state');

  debug('program', `executeProgram start model=${state.model}`);

  const modelDef = ModelRegistry.getModel(state.model);
  if (!modelDef) throw new ProgramError(`Model not found: ${state.model}`);
  const adapter = ModelRegistry.getAdapter(modelDef);
  if (!adapter) throw new ProgramError(`Adapter not found for model: ${state.model}`);

  const persistId = state.persistId;
  const store = defaultStore; // Use the singleton store instance

  // --- 2. Cache Attempt ---
  if (persistId && !options.forceRegenerate) {
    // attemptCacheExecution handles load errors internally but throws on execution errors
    const cacheAttempt = await attemptCacheExecution<Ret>(persistId, store, input, options);

    if (cacheAttempt.type === 'cache_hit') {
      // Successfully executed from cache
      return cacheAttempt.result;
    } else if (cacheAttempt.type === 'cache_error') {
      // Log unexpected load error, but proceed to generate new code
      // Execution errors on cached code are thrown by attemptCacheExecution
      debug('program', `Cache load error for '${persistId}', proceeding to generate:`, cacheAttempt.error);
    } else {
      // Cache miss, proceed to generate
      debug('program', `Cache miss for '${persistId}', proceeding to generate.`);
    }
  }

  // --- 3. Generation & Execution ---
  // This function throws if generation or execution fails
  const { result, executedCode } = await generateAndExecuteNewCode<Ret>(
    state,
    adapter,
    input,
    options
  );

  // --- 4. Persistence (only if execution succeeded) ---
  if (persistId) {
    // Persist the code that was *successfully* executed
    // Use await to ensure persistence completes or fails before returning
    await persistGeneratedCode(persistId, store, executedCode, state, modelDef);
  }

  // --- 5. Return Result ---
  return result;
}
