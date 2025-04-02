/**
 * Debug logging utility for Selvedge
 * 
 * Provides a centralized way to manage debug logging across the library.
 */

// Configuration object for debug settings
export interface DebugConfig {
  enabled: boolean;
  namespaces: Record<string, boolean>;
}

// Global debug configuration
const debugConfig: DebugConfig = {
  enabled: false,
  namespaces: {
    program: false,
    persistence: false,
    llm: false,
    core: false,
    all: false
  }
};

/**
 * Log a debug message if debugging is enabled for the given namespace
 * 
 * @param namespace - The debug namespace (e.g., 'program', 'persistence')
 * @param message - The message to log
 * @param args - Additional arguments to log
 */
export function debug(namespace: string, message: string, ...args: any[]): void {
  // Check if debugging is enabled globally and for this namespace
  if (debugConfig.enabled && (debugConfig.namespaces[namespace] || debugConfig.namespaces.all)) {
    console.log(`[${namespace}] ${message}`, ...args);
  }
}

/**
 * Enable or disable debugging globally
 * 
 * @param enabled - Whether debugging should be enabled
 */
export function enableDebug(enabled: boolean): void {
  debugConfig.enabled = enabled;
}

/**
 * Enable or disable debugging for a specific namespace
 * 
 * @param namespace - The namespace to configure
 * @param enabled - Whether debugging should be enabled for this namespace
 */
export function enableNamespace(namespace: string, enabled: boolean): void {
  if (namespace in debugConfig.namespaces) {
    debugConfig.namespaces[namespace] = enabled;
  } else {
    // Add new namespace if it doesn't exist
    debugConfig.namespaces[namespace] = enabled;
  }
}

/**
 * Enable debugging for all namespaces
 */
export function enableAllNamespaces(): void {
  debugConfig.namespaces.all = true;
}

/**
 * Parse a debug string (e.g., 'program,persistence') and enable those namespaces
 * 
 * @param debugString - Comma-separated list of namespaces to enable
 */
export function parseDebugString(debugString: string): void {
  if (!debugString) return;
  
  // Enable debugging globally
  enableDebug(true);
  
  // Split the string by commas and enable each namespace
  const namespaces = debugString.split(',').map(ns => ns.trim());
  
  // Special case for '*' or 'all'
  if (namespaces.includes('*') || namespaces.includes('all')) {
    enableAllNamespaces();
    return;
  }
  
  // Enable each specified namespace
  namespaces.forEach(ns => {
    enableNamespace(ns, true);
  });
}

// Check for DEBUG environment variable
if (typeof process !== 'undefined' && process.env && process.env.DEBUG) {
  parseDebugString(process.env.DEBUG);
}
