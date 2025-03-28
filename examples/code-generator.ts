/**
 * Code Generator Example
 * 
 * This example demonstrates how to use the selvedge program generation system
 * to create utility functions based on natural language descriptions.
 */
import { selvedge } from '../src';

// First, let's register our models
// In a real application, you would use actual OpenAI or Anthropic models
// For this example, we'll use the mock provider for demonstration
selvedge.models({
  // Fast but less accurate model for simple tasks
  fast: selvedge.mock('fast-model'),
  
  // More powerful model for complex analysis
  smart: selvedge.mock('smart-model'),
});

// Set up the mock responses for demonstration
setupMockResponses();

// Create a program template for generating JavaScript utility functions
const generateUtilityFunction = selvedge.program`
Generate a JavaScript utility function based on the following description.
The function should be well-documented with JSDoc comments and include error handling.
`.withExamples([
  {
    input: { 
      description: "A function that checks if a string is a valid email address",
      name: "isValidEmail" 
    },
    output: `/**
 * Checks if a string is a valid email address
 * @param {string} email - The email address to validate
 * @returns {boolean} - True if the email is valid, false otherwise
 */
function isValidEmail(email) {
  if (typeof email !== 'string') {
    throw new TypeError('Email must be a string');
  }
  
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}`
  },
  {
    input: { 
      description: "A function that formats a number as currency",
      name: "formatCurrency" 
    },
    output: `/**
 * Formats a number as currency
 * @param {number} amount - The amount to format
 * @param {string} [currencyCode='USD'] - The currency code (e.g., 'USD', 'EUR')
 * @param {string} [locale='en-US'] - The locale to use for formatting
 * @returns {string} - The formatted currency string
 */
function formatCurrency(amount, currencyCode = 'USD', locale = 'en-US') {
  if (typeof amount !== 'number') {
    throw new TypeError('Amount must be a number');
  }
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode
  }).format(amount);
}`
  }
]).using("fast");

// Function to generate utility functions based on descriptions
async function generateFunctions(descriptions: Array<{ description: string, name: string }>) {
  console.log("🧪 Code Generator Example");
  console.log("==========================\n");
  
  for (const { description, name } of descriptions) {
    console.log(`Generating function: ${name}`);
    console.log(`Description: ${description}`);
    
    try {
      // Generate the function code
      const code = await generateUtilityFunction.generate({ 
        description, 
        name 
      }, {
        temperature: 0.2,
        includeExplanations: false
      });
      
      console.log("\nGenerated code:");
      console.log("```javascript");
      console.log(code);
      console.log("```\n");
    } catch (error) {
      console.error(`Error generating function ${name}:`, error);
    }
    
    console.log("---------------------------\n");
  }
}

// Function to set up mock responses
function setupMockResponses() {
  const mockAdapter = ModelRegistry.getAdapter({
    provider: selvedge.mock('fast-model').provider,
    model: 'fast-model'
  });
  
  if (!mockAdapter || typeof mockAdapter.setResponses !== 'function') {
    console.error('Mock adapter not available or does not support setResponses');
    return;
  }
  
  // Set up mock responses for different function descriptions
  mockAdapter.setResponses({
    chat: (messages: any[]) => {
      const userMessage = messages.find(m => m.role === 'user')?.content || '';
      
      if (userMessage.includes('debounce')) {
        return `/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last time it was invoked.
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @returns {Function} - The debounced function
 */
function debounce(func, wait) {
  if (typeof func !== 'function') {
    throw new TypeError('Expected a function');
  }
  
  let timeout;
  
  return function(...args) {
    const context = this;
    
    clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}`;
      } else if (userMessage.includes('deep clone')) {
        return `/**
 * Creates a deep clone of an object or array
 * @param {*} obj - The object to clone
 * @returns {*} - A deep clone of the input
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const clone = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(obj[key]);
    }
  }
  
  return clone;
}`;
      } else if (userMessage.includes('random')) {
        return `/**
 * Generates a random integer between min and max (inclusive)
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} - A random integer between min and max
 */
function getRandomInt(min, max) {
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new TypeError('Min and max must be numbers');
  }
  
  min = Math.ceil(min);
  max = Math.floor(max);
  
  if (min > max) {
    throw new Error('Min cannot be greater than max');
  }
  
  return Math.floor(Math.random() * (max - min + 1)) + min;
}`;
      } else {
        return `/**
 * Default generated function
 * @param {any} input - The input parameter
 * @returns {any} - The result
 */
function processInput(input) {
  if (input === null || input === undefined) {
    throw new Error('Input cannot be null or undefined');
  }
  
  // Process the input
  return input;
}`;
      }
    }
  });
}

// Import ModelRegistry for mock setup
import { ModelRegistry } from '../src/lib/models';

// Example function descriptions
const functionDescriptions = [
  {
    name: "debounce",
    description: "A function that limits how often a function can be called, waiting until a specified time has passed since the last call."
  },
  {
    name: "deepClone",
    description: "A function that creates a deep clone of an object or array, copying all nested properties."
  },
  {
    name: "getRandomInt",
    description: "A function that generates a random integer between a minimum and maximum value (inclusive)."
  }
];

// Run the example
generateFunctions(functionDescriptions).catch(console.error);
