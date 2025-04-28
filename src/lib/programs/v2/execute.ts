// src/lib/programs/v2/execute.ts
import { ProgramBuilderState } from './state';
import { debug } from '../../utils/debug';
import { store as defaultStore, Store } from '../../storage'; // Import Store type
import { ModelRegistry } from '../../models';
import { ModelDefinition } from '../../types'; // Correct path from v2/ to lib/
import { executeTypeScriptWithInput, executeTypeScriptDetailed } from './typescript';
import * as z from 'zod';
import { formatForPrompt } from 'src/lib/utils/formatter';

/**
 * Tries to generate a basic TypeScript type string representation from a Zod schema.
 * Note: This is a simplified initial implementation and might not cover all Zod types accurately.
 * It primarily relies on the schema's description if available, otherwise falls back to 'any'.
 */
function zodToTsTypeString(schema: z.ZodType<any> | undefined): string {
  if (!schema) {
    return 'any /* Schema not provided */';
  }
  // Using description as a placeholder for a potential more complex conversion
  return schema.description || 'any /* Could not infer specific type from schema */';
}

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
  constructor(message: string, public code?: string, public details?: { cause?: Error, [key: string]: any }) {
    super(message, details?.cause); // Pass cause to parent if available
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
export function buildPrompt(state: ProgramBuilderState<any>, input?: any): string {
  const inputFormat = input !== undefined ? formatForPrompt(input) : 'any /* No input variable provided */';
  debug('program', 'Input:', input)
  // Use the new utility function to get the type string from the schema
  const outputFormat = zodToTsTypeString(state.returnsSchema);

  const examplesString = (state.examples || [])
    .map(ex => `Input:\n\`\`\`\n${formatForPrompt(ex.input)}\n\`\`\`\nOutput:\n\`\`\`\n${formatForPrompt(ex.output)}\n\`\`\``)
    .join('\n\n');

  // Define the context object based on the new prompt structure
  const context = {
    prompt: state.prompt || 'Implement the logic.',
    input_format: inputFormat,
    output_format: outputFormat,
    examples: examplesString || '/* No examples provided */'
  };

  // Replace placeholders in the system prompt
  let filledPrompt = DEFAULT_SYSTEM_PROMPT;
  for (const key in context) {
    const valueToReplace = context[key as keyof typeof context];
    const placeholder = `{${key}}`;
    filledPrompt = filledPrompt.replace(placeholder, valueToReplace);
  }

  debug('program', 'Generated prompt:', filledPrompt);
  return filledPrompt;
}

const DEFAULT_SYSTEM_PROMPT = `
You are an expert TypeScript programmer tasked with writing a single TypeScript function.
Your goal is to write a function that takes 'input' as an argument and returns a value conforming to the 'ReturnType' definition provided.
DO NOT ADD ANY EXPLANATION OR COMMENTS OUTSIDE THE FUNCTION BODY.
ONLY OUTPUT THE TYPESCRIPT CODE BLOCK. NO MARKDOWN.

Input format:
\`\`\`typescript
{input_format}
\`\`\`

Output type definition:
\`\`\`typescript
type ReturnType = {output_format};
\`\`\`

Your task: {prompt}

Examples:
{examples}

Respond ONLY with the TypeScript code block for the function:
\`\`\`typescript
// Function signature: (input: InputType) => ReturnType
function main(input: any): any {{
  // Your code here
}}
\`\`\`
`;
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
          content: DEFAULT_SYSTEM_PROMPT
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

  } catch (e) {
    debug('execution', 'Execution error on previously generated code', (e as Error).message); // <<< Fix: Use error message
    throw new ExecutionError('Execution failed on previously generated code', undefined, { cause: e as Error });
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
    const fullPrompt = buildPrompt(state, input);
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

    // --- 4. Validate Output ---
    if (state.returnsSchema) {
      debug('program:validate', 'Validating execution result against Zod schema...');
      const parsed = state.returnsSchema.safeParse(result);
      if (!parsed.success) {
        debug('program:validate', 'Validation failed:', parsed.error.message); // Log simpler message
        // Include detailed validation error in the ExecutionError
        const validationErrors = JSON.stringify(parsed.error.format(), null, 2);
        throw new ExecutionError(
          `Output validation failed against the expected schema. Details:\n${validationErrors}`,
          undefined,
          { cause: parsed.error, generatedCode: executedCode, executionOutput: result }
        );
      } else {
        debug('program:validate', 'Validation successful.');
        // Use the parsed data potentially? For now, just validate.
        // result = parsed.data; // Optional: Use parsed data if Zod transforms it
      }
    }
    // << END VALIDATION LOGIC >>

    debug('program', 'New code executed successfully.');
    return { result, executedCode };

  } catch (e) {
    debug('execution', 'Execution error on newly generated code', e as Error);
    throw new ExecutionError('Execution failed on newly generated code', undefined, { cause: e as Error });
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
  // Check both state options and execution-time options for forceRegenerate
  const shouldForceRegenerate = state.options?.forceRegenerate || options.forceRegenerate;
  if (persistId && !shouldForceRegenerate) {
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
