// src/lib/programs/v2/execute.ts
import { ProgramBuilderState } from './state';
import { debug } from '../../utils/debug';
import { store } from '../../storage';
import { ModelRegistry } from '../../models';
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
        { role: 'system', content: 'Generate valid TypeScript code only.' },
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

/**
 * Execute a program: cache → generate → persist → execute.
 */
export async function executeProgram<Ret = any>(
  state: ProgramBuilderState<Ret>,
  input: unknown,
  options: ExecuteOptions = {}
): Promise<Ret> {
  if (!state.model) throw new ProgramError('No model specified for program execution');
  if (!state.prompt) throw new ProgramError('Missing prompt in state');

  debug('program', `executeProgram start model=${state.model}`);

  const modelDef = ModelRegistry.getModel(state.model);
  if (!modelDef) throw new ProgramError(`Model not found: ${state.model}`);
  const adapter = ModelRegistry.getAdapter(modelDef);
  if (!adapter) throw new ProgramError(`Adapter not found for model: ${state.model}`);

  const persistId = state.persistence?.id;

  // 1) Try cache
  if (persistId && !options.forceRegenerate) {
    try {
      const cached = await store.load('program', persistId);
      const code = (cached as any)?.data?.code;
      if (code) {
        debug('persistence', `Using cached code id=${persistId}`);
        const adapted = adaptInputForCode(code, input);
        return (await executeTypeScriptWithInput(code, adapted)) as Ret;
      }
    } catch (e) {
      debug('persistence', 'Cache load failed', e as Error);
    }
  }

  // 2) Generate new code
  let rawCode: string;
  try {
    const prompt = buildPrompt(state.prompt, input, state.examples || []);
    rawCode = await invokeAdapter(adapter, prompt, options.timeout);
  } catch (e) {
    throw new GenerationError('Code generation failed', e as Error);
  }

  // 3) Persist new code if flagged
  if (persistId && state.needsSave) {
    try {
      await store.save('program', persistId, {
        code: rawCode,
        timestamp: Date.now(),
        model: modelDef.model
      });
      debug('persistence', `Saved code id=${persistId}`);
      // Clear save flag
      state.needsSave = false;
    } catch (e) {
      debug('persistence', 'Save failed', e as Error);
    }
  }

  // 4) Execute
  const code = extractCodeFromResponse(rawCode);
  // Populate generated code for inspection
  state.generatedCode = code;
  const adapted = adaptInputForCode(code, input);
  try {
    // Determine unwrapping behavior: explicit option overrides, else state flag (default true)
    const unwrap = options.unwrapResult !== undefined
      ? options.unwrapResult
      : state.unwrapResult !== false;
    if (!unwrap) {
      const { context } = executeTypeScriptDetailed(code, adapted);
      return context.exports as Ret;
    }
    return (await executeTypeScriptWithInput(code, adapted)) as Ret;
  } catch (e) {
    debug('execution', 'Execution error', e as Error);
    throw new ExecutionError('Execution failed', e as Error);
  }
}
