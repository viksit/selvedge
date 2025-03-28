/**
 * Core functionality for the Selvedge library
 */

/**
 * A simple example function
 * 
 * @param input - The input string to process
 * @returns The processed string
 */
export function process(input: string): string {
  return `Selvedge processed: ${input}`;
}

/**
 * Version information for the library
 */
export const version = {
  major: 0,
  minor: 1,
  patch: 0,
  toString: () => `${version.major}.${version.minor}.${version.patch}`
};
