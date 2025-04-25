// src/lib/programs/v2/typescript.ts
import * as ts from 'typescript';
import * as vm from 'vm';
import { debug } from '../../utils/debug';

/**
 * Analyzes TypeScript code using AST to extract useful information
 * @param code TypeScript code to analyze
 * @returns Analysis results including main function and result variables
 */
function analyzeTypeScriptCode(code: string): {
  mainFunction?: string;
  resultVariables: string[];
  hasExplicitReturn: boolean;
} {
  // Create source file from code
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    code,
    ts.ScriptTarget.Latest,
    true
  );
  
  const analysis = {
    mainFunction: undefined as string | undefined,
    resultVariables: [] as string[],
    hasExplicitReturn: false
  };
  
  // Single AST traversal to gather all needed information
  const visit = (node: ts.Node) => {
    // Find function declarations (function name() {})
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (!analysis.mainFunction) {
        analysis.mainFunction = node.name.text;
        debug('program', `Found main function: ${analysis.mainFunction}`);
      }
    }
    
    // Find arrow functions or function expressions assigned to variables
    if (ts.isVariableDeclaration(node) && 
        node.name && ts.isIdentifier(node.name) && 
        node.initializer && 
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      if (!analysis.mainFunction) {
        analysis.mainFunction = node.name.text;
        debug('program', `Found main function (variable): ${analysis.mainFunction}`);
      }
    }
    
    // Find potential result variables
    if (ts.isVariableDeclaration(node) && 
        node.name && ts.isIdentifier(node.name)) {
      const varName = node.name.text;
      // Look for semantic clues in variable names
      if (varName.match(/result|output|return|response|answer|value|frequency|count/i)) {
        analysis.resultVariables.push(varName);
        debug('program', `Found potential result variable: ${varName}`);
      }
    }
    
    // Check for explicit return statements
    if (ts.isReturnStatement(node) && node.expression) {
      analysis.hasExplicitReturn = true;
    }
    
    // Continue traversal
    ts.forEachChild(node, visit);
  };
  
  // Start traversal
  ts.forEachChild(sourceFile, visit);
  
  return analysis;
}

/**
 * Compiles TypeScript code to JavaScript
 * @param code TypeScript code to compile
 * @returns Compiled JavaScript and any diagnostics
 */
function compileTypeScript(code: string): {
  compiledCode: string;
  diagnostics: ts.Diagnostic[];
} {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: false,
      esModuleInterop: true,
    },
    reportDiagnostics: true
  });

  return {
    compiledCode: result.outputText,
    diagnostics: result.diagnostics || []
  };
}

/**
 * Sanitizes input to prevent injection attacks
 * @param input The input to sanitize
 * @returns Sanitized input
 */
function sanitizeInput(input: any): any {
  try {
    // Simple but effective sanitization through JSON serialization
    return JSON.parse(JSON.stringify(input));
  } catch (e) {
    // Fallback for non-serializable inputs
    debug('program', `Input sanitization failed: ${e}, using original input`);
    return input;
  }
}

/**
 * Creates a properly configured sandbox for code execution
 * @param input The input to make available in the sandbox
 * @returns A VM context with all necessary globals
 */
function createSandbox(input: any): vm.Context {
  // Create sandbox with essential globals
  const sandbox: {
    // Input data
    input: any;
    // Standard globals
    console: typeof console;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    // Standard constructors needed for proper string/regex operations
    String: typeof String;
    RegExp: typeof RegExp;
    Array: typeof Array;
    Object: typeof Object;
    Math: typeof Math;
    JSON: typeof JSON;
    // Result container
    exports: {
      __result?: any;
      __error?: any;
    };
  } = {
    // Input data
    input,
    // Standard globals
    console,
    setTimeout,
    clearTimeout,
    // Standard constructors
    String,
    RegExp,
    Array,
    Object,
    Math,
    JSON,
    // Result container
    exports: {}
  };
  
  return vm.createContext(sandbox);
}

/**
 * Generates code to execute in the sandbox based on analysis
 * @param compiledCode The compiled JavaScript code
 * @param analysis The code analysis results
 * @returns JavaScript code ready for execution
 */
function generateExecutionWrapper(compiledCode: string, analysis: ReturnType<typeof analyzeTypeScriptCode>): string {
  return `
    (function() {
      // Compiled code
      ${compiledCode}
      
      // Execution strategy based on code analysis
      try {
        ${analysis.mainFunction ? 
          // Strategy 1: Execute detected main function
          `if (typeof ${analysis.mainFunction} === 'function') {
            exports.__result = ${analysis.mainFunction}(input);
            return;
          }` : 
          // No function detected
          ''}
        
        ${analysis.resultVariables.length > 0 ? 
          // Strategy 2: Use detected result variables
          analysis.resultVariables.map(varName => 
            `if (typeof ${varName} !== 'undefined') {
              exports.__result = ${varName};
              return;
            }`
          ).join('\n') : 
          // No result variables detected
          ''}
        
        // Strategy 3: If all else fails, try to find any reasonable variable
        // that might contain our result
        for (const key in this) {
          // Skip built-in properties and functions
          if (['input', 'console', 'setTimeout', 'clearTimeout', 'exports', 
               'String', 'RegExp', 'Array', 'Object', 'Math', 'JSON'].includes(key)) continue;
          
          // Skip internal Node.js/V8 properties
          if (key.startsWith('_')) continue;
          
          // If we find an object or non-function value, it might be our result
          if (typeof this[key] !== 'function' && this[key] !== undefined) {
            exports.__result = this[key];
            return;
          }
        }
        
        // If we still don't have a result, return undefined
        exports.__result = undefined;
      } catch (error) {
        // Capture any runtime errors
        exports.__error = error;
      }
      
      // Always return the captured result
      return exports.__result;
    })();
  `;
}

