/**
 * Object formatting utilities for Selvedge
 * 
 * This module provides utilities for formatting objects into readable strings
 * for use in prompt templates and other text-based contexts.
 */

import { debug } from './debug';

/**
 * Options for formatting objects
 */
export interface FormatterOptions {
  /** Maximum depth for nested objects */
  maxDepth?: number;
  /** Maximum number of items to show in arrays */
  maxArrayItems?: number;
  /** Maximum length of strings */
  maxStringLength?: number;
  /** Indentation for nested objects */
  indent?: string;
  /** Current depth level (used internally) */
  currentDepth?: number;
}

/**
 * Default formatting options
 */
const DEFAULT_OPTIONS: FormatterOptions = {
  maxDepth: 5,
  maxArrayItems: 10,
  maxStringLength: 100,
  indent: '  ',
  currentDepth: 0,
};

/**
 * Format any value into a readable string representation
 * 
 * This function intelligently formats different data types:
 * - Objects are formatted as key-value pairs
 * - Arrays are formatted as lists
 * - Primitives are formatted directly
 * - Null/undefined values are handled gracefully
 * 
 * @param value - The value to format
 * @param options - Formatting options
 * @returns A readable string representation of the value
 */
export function formatValue(value: any, options: FormatterOptions = {}): string {
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Handle null/undefined
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    
    // Handle primitives
    if (typeof value === 'string') return formatString(value, opts);
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'function') return '[Function]';
    
    // Handle Date objects
    if (value instanceof Date) return value.toISOString();
    
    // Check for circular references or max depth
    if (opts.currentDepth && opts.currentDepth >= (opts.maxDepth || DEFAULT_OPTIONS.maxDepth!)) {
      return typeof value === 'object' ? (Array.isArray(value) ? '[Array]' : '[Object]') : String(value);
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return formatArray(value, opts);
    }
    
    // Handle objects
    if (typeof value === 'object') {
      return formatObject(value, opts);
    }
    
    // Default fallback
    return String(value);
  } catch (error) {
    debug('formatter', 'Error formatting value:', error);
    return '[Error: Unable to format value]';
  }
}

/**
 * Format a string value
 */
function formatString(value: string, options: FormatterOptions): string {
  const { maxStringLength } = options;
  
  if (maxStringLength && value.length > maxStringLength) {
    return `${value.substring(0, maxStringLength)}...`;
  }
  
  return value;
}

/**
 * Format an array value
 */
function formatArray(value: any[], options: FormatterOptions): string {
  const { maxArrayItems, currentDepth = 0, indent = '  ' } = options;
  
  // Handle empty arrays
  if (value.length === 0) return '[]';
  
  // Create new options for nested items
  const nestedOptions: FormatterOptions = {
    ...options,
    currentDepth: currentDepth + 1,
  };
  
  // Limit the number of items
  const items = maxArrayItems && value.length > maxArrayItems
    ? value.slice(0, maxArrayItems)
    : value;
  
  // Format each item
  const formattedItems = items.map(item => 
    `${indent.repeat(currentDepth + 1)}${formatValue(item, nestedOptions)}`
  );
  
  // Add ellipsis if items were truncated
  if (maxArrayItems && value.length > maxArrayItems) {
    formattedItems.push(`${indent.repeat(currentDepth + 1)}... (${value.length - maxArrayItems} more items)`);
  }
  
  // Join items with newlines
  return `[\n${formattedItems.join(',\n')}\n${indent.repeat(currentDepth)}]`;
}

/**
 * Format an object value
 */
function formatObject(value: Record<string, any>, options: FormatterOptions): string {
  const { currentDepth = 0, indent = '  ' } = options;
  
  // Get object keys
  const keys = Object.keys(value);
  
  // Handle empty objects
  if (keys.length === 0) return '{}';
  
  // Create new options for nested values
  const nestedOptions: FormatterOptions = {
    ...options,
    currentDepth: currentDepth + 1,
  };
  
  // Format each key-value pair
  const formattedPairs = keys.map(key => {
    const formattedValue = formatValue(value[key], nestedOptions);
    return `${indent.repeat(currentDepth + 1)}${key}: ${formattedValue}`;
  });
  
  // Join pairs with newlines
  return `{\n${formattedPairs.join(',\n')}\n${indent.repeat(currentDepth)}}`;
}

/**
 * Format an object for display in a prompt
 * 
 * This is the main entry point for formatting objects in prompt templates.
 * It formats the object in a way that's readable in a prompt context.
 * 
 * @param value - The value to format
 * @param options - Formatting options
 * @returns A formatted string suitable for inclusion in a prompt
 */
export function formatForPrompt(value: any, options: FormatterOptions = {}): string {
  // Handle undefined or null
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  
  // For simple values, just use direct formatting
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  // For objects and arrays, use a more structured format
  try {
    // For Product objects, use a more readable format
    if (typeof value === 'object' && 'title' in value && 'description' in value) {
      // This looks like a product object, format it in a more readable way
      const product = value as any;
      let result = '';
      
      if (product.title) result += `Title: ${product.title}\n`;
      if (product.price !== undefined) result += `Price: ${product.price}\n`;
      if (product.rating !== undefined) result += `Rating: ${product.rating || 'N/A'}\n`;
      if (product.reviewCount !== undefined) result += `Review Count: ${product.reviewCount}\n`;
      if (product.description) result += `Description: ${product.description}\n`;
      
      if (Array.isArray(product.features) && product.features.length > 0) {
        result += `Features:\n`;
        product.features.forEach((feature: string) => {
          result += `- ${feature}\n`;
        });
      }
      
      return result.trim();
    }
    
    // Format the value
    const formatted = formatValue(value, options);
    
    // For objects and arrays, add a type hint
    if (Array.isArray(value)) {
      return `Array with ${value.length} items:\n${formatted}`;
    } else if (typeof value === 'object') {
      return `Object with properties:\n${formatted}`;
    }
    
    return formatted;
  } catch (error) {
    debug('formatter', 'Error formatting for prompt:', error);
    return String(value);
  }
}