/**
 * Executes code in a sandbox with timeout protection
 * @param code The code to execute
 * @param context The VM context
 * @param timeoutMs Timeout in milliseconds
 */
function executeInSandbox(code: string, context: vm.Context, timeoutMs = 3000): void {
  try {
    // Run with timeout protection
    vm.runInContext(code, context, { timeout: timeoutMs });
  } catch (error: any) {
    // Capture execution errors
    context.exports.__error = error;
    debug('program', `Execution error in sandbox: ${error.message}`);
  }
}

/**
 * Evaluates TypeScript code and returns the result
 * @param code The TypeScript code to evaluate
 * @param functionName Optional name of the function to extract
 * @returns The result of the evaluation
 */
export function evaluateTypeScript(code: string, functionName?: string): any {
  debug('program', 'Compiling TypeScript code');
  const { compiledCode, diagnostics } = compileTypeScript(code);

  // Check for compilation errors (note: transpileModule doesn't do full type checking)
  if (diagnostics.length > 0) {
    const errors = diagnostics
      .map(diag => ts.flattenDiagnosticMessageText(diag.messageText, '\n'));
    const errorMessage = `TypeScript compilation errors:\n${errors.join('\n')}`;
    debug('program', errorMessage);
    throw new Error(errorMessage);
  }

  // Create a sandbox context for evaluation
  const sandbox = createSandbox(null);

  // Wrap the code to capture the result
  let wrappedCode: string;
  if (functionName) {
    // If we know which function to extract
    wrappedCode = `
      (function(exports) {
        ${compiledCode}
        if (typeof ${functionName} !== 'undefined') {
          exports.__result = ${functionName};
        }
      })(exports);
    `;
  } else {
    // Otherwise, analyze the code and try to find the main function or result
    const analysis = analyzeTypeScriptCode(code);
    
    wrappedCode = generateExecutionWrapper(compiledCode, analysis);
  }

  // Execute the code in the sandbox with timeout protection
  executeInSandbox(wrappedCode, sandbox);
  
  // Check for runtime errors
  if (sandbox.exports.__error) {
    debug('program', `Runtime error: ${sandbox.exports.__error}`);
    throw new Error(`Error evaluating TypeScript code: ${sandbox.exports.__error.message || String(sandbox.exports.__error)}`);
  }

  debug('program', 'Code executed successfully');
  // Return the result
  return sandbox.exports.__result;
}

/**
 * Executes TypeScript code with the given input; returns only the result.
 */
export function executeTypeScriptWithInput(code: string, input: any): any {
  const { result } = executeTypeScriptDetailed(code, input);
  // Deep-clone into a null-prototype object to strip sandbox prototypes
  const clean = JSON.parse(JSON.stringify(result));
  return Object.assign(Object.create(null), clean);
}

/**
 * Executes TypeScript code with full VM context; returns both context and result.
 */
export function executeTypeScriptDetailed(code: string, input: any): { context: vm.Context; result: any } {
  debug('program', 'Analyzing TypeScript code structure for detailed execution');
  const analysis = analyzeTypeScriptCode(code);
  const { compiledCode, diagnostics } = compileTypeScript(code);
  if (diagnostics.length > 0) {
    const errors = diagnostics.map(diag => ts.flattenDiagnosticMessageText(diag.messageText, '\n'));
    throw new Error(`TypeScript compilation errors:\n${errors.join('\n')}`);
  }
  const safeInput = sanitizeInput(input);
  debug('program', `Input sanitized, type: ${typeof safeInput}`);
  const context = createSandbox(safeInput);
  debug('program', 'Executing detailed wrapper');
  const wrappedCode = generateExecutionWrapper(compiledCode, analysis);
  executeInSandbox(wrappedCode, context);
  if (context.exports.__error) {
    debug('program', `Runtime error: ${context.exports.__error}`);
    throw context.exports.__error;
  }
  return { context, result: context.exports.__result };
}

/**
 * Detects the main function name in TypeScript code using AST
 * @param code The TypeScript code to analyze
 * @returns The detected function name or undefined if not found
 */
export function detectMainFunction(code: string): string | undefined {
  return analyzeTypeScriptCode(code).mainFunction;
}
